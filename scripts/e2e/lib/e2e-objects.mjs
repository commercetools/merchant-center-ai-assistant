/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */
// Pure helpers shared by cleanup.mjs, co.mjs and their tests (no network, no secrets).

export const MARKER = 'e2e-';
export const CONTAINER_PREFIX = 'ai-assistant-';
export const COMPOSED_PAGES_CONTAINER = 'shared-composed-pages';

/** Containers a sweep may look into: the service's own and the composed pages container. */
export function isSweepContainer(container) {
  return typeof container === 'string' && (container.startsWith(CONTAINER_PREFIX) || container === COMPOSED_PAGES_CONTAINER);
}

/** Settings and identity data (tokens, PKCE states, bindings) are never deleted by the E2E helpers. */
export function isProtectedContainer(container) {
  return (
    typeof container === 'string' &&
    (container.startsWith(`${CONTAINER_PREFIX}settings`) || container.startsWith(`${CONTAINER_PREFIX}identity-`))
  );
}

/**
 * The hard guard of every deletion: true only for objects that carry the test marker in their key,
 * or (service containers only) in the title or comment of the stored value. Settings, tokens and
 * auth states never match, whatever their content.
 */
export function isE2eObject(container, key, value) {
  if (!isSweepContainer(container) || typeof key !== 'string') return false;
  if (isProtectedContainer(container)) return false;
  if (key.startsWith(MARKER)) return true;
  if (container === `${CONTAINER_PREFIX}sessions` || container === `${CONTAINER_PREFIX}feedback`) {
    const v = value && typeof value === 'object' ? value : {};
    return [v.title, v.comment].some((s) => typeof s === 'string' && s.startsWith(MARKER));
  }
  return false;
}

/** Objects older than `maxAgeHours` (by `lastModifiedAt`), for the sweep. */
export function isOlderThan(object, maxAgeHours, now = Date.now()) {
  const t = Date.parse(object.lastModifiedAt ?? object.createdAt ?? '');
  if (Number.isNaN(t)) return false;
  return now - t > maxAgeHours * 3_600_000;
}

/** Structural view of a value: keys and types, string contents never shown (secrets, ciphertext, prose). */
export function shapeOf(value, depth = 0) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return depth > 3 ? `array(${value.length})` : [`array(${value.length})`, ...(value.length ? [shapeOf(value[0], depth + 1)] : [])];
  if (typeof value === 'object') {
    if (depth > 3) return 'object';
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, shapeOf(v, depth + 1)]));
  }
  if (typeof value === 'string') return `string(${value.length})`;
  return typeof value;
}

/** Counts how often each needle occurs in the JSON text of a value, without returning any text. */
export function countNeedles(value, needles) {
  const text = JSON.stringify(value ?? null);
  return Object.fromEntries(needles.map((n) => [n, text.split(n).length - 1]));
}
