/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

/**
 * Normalises a table reference to `project.dataset.table` (backticks removed). One part is a
 * table of the default dataset, two parts are `dataset.table`. Anything else is `undefined`.
 * Comparison is exact: BigQuery table ids are case-sensitive.
 */
export function normaliseRef(
  ref: string,
  defaults: { projectId: string; datasetId: string }
): string | undefined {
  const parts = ref.replace(/`/g, '').trim().split('.');
  if (parts.some((p) => p.length === 0)) return undefined;
  if (parts.length === 1) return `${defaults.projectId}.${defaults.datasetId}.${parts[0]}`;
  if (parts.length === 2) return `${defaults.projectId}.${parts[0]}.${parts[1]}`;
  if (parts.length === 3) return parts.join('.');
  return undefined;
}

type Token =
  | { kind: 'word'; text: string }
  | { kind: 'ident'; text: string }
  | { kind: 'punct'; text: string };

function skipLine(sql: string, from: number): number {
  let i = from;
  while (i < sql.length && sql[i] !== '\n') i++;
  return i;
}

function skipBlockComment(sql: string, from: number): number {
  const end = sql.indexOf('*/', from + 2);
  return end === -1 ? sql.length : end + 2;
}

/** String literal (also triple-quoted and raw/escaped forms: conservative skip). */
function skipString(sql: string, from: number): number {
  const c = sql[from];
  const triple = sql.startsWith(c.repeat(3), from);
  const quote = triple ? c.repeat(3) : c;
  let i = from + quote.length;
  while (i < sql.length && !sql.startsWith(quote, i)) i += sql[i] === '\\' ? 2 : 1;
  return i + quote.length;
}

/** Returns the end of the word starting at `from`; a trailing '-' or '.' is not part of it. */
function wordEnd(sql: string, from: number): number {
  let j = from;
  while (j < sql.length && /[A-Za-z0-9_.-]/.test(sql[j])) j++;
  while (/[-.]/.test(sql[j - 1])) j--;
  return j;
}

/** Splits SQL into words, backticked identifiers and punctuation; drops comments and strings. */
function tokenize(sql: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < sql.length) {
    const c = sql[i];
    const next = sql[i + 1];
    if ((c === '-' && next === '-') || c === '#') {
      i = skipLine(sql, i);
    } else if (c === '/' && next === '*') {
      i = skipBlockComment(sql, i);
    } else if (c === "'" || c === '"') {
      i = skipString(sql, i);
    } else if (c === '`') {
      const end = sql.indexOf('`', i + 1);
      tokens.push({ kind: 'ident', text: sql.slice(i + 1, end === -1 ? sql.length : end) });
      i = end === -1 ? sql.length : end + 1;
    } else if (/[A-Za-z_]/.test(c)) {
      const j = wordEnd(sql, i);
      tokens.push({ kind: 'word', text: sql.slice(i, j) });
      i = j;
    } else if (/\s/.test(c)) {
      i++;
    } else {
      tokens.push({ kind: 'punct', text: c });
      i++;
    }
  }
  return tokens;
}

/** Functions whose argument syntax contains a `FROM` that is NOT a table source. */
const FROM_INSIDE = new Set(['EXTRACT', 'TRIM', 'LTRIM', 'RTRIM', 'SUBSTRING', 'SUBSTR', 'OVERLAY']);

const CLAUSE_WORDS = new Set([
  'WHERE', 'GROUP', 'ORDER', 'LIMIT', 'JOIN', 'INNER', 'LEFT', 'RIGHT', 'FULL', 'CROSS',
  'ON', 'USING', 'HAVING', 'UNION', 'INTERSECT', 'EXCEPT', 'WINDOW', 'QUALIFY', 'FOR', 'TABLESAMPLE',
]);

/**
 * FALLBACK ONLY: the table identifiers a SELECT reads, used when a dry run does
 * not report `referencedTables`. Conservative: it returns every identifier that follows
 * `FROM`/`JOIN` (and a comma after a table in a FROM list is NOT followed, so such queries
 * are rejected as unparseable by the caller via `unsupported`). CTE names, `UNNEST(...)` and
 * sub-queries are not tables.
 */
export function extractReferencedTables(sql: string): {
  refs: string[];
  unsupported: boolean;
} {
  const tokens = tokenize(sql);
  const ctes = collectCteNames(tokens);
  const refs: string[] = [];
  let unsupported = false;

  // Parenthesis stack: the word before each '(' tells whether its FROM is a table source.
  const stack: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (isPunct(t, '(')) {
      const prev = tokens[i - 1];
      stack.push(prev && prev.kind === 'word' ? prev.text.toUpperCase() : '');
      continue;
    }
    if (isPunct(t, ')')) {
      stack.pop();
      continue;
    }
    if (t.kind !== 'word') continue;
    const upper = t.text.toUpperCase();
    if (upper !== 'FROM' && upper !== 'JOIN') continue;
    if (upper === 'FROM' && FROM_INSIDE.has(stack[stack.length - 1] ?? '')) continue;

    const target = tokens[i + 1];
    if (!target) {
      unsupported = true;
      continue;
    }
    if (isNonTableTarget(target) || ctes.has(target.text)) continue;
    refs.push(target.text);
    if (followedByComma(tokens, i + 2)) unsupported = true;
  }
  return { refs, unsupported };
}

function isPunct(t: Token | undefined, text: string): boolean {
  return t?.kind === 'punct' && t.text === text;
}

/** Names introduced by `WITH name AS (` and `, name AS (`. */
function collectCteNames(tokens: Token[]): Set<string> {
  const ctes = new Set<string>();
  for (let i = 0; i + 2 < tokens.length; i++) {
    const [a, b, c] = [tokens[i], tokens[i + 1], tokens[i + 2]];
    const isName = a.kind === 'word' || a.kind === 'ident';
    if (isName && b.kind === 'word' && b.text.toUpperCase() === 'AS' && isPunct(c, '(')) {
      ctes.add(a.text);
    }
  }
  return ctes;
}

/** A sub-query or `UNNEST(...)` after FROM/JOIN is not a table. */
function isNonTableTarget(target: Token): boolean {
  return target.kind === 'punct' || (target.kind === 'word' && target.text.toUpperCase() === 'UNNEST');
}

/** `FROM a, b` / `FROM a AS x, b` (comma join) cannot be followed reliably. */
function followedByComma(tokens: Token[], aliasIndex: number): boolean {
  let j = aliasIndex;
  const alias = tokens[j];
  if (alias?.kind === 'word') {
    if (alias.text.toUpperCase() === 'AS') j += 2;
    else if (!CLAUSE_WORDS.has(alias.text.toUpperCase())) j += 1;
  }
  return isPunct(tokens[j], ',');
}
