/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

// `.graphql` / `.ctp.graphql` documents are turned into DocumentNodes by the
// webpack graphql loader that mc-scripts configures. tsc knows nothing about that
// loader, so without this declaration every `import query from './x.ctp.graphql'`
// is a TS2307 and `yarn typecheck` reports failures that the real build does not have.
declare module '*.graphql' {
  import type { DocumentNode } from 'graphql';
  const value: DocumentNode;
  export default value;
}
