/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

/**
 * Composed Page Schema Types
 *
 * These types define the structure of dynamically generated pages
 * created through LLM chat conversations. The schema is stored in
 * Commercetools Custom Objects and rendered at runtime.
 *
 * Current version: 5.0 (`COMPOSED_PAGE_SCHEMA_VERSION` in the service contract). Components
 * carry JSX source plus service-transpiled code, rendered with Babel at runtime.
 */

// ============================================
// Data Source Types
// ============================================

export type TGraphQLVariable = {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'array';
  value?: unknown;
  fromContext?: 'projectKey' | 'dataLocale' | 'userId';
  fromUrl?: string; // e.g., ":orderId" from route params
};

export type TDataSource = {
  id: string;
  name: string;
  query: string; // GraphQL query string
  variables?: TGraphQLVariable[];
  /**
   * Kept as a single-value union, matching the service's one-member enum: stored pages
   * carry `target` on every data source, and dropping the field would silently
   * reinterpret them.
   */
  target?: 'COMMERCETOOLS_PLATFORM';
  pollInterval?: number; // in milliseconds, for auto-refresh
};

// ============================================
// Import Definition Types
// ============================================

/**
 * Import definition for tracking required imports
 */
export type TImportDefinition = {
  source: 'react' | 'commercetools' | 'react-router-dom' | 'custom' | 'library';
  items: string[];
  from?: string; // Package name for library imports
};

// ============================================
// Component Definition Types
// ============================================

/**
 * A single component definition within a composed page.
 * Each component is a proper React function component that can use hooks.
 * Each component has its own data sources and imports for lazy loading.
 */
export type TComponentDefinition = {
  /** Component name (PascalCase, e.g., "OrderList", "OrderDetail") */
  name: string;
  /**
   * Data sources for this component.
   * Only executed when this component is rendered (lazy loading).
   */
  dataSources?: TDataSource[];
  /** Required imports for this component */
  imports: TImportDefinition[];
  /**
   * Component code containing the full function body.
   * The component body can include:
   * - React hooks (useState, useEffect, useMemo, etc.)
   * - Custom state and logic
   * - Helper functions
   * - JSX return statement
   */
  code: {
    /** Base64 encoded component body source (hooks, logic, return statement) */
    text: string;
    /** Base64 encoded transpiled JavaScript */
    transpiledCode: string;
  };
};

// ============================================
// Page Schema - Version 4.0 (JSX Code) - CURRENT
// ============================================

/**
 * Page schema for JSX Code Renderer.
 * Uses Babel transpilation for dynamic code execution.
 * Supports multiple named components for proper hooks usage in nested routes.
 * Each component has its own dataSources and imports for modularity and lazy loading.
 */
export type TPageSchemaV5 = {
  version: '5.0';
  title: string;
  description?: string;
  /**
   * Array of component definitions.
   * First component is the entry point (main/index).
   * Subsequent components can be referenced by name in the main component.
   * Each component can use hooks at its top level.
   * Each component has its own dataSources (lazy loaded) and imports.
   */
  components: TComponentDefinition[];
  props?: Record<string, unknown>;
};

/**
 * Base type for legacy page schemas.
 * Used for backwards compatibility when reading existing stored data.
 */
export type TLegacyPageSchema = {
  version: string;
  title?: string;
  description?: string;
  dataSources?: TDataSource[];
  [key: string]: unknown;
};

/**
 * Union type for all page schema versions.
 * V5 is the current version; older versions are kept for backwards compatibility
 * when reading existing stored data.
 */
export type TPageSchema = TPageSchemaV5 | TLegacyPageSchema;

/**
 * Type guard to check if schema is version 5.0 (multi-component JSX, Nimbus)
 */
export function isPageSchemaV5(schema: TPageSchema): schema is TPageSchemaV5 {
  return (
    schema.version === '5.0' &&
    'components' in schema &&
    Array.isArray(schema.components) &&
    schema.components.length > 0
  );
}

// ============================================
// Composed Page (stored in Custom Object)
// ============================================

export type TComposedPage = {
  id: string;
  key: string; // unique identifier, URL-friendly slug
  name: string; // display name in navigation
  icon?: string; // icon name for navigation
  schema: TPageSchema;
  isPublished: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
};

// ============================================
// Render Data Types
// ============================================

/**
 * Route information passed to rendered components
 * Enables LLM-generated code to create nested routes
 */
export type TRouteInfo = {
  /** Base path pattern (e.g., "/project/composed/:pageKey") */
  basePath: string;
  /** Base URL with params resolved (e.g., "/project/composed/uuid-here") */
  baseUrl: string;
  /** Route params including pageKey */
  params: Record<string, string>;
  /** Current location pathname */
  pathname: string;
  /** Query string (e.g., "?foo=bar") */
  search: string;
};

/**
 * Render data passed to components
 */
export type TRenderData = {
  data: Record<string, unknown>;
  loading: Record<string, boolean>;
  errors: Record<string, string | null>;
  formValues: Record<string, unknown>;
  projectKey: string;
  dataLocale: string;
  /** Route information for nested routing support */
  routeInfo: TRouteInfo;
};

/**
 * UI actions that can be dispatched from components
 */
export type TUIAction =
  | {
      type: 'mutation';
      mutation: string;
      variables?: Record<string, unknown>;
      successMessage?: string;
      errorMessage?: string;
      refetchDataSources?: string[];
    }
  | {
      type: 'navigate';
      to: string;
      params?: Record<string, string>;
    }
  | {
      type: 'openModal';
      modalId: string;
    }
  | {
      type: 'closeModal';
    }
  | {
      type: 'notification';
      kind: 'success' | 'error' | 'info' | 'warning';
      message: string;
    }
  | {
      type: 'setFormValue';
      name: string;
      value: unknown;
    }
  | {
      type: 'refetch';
      dataSourceIds?: string[];
    }
  | {
      /**
       * Refetch a specific data source with optional new variables.
       * Used by components with pagination/sorting to update query parameters.
       */
      type: 'refetchDataSource';
      dataSourceId: string;
      variables?: Record<string, unknown>;
    };

// ============================================
// Chat Types (for LLM conversation)
// ============================================

export type TChatMessage = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: string;
};

export type TConversationState = {
  messages: TChatMessage[];
  currentSchema?: TPageSchema;
  status: 'idle' | 'loading' | 'error' | 'success';
};
