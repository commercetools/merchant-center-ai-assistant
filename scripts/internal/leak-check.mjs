#!/usr/bin/env node
// INTERNAL ONLY (listed in scripts/internal-paths.json, removed from the publication).
// Repository-specific leak scan on top of the private gate.
// Usage: node scripts/internal/leak-check.mjs --root <dir> [--policy-dir <dir with policy.json>] [--json]
// Prints `BLOCK path:line match` and `REVIEW path:line match`; exit 1 if any BLOCK, else 0.
// The private policy file is only read to turn customer names into patterns; it is never printed.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SKIP_DIRS = new Set(['.git', 'node_modules']);

/** Same rule as the gate: escape, then let a space match a space or a hyphen. */
export function nameToPattern(name) {
  return name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '[\\s-]?');
}

export function loadPatterns(patternFile = join(HERE, 'leak-patterns.json'), policy = null) {
  const j = JSON.parse(readFileSync(patternFile, 'utf8'));
  const names = (policy && policy.block && Array.isArray(policy.block.names) ? policy.block.names : []).map(
    (n) => `\\b${nameToPattern(n)}\\b`,
  );
  return {
    block: [...(j.block || []), ...(j.blockPrivate || []), ...names],
    review: j.review || [],
  };
}

export function isBinary(buf) {
  return buf.subarray(0, 8192).includes(0);
}

/** Scan text; returns [{line, match, context, pattern}] (first match of each pattern per line). */
export function scanText(text, patterns) {
  const out = [];
  const res = patterns.map((p) => new RegExp(p, 'i'));
  text.split('\n').forEach((line, i) => {
    res.forEach((re, k) => {
      const m = re.exec(line);
      if (m) out.push({ line: i + 1, match: m[0], context: line.trim().slice(0, 150), pattern: patterns[k] });
    });
  });
  return out;
}

export function walk(root) {
  const files = [];
  const rec = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name)) rec(join(dir, e.name));
      } else if (e.isFile()) files.push(join(dir, e.name));
    }
  };
  rec(root);
  return files.sort();
}

export function scanTree(root, { block, review }) {
  const result = { block: [], review: [], files: 0, skippedBinary: 0 };
  for (const file of walk(root)) {
    const buf = readFileSync(file);
    if (isBinary(buf)) {
      result.skippedBinary++;
      continue;
    }
    result.files++;
    const path = relative(root, file);
    const text = buf.toString('utf8');
    for (const h of scanText(text, block)) result.block.push({ path, ...h });
    for (const h of scanText(text, review)) result.review.push({ path, ...h });
  }
  return result;
}

function main() {
  const argv = process.argv.slice(2);
  const opt = (n) => {
    const i = argv.indexOf(`--${n}`);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const root = opt('root');
  if (!root || !existsSync(root) || !statSync(root).isDirectory()) {
    console.error('usage: node leak-check.mjs --root <dir> [--policy-dir <dir>]');
    process.exit(2);
  }
  let policy = null;
  const policyDir = opt('policy-dir');
  if (policyDir) {
    try {
      policy = JSON.parse(readFileSync(join(policyDir, 'policy.json'), 'utf8'));
    } catch {
      // never echo the file or the parser message (it may quote content)
      console.error('cannot read or parse policy.json in --policy-dir');
      process.exit(2);
    }
  } else {
    console.error('WARNING: no --policy-dir: customer names are NOT checked');
  }
  const r = scanTree(root, loadPatterns(join(HERE, 'leak-patterns.json'), policy));
  for (const h of r.block) console.log(`BLOCK ${h.path}:${h.line} ${h.match.slice(0, 80)}  | ${h.context}`);
  for (const h of r.review) console.log(`REVIEW ${h.path}:${h.line} ${h.match.slice(0, 80)}`);
  console.log(`leak-check: ${r.files} text file(s), ${r.skippedBinary} binary skipped, ${r.block.length} BLOCK, ${r.review.length} REVIEW`);
  process.exit(r.block.length ? 1 : 0);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
