/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

/**
 * Seam for change H: names of the enabled non-core data sources (for example `stripe`),
 * used by the suggestions prompt so it never proposes work for a source that is not
 * connected. Default: none.
 */
export interface ConnectedSourcesProvider {
  list(): Promise<string[]>;
}

let provider: ConnectedSourcesProvider = { list: async () => [] };

export const setConnectedSourcesProvider = (p: ConnectedSourcesProvider): void => {
  provider = p;
};

export const getConnectedSourcesProvider = (): ConnectedSourcesProvider => provider;
