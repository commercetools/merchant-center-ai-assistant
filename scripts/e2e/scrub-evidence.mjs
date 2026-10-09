#!/usr/bin/env node
/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */
// Scrub pass for E2E evidence (called by collect-evidence.sh before report.mjs).
// Usage: node scripts/e2e/scrub-evidence.mjs <evidence-dir>
// Redacts in place: authorization and cookie header values, bearer tokens, JWTs, provider keys
// (sk_, rk_, pk_), e-mail addresses (except example domains), deployed service hosts, tunnel hosts.
// Refuses (exit 2, nothing rewritten) when a private key block is found: that file must be reviewed.
// Exit codes: 0 clean or redacted, 2 refusal or usage error. Counts are printed, never the matches.
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const TEXT_FILE = /\.(txt|json|jsonl|md|log|har|html|csv)$/i;
const MAX_BYTES = 50 * 1024 * 1024;

export const REFUSE = [/-----BEGIN [A-Z ]*PRIVATE KEY-----/];

/** Ordered redaction rules: [label, pattern, replacement]. */
export const RULES = [
  ['header', /("?(?:authorization|cookie|set-cookie|x-forward-authorization)"?\s*[:=]\s*"?)([^"\r\n]{4,})/gi, '$1<redacted>'],
  ['bearer', /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/g, 'Bearer <redacted>'],
  ['jwt', /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{4,}/g, '<jwt>'],
  ['provider-key', /\b(?:sk|rk|pk)_(?:test|live)_[A-Za-z0-9]{8,}/g, '<provider-key>'],
  ['deployed-host', /\bhttps?:\/\/[a-z0-9-]+(?:\.[a-z0-9-]+)*\.commercetools\.app\b/gi, 'https://<deployed-service-host>'],
  ['tunnel-host', /\bhttps?:\/\/[a-z0-9-]+\.(?:trycloudflare\.com|ngrok(?:-free)?\.(?:app|io|dev))\b/gi, 'https://<tunnel-host>'],
  ['email', /\b[A-Za-z0-9._%+-]+@(?!example\.(?:com|org|test)\b)[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+\b/g, '<email>'],
];

/** Returns `{ text, counts }` for one file's content, or `{ refused: true }`. */
export function scrubContent(text) {
  if (REFUSE.some((re) => re.test(text))) return { refused: true };
  const counts = {};
  let out = text;
  for (const [label, re, replacement] of RULES) {
    out = out.replace(re, (...args) => {
      counts[label] = (counts[label] ?? 0) + 1;
      return replacement.replace(/\$(\d)/g, (_m, i) => args[Number(i)] ?? '');
    });
  }
  return { text: out, counts };
}

function* walk(dir) {
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) yield* walk(full);
    else if (TEXT_FILE.test(name) && st.size <= MAX_BYTES) yield full;
  }
}

/** Scrubs every text file below `dir`. Returns `{ refused: string[], changed: number, counts }`. */
export function scrubTree(dir) {
  const pending = [];
  const refused = [];
  const counts = {};
  for (const file of walk(dir)) {
    const before = readFileSync(file, 'utf8');
    const r = scrubContent(before);
    if (r.refused) {
      refused.push(file);
      continue;
    }
    for (const [k, n] of Object.entries(r.counts)) counts[k] = (counts[k] ?? 0) + n;
    if (r.text !== before) pending.push([file, r.text]);
  }
  if (refused.length === 0) for (const [file, text] of pending) writeFileSync(file, text);
  return { refused, changed: refused.length === 0 ? pending.length : 0, counts };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dir = process.argv[2];
  if (!dir) {
    console.error('usage: scrub-evidence.mjs <evidence-dir>');
    process.exit(2);
  }
  const r = scrubTree(dir);
  if (r.refused.length > 0) {
    console.error(`scrub: refusing, ${r.refused.length} file(s) contain a private key block (review and delete them):`);
    for (const f of r.refused) console.error(`  ${f}`);
    process.exit(2);
  }
  if (r.changed > 0) console.error(`scrub: redacted ${JSON.stringify(r.counts)} in ${r.changed} file(s)`);
  process.exit(0);
}
