#!/usr/bin/env node
/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */
// Builds report.md from the result.json files below an evidence run folder.
// Usage: node scripts/e2e/report.mjs <run-folder>
// Exit code 1 when any scenario has status FAIL (BLOCKED and SKIPPED do not fail the report but are counted).
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const STATUS_RE = /^(PASS|FAIL|FLAKE-PASS|SKIPPED\(.+\)|BLOCKED\(.+\)|NOT RUN)$/;

/** Reads <run>/<scenario>/result.json for every scenario folder, sorted by id. */
export function readResults(runDir) {
  return readdirSync(runDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(runDir, d.name, 'result.json')))
    .map((d) => {
      const r = JSON.parse(readFileSync(join(runDir, d.name, 'result.json'), 'utf8'));
      return { folder: d.name, ...r, id: r.id ?? d.name };
    })
    .sort((a, b) => a.id.localeCompare(b.id));
}

export function statusKind(status) {
  const s = String(status ?? '');
  if (!STATUS_RE.test(s)) return 'INVALID';
  return s.split('(')[0];
}

export function buildReport(runId, results) {
  const totals = {};
  for (const r of results) totals[statusKind(r.status)] = (totals[statusKind(r.status)] ?? 0) + 1;
  const rows = results.map((r) => {
    const ms = Number.isFinite(r.durationMs) ? `${Math.round(r.durationMs / 1000)} s` : '';
    const notes = String(r.notes ?? '').replace(/\|/g, '/').replace(/\s+/g, ' ').slice(0, 160);
    return `| ${r.id} | ${r.title ?? ''} | ${r.env ?? ''} | ${r.status} | ${ms} | [${r.folder}](./${r.folder}/) | ${notes} |`;
  });
  const failed = results.filter((r) => statusKind(r.status) === 'FAIL' || statusKind(r.status) === 'INVALID');
  return {
    failed: failed.length,
    text: [
      `# E2E report ${runId}`,
      '',
      `Scenarios: ${results.length}. ${Object.entries(totals).map(([k, v]) => `${k}: ${v}`).join(', ') || 'none'}.`,
      '',
      '| id | title | env | status | duration | evidence | notes |',
      '|---|---|---|---|---|---|---|',
      ...rows,
      '',
    ].join('\n'),
  };
}

export function writeReport(runDir) {
  const runId = runDir.split('/').filter(Boolean).pop();
  const { text, failed } = buildReport(runId, readResults(runDir));
  writeFileSync(join(runDir, 'report.md'), text);
  return failed;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!process.argv[2]) {
    console.error('usage: report.mjs <run-folder>');
    process.exit(2);
  }
  const failed = writeReport(process.argv[2]);
  console.log(`report written, failed: ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
}
