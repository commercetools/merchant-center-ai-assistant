/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

// Shim for the deprecated `@types/json-stable-stringify` stub package, which ships
// `"main": ""` and no `index.d.ts`. tsc scans `node_modules/@types` as an implicit
// type library, fails to resolve that entry point, and aborts the whole program with
// TS2688 - which silently turns `yarn typecheck` into a no-op.
//
// `json-stable-stringify` provides its own types, so nothing real is needed here;
// this file only has to exist so `@types-extensions` (listed earlier in tsconfig's
// `typeRoots`) shadows the broken package.
declare module 'json-stable-stringify';
export {};
