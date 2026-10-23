/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

/**
 * The composed-page contract between this service and the frontends (mc-app, composed-apps).
 *
 * This module is the ONLY definition of the schema version, the URI scheme, the Custom
 * Object container, the code encoding and the "is this transpiled script usable" check.
 * It imports nothing from persistence or commercetools clients: the service never stores
 * pages, the frontends do (see `service/contract/composed-page.fixture.json` for the shared sample).
 */

import { parse } from '@babel/parser';

/** The page schema version the tool emits. A future version is a new union member. */
export const COMPOSED_PAGE_SCHEMA_VERSION = '5.0' as const;

/** Custom Object container the frontends store pages in. Changes only by maintainer decision. */
export const COMPOSED_PAGES_CONTAINER_KEY = 'shared-composed-pages';

/** Scheme + host of every composed-page URI; the frontend detects pages by this prefix. */
export const COMPOSED_PAGE_URI_PREFIX = 'ui://composed-page/';

const URI_RE = /^ui:\/\/composed-page\/([^/]+)\/v(\d+)$/;

export const buildComposedPageUri = (key: string, version: number): string =>
  `${COMPOSED_PAGE_URI_PREFIX}${key}/v${version}`;

export const parseComposedPageUri = (
  uri: string
): { key: string; version: number } | null => {
  const match = URI_RE.exec(uri);
  return match ? { key: match[1], version: Number(match[2]) } : null;
};

/** base64 of the UTF-8 bytes. */
export const encodeCode = (text: string): string =>
  Buffer.from(text, 'utf8').toString('base64');

export const decodeCode = (base64: string): string =>
  Buffer.from(base64, 'base64').toString('utf8');

/** Consumers switch on `version`; anything else is an "unsupported page" notice. */
export const isSupportedSchema = (schema: { version?: string }): boolean =>
  schema.version === COMPOSED_PAGE_SCHEMA_VERSION;

/**
 * Is `script` (the decoded `transpiledCode`) a script that evaluates to the component?
 * It must parse as a plain script, start with the function declaration and end with the
 * expression statement `name;`. This replaces the frontends' old regex test for `return`,
 * which rejected every component that has hooks before its return.
 */
export function isUsableTranspiledCode(script: string, name: string): boolean {
  try {
    const body = parse(script, { sourceType: 'script' }).program.body;
    if (body.length < 2) return false;
    const first = body[0];
    const last = body[body.length - 1];
    return (
      first.type === 'FunctionDeclaration' &&
      first.id?.name === name &&
      last.type === 'ExpressionStatement' &&
      last.expression.type === 'Identifier' &&
      last.expression.name === name
    );
  } catch {
    return false;
  }
}

// ----------------------------------------------------------------------------------------
// Types shared with the frontends (mirrors mc-app/src/types/composed-page.ts)
// ----------------------------------------------------------------------------------------

export type TGraphQLVariable = {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'array';
  value?: unknown;
  fromContext?: 'projectKey' | 'dataLocale' | 'userId';
  fromUrl?: string;
};

export type TDataSource = {
  id: string;
  name: string;
  query: string;
  variables?: TGraphQLVariable[];
  target?: 'COMMERCETOOLS_PLATFORM';
  pollInterval?: number;
};

export type TImportDefinition = {
  source: 'react' | 'commercetools' | 'react-router-dom' | 'custom' | 'library';
  items: string[];
  from?: string;
};

export type TComponentDefinition = {
  name: string;
  dataSources: TDataSource[];
  imports: TImportDefinition[];
  code: {
    /** base64 UTF-8 component body as written by the model */
    text: string;
    /** base64 UTF-8 script; evaluating it returns the component function */
    transpiledCode: string;
  };
};

export type TPageSchemaV5 = {
  version: typeof COMPOSED_PAGE_SCHEMA_VERSION;
  title: string;
  description: string;
  components: TComponentDefinition[];
  props: Record<string, unknown>;
};

/** What the tool returns on success. */
export type TComposedPageOutput = {
  success: true;
  uri: string;
  schema: TPageSchemaV5;
};

/** Value of one Custom Object in the container (written by the frontends). */
export type TComposedPageStoredValue = {
  name: string;
  icon?: string;
  schema: TPageSchemaV5;
  isPublished: boolean;
  createdBy?: string;
};

export type TRouteInfo = {
  basePath: string;
  baseUrl: string;
  params: Record<string, string>;
  pathname: string;
  search: string;
};

export type TRenderData = {
  data: Record<string, unknown>;
  loading: Record<string, boolean>;
  errors: Record<string, string | null>;
  formValues: Record<string, unknown>;
  projectKey: string;
  dataLocale: string;
  routeInfo: TRouteInfo;
};

export type TUIAction =
  | {
      type: 'mutation';
      mutation: string;
      variables?: Record<string, unknown>;
      successMessage?: string;
      errorMessage?: string;
      refetchDataSources?: string[];
    }
  | { type: 'navigate'; to: string; params?: Record<string, string> }
  | { type: 'openModal'; modalId: string }
  | { type: 'closeModal' }
  | {
      type: 'notification';
      kind: 'success' | 'error' | 'info' | 'warning';
      message: string;
    }
  | { type: 'setFormValue'; name: string; value: unknown }
  | { type: 'refetch'; dataSourceIds?: string[] }
  | {
      type: 'refetchDataSource';
      dataSourceId: string;
      variables?: Record<string, unknown>;
    };

/** Wire shape of a tool failure; the model sees it and may retry in the same turn. */
export type TComposedPageError = {
  success: false;
  errors: { path: string; message: string }[];
  hint: string;
};
