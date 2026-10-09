/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

/**
 * Babel renderer: turns a composed page (schema v5.0, LLM-authored JSX) into React.
 *
 * - IMPORT_MAP is the whole scope generated code can use: `react`, the react-router-dom v5
 *   helpers (Route, Switch, Link, hooks), and `commercetools`, which is the full Nimbus
 *   surface (derived from the installed package by `scripts/generate-nimbus-surface.mjs`,
 *   `yarn generate:nimbus-surface`) with the icons namespaced as `Icons`, plus `Chart` and
 *   `ComposedPageChart`. Nothing else is injected.
 * - Errors are classified by phase: `decode | transpile | execute | render | data-fetch`,
 *   so the error boundary can say which stage failed and for which component.
 * - Every rendered component is wrapped in an element tagged `data-ct-component=<name>`
 *   (`display: contents`); the annotation toolbar reads it to name what the user clicked.
 * - The code runs in the app origin through `new Function` (CSP allows `unsafe-eval` for
 *   this on purpose); it never gets credentials of its own.
 * - Components are defined by a `componentBody` (hooks, state, helpers, a JSX return) that
 *   this file wraps into a function component. Behaviour is verified in a browser only.
 */

import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from 'react';
import * as Babel from '@babel/standalone';

// The whole Nimbus surface is exposed to generated code - see IMPORT_MAP below.
import * as Nimbus from '@commercetools/nimbus';
import * as NimbusIcons from '@commercetools/nimbus-icons';
import { Alert, Box, LoadingSpinner, Stack, Text } from '@commercetools/nimbus';

// Import Chart component for data visualizations
import { ComposedPageChart } from '../components/composed-page-chart';

// Import React Router DOM for nested routing support
import {
  Route,
  Switch,
  useRouteMatch,
  useParams,
  useHistory,
  useLocation,
  Link as RouterLink,
  Redirect,
  NavLink,
} from 'react-router-dom';

import type {
  TPageSchemaV5,
  TComponentDefinition,
  TRenderData,
  TUIAction,
  TDataSource,
} from '../types/composed-page';

import {
  DataSourcesProvider,
  useDataSourcesContext,
} from '../contexts/data-sources-context';
import { useApplicationContext } from '@commercetools-frontend/application-shell-connectors';
import { useParams as useRouterParams } from 'react-router-dom';

// ============================================
// Component Data Wrapper for Lazy Loading
// ============================================

type TComponentDataWrapperProps = {
  dataSources: TDataSource[];
  parentRenderData: TRenderData;
  dispatchUIAction: (action: TUIAction) => void;
  children: (
    renderData: TRenderData,
    dispatchUIAction: (action: TUIAction) => void
  ) => React.ReactNode;
  onError?: (error: TRenderError) => void;
};

/**
 * Wrapper component that loads data sources for a child component.
 * Merges parent data with locally loaded data.
 * Enables lazy loading - data only fetched when this component renders.
 * Intercepts refetchDataSource actions to handle them locally.
 */
const ComponentDataWrapperInner: React.FC<
  Omit<TComponentDataWrapperProps, 'dataSources'> & { mergeData: boolean }
> = ({ parentRenderData, dispatchUIAction, children, onError }) => {
  // Get locally loaded data from the provider
  const localContext = useDataSourcesContext();

  // Get URL params for data source variables
  const urlParams = useRouterParams<Record<string, string>>();

  // Merge parent data with local data
  const mergedRenderData: TRenderData = React.useMemo(
    () => ({
      ...parentRenderData,
      data: { ...parentRenderData.data, ...localContext.data },
      loading: { ...parentRenderData.loading, ...localContext.loading },
      errors: {
        ...parentRenderData.errors,
        ...Object.fromEntries(
          Object.entries(localContext.errors).map(([k, v]) => [
            k,
            v?.message ?? null,
          ])
        ),
      },
      // Update routeInfo params with current URL params
      routeInfo: {
        ...parentRenderData.routeInfo,
        params: { ...parentRenderData.routeInfo.params, ...urlParams },
      },
    }),
    [parentRenderData, localContext, urlParams]
  );

  // Create a wrapped dispatchUIAction that intercepts refetchDataSource actions
  const wrappedDispatchUIAction = useCallback(
    (action: TUIAction) => {
      // Handle refetchDataSource locally since we have access to the data sources context
      if (action.type === 'refetchDataSource') {
        localContext.refetchWithVariables(
          action.dataSourceId,
          action.variables ?? {}
        );
        return;
      }

      // Pass all other actions to parent handler
      dispatchUIAction(action);
    },
    [dispatchUIAction, localContext]
  );

  React.useEffect(() => {
    const errors = Object.entries(localContext.errors).filter(
      ([_, v]) => v !== null
    );
    if (errors.length > 0 && onError) {
      errors.forEach(([_id, error]) => {
        // Safely extract error message - handles Error objects, GraphQL errors, plain objects, etc.
        let errorMessage: string;
        if (error instanceof Error) {
          errorMessage = error.message;
        } else if (typeof error === 'object' && error !== null) {
          // Handle GraphQL errors which may have different structures
          const errObj = error as Record<string, unknown>;
          if (typeof errObj.message === 'string') {
            errorMessage = errObj.message;
          } else if (Array.isArray(errObj.graphQLErrors)) {
            // Apollo GraphQL errors
            errorMessage = (errObj.graphQLErrors as Array<{ message: string }>)
              .map((e) => e.message)
              .join('; ');
          } else {
            try {
              errorMessage = JSON.stringify(error);
            } catch {
              errorMessage = 'Unknown error (unable to serialize)';
            }
          }
        } else {
          errorMessage = String(error) || 'Unknown error';
        }

        onError({
          message: errorMessage,
          phase: 'data-fetch',
        });
      });
    }
  }, [localContext.errors, onError]);

  return <>{children(mergedRenderData, wrappedDispatchUIAction)}</>;
};

/**
 * Higher-order component wrapper that provides data sources context.
 * Only renders the provider if there are data sources to load.
 */
const ComponentDataWrapper: React.FC<TComponentDataWrapperProps> = ({
  dataSources,
  parentRenderData,
  dispatchUIAction,
  children,
  onError,
}) => {
  const { project, dataLocale, user } = useApplicationContext((context) => ({
    project: context.project,
    dataLocale: context.dataLocale,
    user: context.user,
  }));

  // Get URL params for data source variables
  const urlParams = useRouterParams<Record<string, string>>();

  // If no data sources, just render children with parent data and original dispatch
  if (!dataSources || dataSources.length === 0) {
    return <>{children(parentRenderData, dispatchUIAction)}</>;
  }

  const context = {
    projectKey: project?.key,
    dataLocale: dataLocale ?? 'en',
    userId: user?.id,
    urlParams: { ...parentRenderData.routeInfo.params, ...urlParams },
  };

  return (
    <DataSourcesProvider dataSources={dataSources} context={context}>
      <ComponentDataWrapperInner
        parentRenderData={parentRenderData}
        dispatchUIAction={dispatchUIAction}
        onError={onError}
        mergeData={true}
      >
        {children}
      </ComponentDataWrapperInner>
    </DataSourcesProvider>
  );
};

// ============================================
// Import Map
// ============================================

/**
 * Map of available imports for dynamic components
 * Only pre-approved imports are allowed for security
 */
const IMPORT_MAP: Record<string, Record<string, unknown>> = {
  // React core
  react: {
    React,
    useState,
    useEffect,
    useCallback,
    useMemo,
    useRef,
    Fragment: React.Fragment,
  },

  // React Router DOM for nested routing
  'react-router-dom': {
    Route,
    Switch,
    useRouteMatch,
    useParams,
    useHistory,
    useLocation,
    Link: RouterLink,
    RouterLink,
    Redirect,
    NavLink,
  },

  /**
   * commercetools Nimbus - the whole exported surface, so generated pages can use
   * any Nimbus component, hook or helper without this map having to be maintained
   * component by component.
   *
   * Icons are deliberately NOT spread flat. `@commercetools/nimbus-icons` exports
   * ~2,100 Material icons whose names collide with seven Nimbus components (Badge,
   * Code, Group, Image, Link, List, Menu) and with react-router's `Route`. Spreading
   * them would silently shadow `<Route>` with an SVG and break routing in every
   * generated page. They are namespaced instead: generated code writes `<Icons.Add />`.
   */
  commercetools: {
    ...Nimbus,

    // Namespaced, not spread - see above.
    Icons: NimbusIcons,

    // Chart component for data visualizations
    Chart: ComposedPageChart,
    ComposedPageChart,
  },
};

// ============================================
// Utility Functions
// ============================================

/**
 * Check if a string looks like base64 encoded content
 * Base64 strings only contain A-Za-z0-9+/= characters
 */
function isBase64(str: string): boolean {
  if (!str || str.length === 0) return false;

  // If it starts with common JS/JSX patterns, it's likely raw code, not base64
  const trimmed = str.trim();
  if (
    trimmed.startsWith('<') || // JSX element
    trimmed.startsWith('{') || // Expression
    trimmed.startsWith('const ') || // Variable declaration
    trimmed.startsWith('let ') || // Variable declaration
    trimmed.startsWith('var ') || // Variable declaration
    trimmed.startsWith('function ') || // Function declaration
    trimmed.startsWith('return ') || // Return statement
    trimmed.startsWith('//') || // Comment
    /^use[A-Z]/.test(trimmed) // Hook call (useState, useEffect, etc.)
  ) {
    return false;
  }

  // Check if it matches base64 pattern
  const base64Regex = /^[A-Za-z0-9+/]+=*$/;
  // Remove whitespace for checking (base64 can have line breaks)
  const cleaned = str.replace(/\s/g, '');
  return base64Regex.test(cleaned);
}

/**
 * Decode base64 string to UTF-8, or return as-is if not base64
 */
export function decodeBase64(base64: string): string {
  // If it doesn't look like base64, return as-is (it's probably raw code)
  if (!isBase64(base64)) {
    return base64;
  }

  try {
    return atob(base64);
  } catch {
    // Handle Node.js environment or fallback
    try {
      return Buffer.from(base64, 'base64').toString('utf-8');
    } catch {
      // If decoding fails, return original string
      return base64;
    }
  }
}

/**
 * Is `script` (the decoded `transpiledCode`) a script that evaluates to the component?
 * It must parse as a plain script, start with the function declaration `name` and end with
 * the expression statement `name;`. Same semantics as `isUsableTranspiledCode` in the
 * service contract (`service/src/composed-pages/contract.ts`, change M); the old regex test
 * for `return` rejected every component with hooks before its return.
 */
export function isUsableTranspiledCode(script: string, name: string): boolean {
  try {
    const { body } = Babel.packages.parser.parse(script, {
      sourceType: 'script',
    }).program;
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

/**
 * Does the component body contain a `return` statement of its own (not one nested in an
 * inner function)? Parsed, not searched for text, so a JSX body that merely says "return "
 * in a string or text node is still treated as pure JSX. Unparseable code answers `false`
 * and the transpile step reports the real syntax error.
 */
export function hasOwnReturnStatement(componentBody: string): boolean {
  try {
    const { program } = Babel.packages.parser.parse(componentBody, {
      sourceType: 'script',
      allowReturnOutsideFunction: true,
      plugins: ['jsx'],
    });
    const visit = (node: unknown): boolean => {
      if (Array.isArray(node)) return node.some(visit);
      if (typeof node !== 'object' || node === null) return false;
      const { type } = node as { type?: string };
      if (type === 'ReturnStatement') return true;
      if (
        type === 'FunctionDeclaration' ||
        type === 'FunctionExpression' ||
        type === 'ArrowFunctionExpression' ||
        type === 'ObjectMethod' ||
        type === 'ClassMethod'
      ) {
        return false;
      }
      return Object.entries(node).some(
        ([key, value]) =>
          key !== 'loc' &&
          key !== 'leadingComments' &&
          key !== 'trailingComments' &&
          visit(value)
      );
    };
    return visit(program.body);
  } catch {
    return false;
  }
}

/**
 * Wrap component body code in a named functional component.
 * The component body can include hooks, state, logic, and the JSX return statement.
 * The component is returned at the end so it can be captured when executed.
 */
function wrapInNamedComponent(name: string, componentBody: string): string {
  const trimmed = componentBody.trim();

  // Check if the code already has a return statement of its own
  if (hasOwnReturnStatement(trimmed)) {
    // Code already has return statement - use as-is for function body
    // This handles components with hooks, state, effects, etc.
    return `
function ${name}({ renderData, dispatchUIAction }) {
  ${componentBody}
}
${name};
`;
  } else {
    // Pure JSX without return - wrap with return statement
    // This is for simple components that are just JSX
    return `
function ${name}({ renderData, dispatchUIAction }) {
  return (
    ${componentBody}
  );
}
${name};
`;
  }
}

/**
 * Transpile component body code for a named component using Babel standalone.
 * The component body can include hooks, state, logic, and JSX.
 */
function transpileNamedComponent(name: string, componentBody: string): string {
  const wrappedCode = wrapInNamedComponent(name, componentBody);

  const result = Babel.transform(wrappedCode, {
    presets: ['react'],
    filename: `${name}.jsx`,
  });

  if (!result.code) {
    throw new Error('Babel transformation returned empty result');
  }

  return result.code;
}

/**
 * Build the base scope with all available imports
 * Since imports are now per-component, we just add all available imports to scope
 * This ensures child components can always be referenced
 */
function buildBaseScope(): Record<string, unknown> {
  const scope: Record<string, unknown> = {
    React,
    // Add ComponentDataWrapper so it can be used to wrap components with data sources
    ComponentDataWrapper,
  };

  /**
   * Assignment order is load-bearing, because Nimbus and react-router-dom export two
   * of the same names. Nimbus goes in first and react-router-dom last, so:
   *
   *   Switch      -> react-router's route matcher (a generated page's routing must
   *                  never silently turn into a toggle input)
   *   Link        -> react-router's Link, kept for `to=` navigation
   *
   * The shadowed Nimbus components are re-exposed below under unambiguous names.
   * Keep this in sync with the scope table in the service's generated-page prompt.
   */
  Object.assign(scope, IMPORT_MAP.commercetools);
  Object.assign(scope, IMPORT_MAP.react);
  Object.assign(scope, IMPORT_MAP['react-router-dom']);

  scope.ToggleSwitch = Nimbus.Switch;
  scope.NimbusLink = Nimbus.Link;

  return scope;
}

/**
 * Wrap a component with ComponentDataWrapper if it has dataSources.
 * The wrapper intercepts refetchDataSource actions and handles them locally.
 */
function wrapComponentWithDataLoader(
  BaseComponent: React.ComponentType<{
    renderData: TRenderData;
    dispatchUIAction: (action: TUIAction) => void;
  }>,
  dataSources?: TDataSource[],
  onError?: (error: TRenderError) => void
): React.ComponentType<{
  renderData: TRenderData;
  dispatchUIAction: (action: TUIAction) => void;
}> {
  // If no data sources, return the base component as-is
  if (!dataSources || dataSources.length === 0) {
    return BaseComponent;
  }

  // Create a wrapper component that uses ComponentDataWrapper
  const WrappedComponent: React.FC<{
    renderData: TRenderData;
    dispatchUIAction: (action: TUIAction) => void;
  }> = ({ renderData, dispatchUIAction }) => {
    return (
      <ComponentDataWrapper
        dataSources={dataSources}
        parentRenderData={renderData}
        dispatchUIAction={dispatchUIAction}
        onError={onError}
      >
        {(mergedRenderData, wrappedDispatchUIAction) => (
          <BaseComponent
            renderData={mergedRenderData}
            dispatchUIAction={wrappedDispatchUIAction}
          />
        )}
      </ComponentDataWrapper>
    );
  };

  return WrappedComponent;
}

/**
 * Tag a composed page component's output with the schema name that produced it.
 *
 * Read by the annotation tool (`components/preview-annotations`), which resolves an
 * annotated DOM node back to its `schema.components[]` entry by walking up to the nearest
 * `[data-ct-component]`. Nothing else reads it, and nothing generated by the model can
 * set it - which is the point: the JSX inside a component definition is model-authored and
 * arbitrary, so this wrapper is the only place the DOM and the schema can be tied together.
 *
 * `display: contents` is load-bearing. A wrapper that generated a box would sit between
 * every generated component and its parent, breaking any flex or grid the JSX sets up. The
 * side effect - a zero-size rect - is also wanted: it keeps the wrapper itself from ever
 * being picked as an annotation target.
 */
function withComponentTag(
  Component: React.ComponentType<{
    renderData: TRenderData;
    dispatchUIAction: (action: TUIAction) => void;
  }>,
  name: string
): React.ComponentType<{
  renderData: TRenderData;
  dispatchUIAction: (action: TUIAction) => void;
}> {
  const Tagged: React.FC<{
    renderData: TRenderData;
    dispatchUIAction: (action: TUIAction) => void;
  }> = (props) => (
    <div data-ct-component={name} style={{ display: 'contents' }}>
      <Component {...props} />
    </div>
  );

  Tagged.displayName = `CtComponent(${name})`;

  return Tagged;
}

/**
 * Create a single named component from transpiled code
 */
function createSingleComponent(
  name: string,
  transpiledCode: string,
  scope: Record<string, unknown>
): React.ComponentType<{
  renderData: TRenderData;
  dispatchUIAction: (action: TUIAction) => void;
}> {
  // Create the function with the scope
  const scopeKeys = Object.keys(scope);
  const scopeValues = scopeKeys.map((key) => scope[key]);

  // Execute the transpiled code to get the component
  // Replace the last statement `ComponentName;` with `return ComponentName;`
  const codeWithReturn = transpiledCode.replace(
    new RegExp(`${name};\\s*$`),
    `return ${name};`
  );

  // Deliberate: generated pages run in the app origin (CSP allows 'unsafe-eval' for this).
  // eslint-disable-next-line no-new-func
  const fn = new Function(
    ...scopeKeys,
    `
    "use strict";
    ${codeWithReturn}
  `
  );

  const Component = fn(...scopeValues);

  if (typeof Component !== 'function') {
    throw new Error(
      `Failed to create component "${name}" from transpiled code`
    );
  }

  return Component;
}

// ============================================
// Error Handling
// ============================================

export type TRenderError = {
  message: string;
  stack?: string;
  phase: 'decode' | 'transpile' | 'execute' | 'render' | 'data-fetch';
  componentName?: string;
  location?: {
    line: number;
    column: number;
  };
  codeSnippet?: string;
  suggestion?: string;
};

/**
 * Safely convert any value to a displayable string
 * Handles objects, errors, null, undefined, etc.
 */
function safeStringify(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean')
    return String(value);
  if (value instanceof Error) return value.message || value.toString();
  if (typeof value === 'object') {
    try {
      // Try to get a message property if it exists
      const obj = value as Record<string, unknown>;
      if (typeof obj.message === 'string') return obj.message;
      // Handle GraphQL errors
      if (Array.isArray(obj.graphQLErrors)) {
        return (obj.graphQLErrors as Array<{ message: string }>)
          .map((e) => e.message)
          .join('; ');
      }
      // Handle network errors
      if (
        obj.networkError &&
        typeof (obj.networkError as Record<string, unknown>).message ===
          'string'
      ) {
        return `Network error: ${
          (obj.networkError as Record<string, unknown>).message
        }`;
      }
      // Otherwise stringify the object (but limit length)
      const str = JSON.stringify(value, null, 2);
      return str.length > 500 ? str.slice(0, 500) + '...' : str;
    } catch {
      return '[Complex Object - Unable to stringify]';
    }
  }
  return String(value);
}

/**
 * Convert any caught value to a proper Error object with a meaningful message.
 * This is needed because JavaScript allows throwing any value, not just Errors.
 */
function toError(err: unknown): Error {
  // Already an Error instance
  if (err instanceof Error) {
    return err;
  }

  // Get a meaningful message from the thrown value
  const message = safeStringify(err);
  const error = new Error(message);

  // Try to preserve any stack trace if available
  if (typeof err === 'object' && err !== null) {
    const obj = err as Record<string, unknown>;
    if (typeof obj.stack === 'string') {
      error.stack = obj.stack;
    }
    if (typeof obj.name === 'string') {
      error.name = obj.name;
    }
  }

  return error;
}

/**
 * Parse Babel error messages to extract line/column information
 */
function parseBabelError(
  error: Error,
  sourceCode: string
): {
  location: { line: number; column: number } | null;
  codeSnippet: string | null;
  suggestion: string | null;
} {
  const message = error.message || '';
  let location: { line: number; column: number } | null = null;
  let codeSnippet: string | null = null;
  let suggestion: string | null = null;

  // Babel errors often have format: "filename.jsx: message (line:column)"
  // or include a caret pointing to the error location
  const lineColMatch = message.match(/\((\d+):(\d+)\)/);
  if (lineColMatch) {
    location = {
      line: parseInt(lineColMatch[1], 10),
      column: parseInt(lineColMatch[2], 10),
    };
  }

  // Try to extract the code snippet from Babel's formatted error
  // Babel includes: > line | code
  //                       ^
  const snippetMatch = message.match(/>\s*\d+\s*\|([^\n]+)/);
  if (snippetMatch) {
    codeSnippet = snippetMatch[1].trim();
  }

  // If we have location but no snippet, extract from source
  if (location && !codeSnippet && sourceCode) {
    const lines = sourceCode.split('\n');
    // Adjust for the wrapper function we add (function Name({ ... }) { return (...))
    // The actual JSX starts at line 3 in the wrapped code
    const adjustedLine = location.line - 2; // Account for wrapper lines
    if (adjustedLine > 0 && adjustedLine <= lines.length) {
      const startLine = Math.max(0, adjustedLine - 2);
      const endLine = Math.min(lines.length, adjustedLine + 2);
      const snippetLines = [];
      for (let i = startLine; i < endLine; i++) {
        const lineNum = i + 1;
        const prefix = lineNum === adjustedLine ? '> ' : '  ';
        snippetLines.push(`${prefix}${lineNum} | ${lines[i]}`);
        if (lineNum === adjustedLine && location.column) {
          // Add caret pointing to error column
          const padding =
            '  '.length +
            String(lineNum).length +
            ' | '.length +
            location.column -
            1;
          snippetLines.push(' '.repeat(padding) + '^');
        }
      }
      codeSnippet = snippetLines.join('\n');
    }
  }

  // Provide suggestions based on common errors
  if (message.includes('Unexpected token')) {
    if (message.includes('Unexpected token, expected "}"')) {
      suggestion = 'Missing closing brace. Check that all { have matching }.';
    } else if (message.includes('Unexpected token, expected ")"')) {
      suggestion =
        'Missing closing parenthesis. Check that all ( have matching ).';
    } else if (message.includes('Unexpected token <')) {
      suggestion =
        'Unexpected JSX. Make sure JSX is properly wrapped in parentheses or returned.';
    } else {
      suggestion =
        'Check for syntax errors like missing brackets, parentheses, or quotes.';
    }
  } else if (message.includes('Adjacent JSX elements')) {
    suggestion =
      'Multiple JSX elements must be wrapped in a parent element. Try wrapping them in <> ... </> or a <div>.';
  } else if (message.includes("Unexpected reserved word 'await'")) {
    suggestion =
      "Can't use await outside an async function. Components should be synchronous - use useEffect for async operations.";
  } else if (message.includes('Unterminated string constant')) {
    suggestion =
      'A string is missing its closing quote. Check for unmatched quotes.';
  } else if (
    message.includes('Identifier') &&
    message.includes('has already been declared')
  ) {
    suggestion =
      'A variable or function with this name already exists. Use a different name.';
  }

  return { location, codeSnippet, suggestion };
}

/**
 * Parse runtime execution errors to provide helpful context
 */
function parseRuntimeError(
  error: Error,
  _componentName: string
): {
  suggestion: string | null;
  location: { line: number; column: number } | null;
} {
  const message = error.message || '';
  let suggestion: string | null = null;
  let location: { line: number; column: number } | null = null;

  // Try to extract line number from eval stack traces
  if (error.stack) {
    const evalMatch = error.stack.match(/eval.*?<anonymous>:(\d+):(\d+)/);
    if (evalMatch) {
      // Adjust for wrapper function offset
      location = {
        line: Math.max(1, parseInt(evalMatch[1], 10) - 2),
        column: parseInt(evalMatch[2], 10),
      };
    }
  }

  // Provide suggestions for common runtime errors
  if (message.includes('is not defined')) {
    const match = message.match(/(\w+) is not defined/);
    if (match) {
      const name = match[1];
      if (
        ['useState', 'useEffect', 'useCallback', 'useMemo', 'useRef'].includes(
          name
        )
      ) {
        suggestion = `React hook "${name}" is not imported. Hooks are available in the component scope - just use them directly.`;
      } else {
        suggestion = `"${name}" is not defined. Make sure it's a valid Nimbus component (Stack, Box, Heading, Text, Card, Button, DataTable, ...), an icon accessed via the Icons namespace (Icons.${name}), or defined in your code.`;
      }
    }
  } else if (message.includes('is not a function')) {
    const match = message.match(/(\w+) is not a function/);
    if (match) {
      suggestion = `"${match[1]}" was called as a function but isn't callable. Check if you're using the correct component or function name.`;
    }
  } else if (message.includes('Cannot read properties of undefined')) {
    const match = message.match(
      /Cannot read properties of undefined \(reading '(\w+)'\)/
    );
    if (match) {
      suggestion = `Tried to access "${match[1]}" on undefined. Check if renderData.data contains the expected properties, or add optional chaining (?.).`;
    }
  } else if (message.includes('Cannot read properties of null')) {
    const match = message.match(
      /Cannot read properties of null \(reading '(\w+)'\)/
    );
    if (match) {
      suggestion = `Tried to access "${match[1]}" on null. The value exists but is null - add a null check.`;
    }
  } else if (message.includes('Objects are not valid as a React child')) {
    suggestion =
      "You're trying to render an object directly in JSX. Use JSON.stringify(obj) or access specific properties.";
  } else if (message.includes('Invalid hook call')) {
    suggestion =
      'Hooks can only be called at the top level of your component function, not inside conditions, loops, or nested functions.';
  }

  return { suggestion, location };
}

/**
 * Format an error for display with all available context
 */
function formatDetailedError(
  error: Error,
  phase: TRenderError['phase'],
  componentName: string,
  sourceCode?: string
): TRenderError {
  let location: TRenderError['location'];
  let codeSnippet: TRenderError['codeSnippet'];
  let suggestion: TRenderError['suggestion'];

  if (phase === 'transpile' && sourceCode) {
    const parsed = parseBabelError(error, sourceCode);
    location = parsed.location ?? undefined;
    codeSnippet = parsed.codeSnippet ?? undefined;
    suggestion = parsed.suggestion ?? undefined;
  } else if (phase === 'execute' || phase === 'render') {
    const parsed = parseRuntimeError(error, componentName);
    suggestion = parsed.suggestion ?? undefined;
    location = parsed.location ?? undefined;
  }

  return {
    message: safeStringify(error.message) || 'Unknown error',
    stack: error.stack,
    phase,
    componentName,
    location,
    codeSnippet,
    suggestion,
  };
}

// ============================================
// Main Render Function
// ============================================

export type TBabelRendererResult = {
  Component: React.ComponentType<{
    renderData: TRenderData;
    dispatchUIAction: (action: TUIAction) => void;
  }> | null;
  error: TRenderError | null;
};

/**
 * Process a single component definition - decode and transpile.
 * Handles both base64-encoded and raw component body code.
 * The component body can include hooks, state, logic, and the JSX return.
 * Re-transpiles on client if pre-transpiled code is missing return statement.
 */
function processComponentDefinition(compDef: TComponentDefinition): {
  name: string;
  transpiledCode: string;
  sourceCode: string;
} {
  const { name, code } = compDef;

  // Decode the component body source code (handles both base64 and raw code)
  // Component body includes hooks, state, logic, and JSX return statement
  const componentBody = decodeBase64(code.text);

  // Use pre-transpiled code if available and valid
  let transpiledCode: string;
  if (code.transpiledCode) {
    const decodedTranspiled = decodeBase64(code.transpiledCode);

    // Use the pre-transpiled script only if it has the contract shape; otherwise
    // re-transpile on the client
    if (isUsableTranspiledCode(decodedTranspiled, name)) {
      transpiledCode = decodedTranspiled;
    } else {
      transpiledCode = transpileNamedComponent(name, componentBody);
    }
  } else {
    // No pre-transpiled code, transpile on the client
    transpiledCode = transpileNamedComponent(name, componentBody);
  }

  return { name, transpiledCode, sourceCode: componentBody };
}

/**
 * Create a renderable component from a v5.0 schema with multiple components
 */
export function createComponentFromSchema(
  schema: TPageSchemaV5,
  onError?: (error: TRenderError) => void
): TBabelRendererResult {
  try {
    if (!schema.components || schema.components.length === 0) {
      return {
        Component: null,
        error: {
          message: 'Schema has no components defined',
          phase: 'decode',
          suggestion:
            'The page schema must have at least one component in the components array.',
        },
      };
    }

    // Build the base scope with all available imports
    const scope = buildBaseScope();

    // Step 1: Process and create all child components first (all except the first/main)
    // This ensures they're available in scope when the main component is created
    // Components with dataSources are wrapped with ComponentDataWrapper for lazy loading
    for (let i = schema.components.length - 1; i >= 1; i--) {
      const compDef = schema.components[i];
      let sourceCode = '';

      try {
        const processed = processComponentDefinition(compDef);
        sourceCode = processed.sourceCode;
        const BaseComponent = createSingleComponent(
          processed.name,
          processed.transpiledCode,
          scope
        );

        // Wrap with data loader if component has dataSources
        const WrappedComponent = wrapComponentWithDataLoader(
          BaseComponent,
          compDef.dataSources,
          onError
        );

        // Add wrapped component to scope so main component can reference it
        scope[processed.name] = withComponentTag(
          WrappedComponent,
          processed.name
        );
      } catch (err) {
        const error = toError(err);
        // Determine if this is a transpile or execute error
        const isBabelError =
          error.message.includes('SyntaxError') ||
          error.message.includes('Unexpected token') ||
          error.message.includes('Unterminated');
        const phase = isBabelError ? 'transpile' : 'execute';

        const detailedError = formatDetailedError(
          error,
          phase,
          compDef.name,
          sourceCode
        );

        if (onError) {
          onError(detailedError);
        }

        // For child components, log but continue - the main component might still work
      }
    }

    // Step 2: Process and create the main component (first in array)
    const mainCompDef = schema.components[0];
    let MainComponent: React.ComponentType<{
      renderData: TRenderData;
      dispatchUIAction: (action: TUIAction) => void;
    }>;
    let mainSourceCode = '';

    try {
      const processed = processComponentDefinition(mainCompDef);
      mainSourceCode = processed.sourceCode;
      const BaseMainComponent = createSingleComponent(
        processed.name,
        processed.transpiledCode,
        scope
      );

      // Wrap main component with data loader if it has dataSources
      MainComponent = withComponentTag(
        wrapComponentWithDataLoader(
          BaseMainComponent,
          mainCompDef.dataSources,
          onError
        ),
        processed.name
      );
    } catch (err) {
      const error = toError(err);
      // Determine if this is a transpile or execute error
      const isBabelError =
        error.message.includes('SyntaxError') ||
        error.message.includes('Unexpected token') ||
        error.message.includes('Unterminated');
      const phase = isBabelError ? 'transpile' : 'execute';

      return {
        Component: null,
        error: formatDetailedError(
          error,
          phase,
          mainCompDef.name,
          mainSourceCode
        ),
      };
    }

    return {
      Component: MainComponent,
      error: null,
    };
  } catch (err) {
    const error = toError(err);
    // Try to get a component name from schema for better error context
    const componentName =
      schema.components?.[0]?.name || schema.title || 'unknown';
    return {
      Component: null,
      error: formatDetailedError(error, 'render', componentName),
    };
  }
}

// ============================================
// React Component Wrapper
// ============================================

type TBabelRendererProps = {
  schema: TPageSchemaV5;
  renderData: TRenderData;
  dispatchUIAction: (action: TUIAction) => void;
  onError?: (error: TRenderError) => void;
};

/**
 * BabelRenderer Component
 *
 * Renders a v5.0 schema using Babel transpilation.
 * Handles errors and provides error feedback.
 */
export function BabelRenderer({
  schema,
  renderData,
  dispatchUIAction,
}: TBabelRendererProps): React.ReactElement | null {
  const [result, setResult] = React.useState<TBabelRendererResult | null>(null);
  const [renderError, setRenderError] = React.useState<string | null>(null);
  const schemaRef = React.useRef<string>('');

  const onError = useCallback((error: TRenderError) => {
    throw error;
  }, []);

  // Memoize schema key to detect changes (based on all components)
  const schemaKey = React.useMemo(() => {
    return schema.components.map((c) => `${c.name}:${c.code.text}`).join('|');
  }, [schema.components]);

  // Create component when schema changes
  React.useEffect(() => {
    if (schemaRef.current !== schemaKey) {
      schemaRef.current = schemaKey;
      setRenderError(null);

      const newResult = createComponentFromSchema(schema, onError);
      setResult(newResult);

      if (newResult.error && onError) {
        onError(newResult.error);
      }
    }
  }, [schema, schemaKey, onError]);

  // Handle creation/transpilation errors
  if (result?.error) {
    return (
      <Alert.Root colorPalette="critical" variant="outlined">
        <Stack direction="column" gap="200">
          <Text fontWeight="600">
            {result.error.componentName
              ? `Error in component "${result.error.componentName}" (${result.error.phase})`
              : `Error creating component (${result.error.phase})`}
          </Text>

          <Text>{safeStringify(result.error.message)}</Text>

          {result.error.location && (
            <Text textStyle="sm" color="neutral.11">
              Location: Line {result.error.location.line}, Column{' '}
              {result.error.location.column}
            </Text>
          )}

          {result.error.suggestion && (
            <div
              style={{
                backgroundColor: '#fef3c7',
                border: '1px solid #fcd34d',
                borderRadius: '4px',
                padding: '8px 12px',
                marginTop: '8px',
              }}
            >
              <Text fontWeight="600">Suggestion:</Text>
              <Text>{result.error.suggestion}</Text>
            </div>
          )}

          {result.error.codeSnippet && (
            <div style={{ marginTop: '8px' }}>
              <Text textStyle="sm" fontWeight="600">
                Code:
              </Text>
              <pre
                style={{
                  backgroundColor: '#1f2937',
                  color: '#f3f4f6',
                  padding: '12px',
                  borderRadius: '4px',
                  fontSize: '11px',
                  fontFamily: "'Monaco', 'Menlo', 'Ubuntu Mono', monospace",
                  whiteSpace: 'pre-wrap',
                  overflow: 'auto',
                  maxHeight: '200px',
                  marginTop: '4px',
                }}
              >
                {result.error.codeSnippet}
              </pre>
            </div>
          )}

          {result.error.stack && (
            <details style={{ marginTop: '8px' }}>
              <summary style={{ cursor: 'pointer', color: '#666' }}>
                <Text textStyle="sm">Show stack trace</Text>
              </summary>
              <pre
                style={{
                  backgroundColor: '#1f2937',
                  color: '#f3f4f6',
                  padding: '12px',
                  borderRadius: '4px',
                  fontSize: '10px',
                  fontFamily: "'Monaco', 'Menlo', 'Ubuntu Mono', monospace",
                  whiteSpace: 'pre-wrap',
                  overflow: 'auto',
                  maxHeight: '200px',
                  marginTop: '4px',
                }}
              >
                {result.error.stack}
              </pre>
            </details>
          )}
        </Stack>
      </Alert.Root>
    );
  }

  // Handle render errors
  if (renderError) {
    return (
      <Alert.Root colorPalette="critical" variant="outlined">
        <Alert.Title>Error rendering component</Alert.Title>
        <Alert.Description>
          <Stack direction="column" gap="200">
            <Text>{renderError}</Text>
            {/*
             * A warning-toned Box rather than a nested Alert.Root: Alert.Root
             * sets role="alert", and a second live region inside the first one
             * gets announced twice. The amber hex codes this replaces are now
             * warning.* tokens.
             */}
            <Box
              bg="warning.2"
              borderWidth="1px"
              borderStyle="solid"
              borderColor="warning.6"
              borderRadius="100"
              px="300"
              py="200"
            >
              <Text fontWeight="600" color="warning.11">
                Tip:
              </Text>
              <Text color="warning.11">
                Check the browser console for more details. Common issues
                include undefined data, invalid JSX, or React hook violations.
              </Text>
            </Box>
          </Stack>
        </Alert.Description>
      </Alert.Root>
    );
  }

  // Render the component
  if (!result?.Component) {
    return <LoadingSpinner />;
  }

  const DynamicComponent = result.Component;

  // Wrap in error boundary for runtime errors
  try {
    return (
      <DynamicComponent
        renderData={renderData}
        dispatchUIAction={dispatchUIAction}
      />
    );
  } catch (err) {
    const error = toError(err);
    const componentName = schema.components?.[0]?.name || 'unknown';
    const detailedError = formatDetailedError(error, 'render', componentName);

    // Use setTimeout to avoid setting state during render
    setTimeout(() => {
      setRenderError(error.message);
      if (onError) {
        onError(detailedError);
      }
    }, 0);

    return (
      <Alert.Root colorPalette="critical" variant="outlined">
        <Stack direction="column" gap="200">
          <Text fontWeight="600">
            Runtime error in component "{componentName}"
          </Text>
          <Text>{error.message}</Text>
          {detailedError.location && (
            <Text textStyle="sm" color="neutral.11">
              Approximate location: Line {detailedError.location.line}
            </Text>
          )}
          {detailedError.suggestion && (
            <div
              style={{
                backgroundColor: '#fef3c7',
                border: '1px solid #fcd34d',
                borderRadius: '4px',
                padding: '8px 12px',
                marginTop: '8px',
              }}
            >
              <Text fontWeight="600">Suggestion:</Text>
              <Text>{detailedError.suggestion}</Text>
            </div>
          )}
        </Stack>
      </Alert.Root>
    );
  }
}

export default BabelRenderer;
