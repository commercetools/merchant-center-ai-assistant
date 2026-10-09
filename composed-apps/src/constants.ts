/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

// Make sure to import the helper functions from the `ssr` entry point.
import { entryPointUriPathToPermissionKeys } from '@commercetools-frontend/application-shell/ssr';
import type { ApplicationWindow } from '@commercetools-frontend/constants';

declare let window: ApplicationWindow;

// `${env:ENTRY_POINT_URI_PATH}` in `custom-application-config.mjs` is only substituted
// into that file's own exported config strings by the config loader, it never reaches
// code the file imports. Two runtimes load this module instead: the Node process that
// imports `custom-application-config.mjs` (real `process.env`) and the browser, where
// `mc-scripts compile-html` has already baked the same resolved value into
// `window.app.entryPointUriPath`.
export const entryPointUriPath =
  (typeof process !== 'undefined' && process.env.ENTRY_POINT_URI_PATH) ||
  window.app.entryPointUriPath;

// Only the default View/Manage permission pair: it gates access to the app and the
// Merchant Center GraphQL proxy. Administrator status is decided by the service
// (ADMIN_USER_IDS), never by a Merchant Center permission.
export const PERMISSIONS = entryPointUriPathToPermissionKeys(entryPointUriPath);

// Custom Object container shared by the composed pages written by the chat app (change P)
// and read by the pages app (change R) and the service.
export const SHARED_COMPOSED_PAGES_CONTAINER_KEY = 'shared-composed-pages';
