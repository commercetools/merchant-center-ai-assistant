/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { parse as parseJs } from '@babel/parser';
import traverseModule from '@babel/traverse';
import type { NodePath } from '@babel/traverse';
import type { Node } from '@babel/types';
import { Kind, visit, parse as parseGraphql } from 'graphql';

/**
 * Validation of model-written component bodies and data sources.
 *
 * This is DEFENCE IN DEPTH, not an isolation boundary: the code runs in the user's browser
 * with `new Function`, and the real limits are the frontend renderer's scope and the fact
 * that only the user's own model session produced it. The deny-list catches honest mistakes
 * and the obvious escapes (`window["x"]`, `globalThis`, `.constructor` chains) by looking at
 * the syntax tree, so the same words in strings and comments are fine.
 */

type TraverseFn = (parent: Node, opts: Record<string, unknown>) => void;
// `@babel/traverse` is CommonJS with a `default` property; Jest's ESM mode hands us the
// whole module object, the CommonJS build the function itself.
const traverse: TraverseFn = (() => {
  const mod = traverseModule as unknown as TraverseFn | { default: TraverseFn };
  return typeof mod === 'function' ? mod : mod.default;
})();

export const FORBIDDEN_IDENTIFIERS: readonly string[] = [
  'eval',
  'Function',
  'window',
  'document',
  'globalThis',
  'localStorage',
  'sessionStorage',
  'fetch',
  'XMLHttpRequest',
  'WebSocket',
  'importScripts',
];

export interface BodyError {
  message: string;
  /** 1-based, relative to the component body. */
  line?: number;
  column?: number;
}

export type BodyValidation =
  { valid: true } | { valid: false; error: BodyError };

const WRAPPER_PREFIX = '(function(){\n';
const WRAPPER_SUFFIX = '\n})';

const fail = (
  message: string,
  line?: number,
  column?: number
): BodyValidation => ({
  valid: false,
  error: { message, line, column },
});

interface BabelSyntaxError {
  message: string;
  loc?: { line: number; column: number };
}

const isSyntaxError = (error: unknown): error is BabelSyntaxError =>
  typeof error === 'object' &&
  error !== null &&
  typeof (error as { message?: unknown }).message === 'string';

/**
 * Parses `body` as the body of a function and checks it. `componentName` only sharpens the
 * "do not declare the component yourself" message.
 */
export function validateComponentBody(
  body: string,
  componentName?: string
): BodyValidation {
  if (body.trim() === '') return fail('Component body cannot be empty');

  let ast;
  try {
    ast = parseJs(WRAPPER_PREFIX + body + WRAPPER_SUFFIX, {
      plugins: ['jsx'],
      sourceType: 'script',
    });
  } catch (error) {
    if (!isSyntaxError(error))
      return fail('Component body could not be parsed');
    const line = error.loc ? error.loc.line - 1 : undefined;
    const column = error.loc ? error.loc.column : undefined;
    if (/\b(import|export)\b/.test(error.message)) {
      return fail(
        "Do not use import or export statements. Every Nimbus export, React and the router names are already in scope; list them in the 'imports' field instead.",
        line,
        column
      );
    }
    return fail(
      `Syntax error: ${error.message.replace(/\s*\(\d+:\d+\)\s*$/, '')}`,
      line,
      column
    );
  }

  const statement = ast.program.body[0];
  if (
    !statement ||
    statement.type !== 'ExpressionStatement' ||
    statement.expression.type !== 'FunctionExpression'
  ) {
    return fail('Component body could not be parsed as a function body');
  }
  const statements = statement.expression.body.body;

  const declared = statements.find(
    (s) =>
      s.type === 'FunctionDeclaration' &&
      componentName !== undefined &&
      s.id?.name === componentName
  );
  if (declared) {
    return fail(
      'Do not include the component function declaration. Provide only the component body (hooks, logic, and a top-level return with JSX).',
      declared.loc ? declared.loc.start.line - 1 : undefined,
      declared.loc?.start.column
    );
  }

  if (!statements.some((s) => s.type === 'ReturnStatement')) {
    return fail(
      'Component body must end with a top-level return (a return inside a hook callback does not count). If you wrapped the code in your own function, remove the wrapper.'
    );
  }

  let violation: BodyError | undefined;
  const flag = (path: NodePath, message: string): void => {
    if (violation) return;
    violation = {
      message,
      line: path.node.loc ? path.node.loc.start.line - 1 : undefined,
      column: path.node.loc?.start.column,
    };
  };

  traverse(ast, {
    Identifier(path: NodePath<Extract<Node, { type: 'Identifier' }>>) {
      const { node, parent } = path;
      if (!FORBIDDEN_IDENTIFIERS.includes(node.name)) return;
      // `obj.fetch` and `{ fetch: 1 }` are property names, not references.
      if (
        (parent.type === 'MemberExpression' ||
          parent.type === 'OptionalMemberExpression') &&
        parent.property === node &&
        !parent.computed
      ) {
        return;
      }
      if (
        (parent.type === 'ObjectProperty' ||
          parent.type === 'ObjectMethod' ||
          parent.type === 'ClassMethod' ||
          parent.type === 'ClassProperty') &&
        parent.key === node &&
        !parent.computed
      ) {
        return;
      }
      flag(
        path,
        `"${node.name}" is not available in a composed page (browser globals and dynamic code evaluation are blocked)`
      );
    },
    JSXIdentifier(path: NodePath<Extract<Node, { type: 'JSXIdentifier' }>>) {
      // `<window.Foo />` would reference the global as well.
      if (
        FORBIDDEN_IDENTIFIERS.includes(path.node.name) &&
        path.parent.type === 'JSXMemberExpression' &&
        path.parent.object === path.node
      ) {
        flag(path, `"${path.node.name}" is not available in a composed page`);
      }
    },
    MemberExpression(
      path: NodePath<Extract<Node, { type: 'MemberExpression' }>>
    ) {
      checkConstructor(path, flag);
    },
    OptionalMemberExpression(
      path: NodePath<Extract<Node, { type: 'OptionalMemberExpression' }>>
    ) {
      checkConstructor(path, flag);
    },
    Import(path: NodePath) {
      flag(path, 'Dynamic import() is not allowed');
    },
    ImportExpression(path: NodePath) {
      flag(path, 'Dynamic import() is not allowed');
    },
  });

  return violation ? { valid: false, error: violation } : { valid: true };
}

const checkConstructor = (
  path: NodePath<
    Extract<Node, { type: 'MemberExpression' | 'OptionalMemberExpression' }>
  >,
  flag: (path: NodePath, message: string) => void
): void => {
  const { property, computed } = path.node;
  const named =
    (!computed &&
      property.type === 'Identifier' &&
      property.name === 'constructor') ||
    (computed &&
      property.type === 'StringLiteral' &&
      property.value === 'constructor');
  if (named) flag(path, '"constructor" access is not allowed');
};

/** One-line text for a body error, with the position when known. */
export const describeBodyError = (error: BodyError): string =>
  error.line !== undefined
    ? `${error.message} (line ${error.line}, column ${error.column ?? 0} of the component body)`
    : error.message;

export interface QueryCheckInput {
  id: string;
  query: string;
  variables?: { name: string }[];
}

export type QueryValidation = { valid: true } | { valid: false; error: string };

/** GraphQL data sources: read-only, syntactically valid, variables consistent. */
export function validateDataSourceQuery(
  source: QueryCheckInput
): QueryValidation {
  const label = `Data source "${source.id}"`;
  let document;
  try {
    document = parseGraphql(source.query);
  } catch (error) {
    return {
      valid: false,
      error: `${label}: GraphQL syntax error: ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }

  const operations = document.definitions.filter(
    (definition) => definition.kind === Kind.OPERATION_DEFINITION
  );
  if (operations.length === 0) {
    return {
      valid: false,
      error: `${label}: the query must contain a query operation (a fragment alone is not enough)`,
    };
  }
  for (const operation of operations) {
    if (
      operation.kind === Kind.OPERATION_DEFINITION &&
      operation.operation !== 'query'
    ) {
      return {
        valid: false,
        error: `${label}: only read-only queries are allowed, not a ${operation.operation}. Pages may only read data.`,
      };
    }
  }

  const declared = new Set<string>();
  const used = new Set<string>();
  visit(document, {
    VariableDefinition(node) {
      declared.add(node.variable.name.value);
    },
    Variable(node, _key, parent) {
      // The declaration itself is also a Variable node; only count usages.
      if (
        parent &&
        !Array.isArray(parent) &&
        'kind' in parent &&
        parent.kind === Kind.VARIABLE_DEFINITION
      ) {
        return;
      }
      used.add(node.name.value);
    },
  });

  const undeclared = [...used].filter((name) => !declared.has(name));
  if (undeclared.length > 0) {
    return {
      valid: false,
      error: `${label}: variable(s) ${undeclared.map((n) => `$${n}`).join(', ')} used but not declared in the operation`,
    };
  }
  const unknown = (source.variables ?? [])
    .map((variable) => variable.name)
    .filter((name) => !declared.has(name));
  if (unknown.length > 0) {
    return {
      valid: false,
      error: `${label}: variables ${unknown.join(', ')} are listed in "variables" but not declared in the query`,
    };
  }
  return { valid: true };
}
