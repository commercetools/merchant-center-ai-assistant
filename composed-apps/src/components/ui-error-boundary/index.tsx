/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

/**
 * UI Error Boundary Component
 *
 * A reusable error boundary for catching and displaying render errors
 * in dynamically rendered components like BabelRenderer.
 */

import { Component, type ReactNode } from 'react';
import {
  Accordion,
  Alert,
  Box,
  Code,
  Stack,
  Text,
} from '@commercetools/nimbus';

/**
 * The stack traces and code snippets this boundary prints.
 *
 * Was a styled `<pre>` with a hardcoded dark `#1f2937`/`#f3f4f6` pair - a dark code block
 * dropped into a light critical Alert. Nimbus `Code` carries the design system's code
 * surface instead; `as="pre"` keeps the whitespace semantics, and the recipe's
 * `display: inline-flex` has to be overridden for a multi-line block.
 */
const CodeBlock = ({ children }: { children: ReactNode }) => (
  <Code
    as="pre"
    display="block"
    width="100%"
    marginTop="200"
    padding="300"
    fontSize="300"
    whiteSpace="pre-wrap"
    wordBreak="break-word"
    overflowX="auto"
    overflowY="auto"
    maxHeight="300px"
  >
    {children}
  </Code>
);

// Type for custom render errors from BabelRenderer
type TRenderError = {
  message: string;
  stack?: string;
  phase?: string;
  componentName?: string;
  location?: { line: number; column: number };
  codeSnippet?: string;
  suggestion?: string;
};

export type TUIErrorBoundaryState = {
  hasError: boolean;
  error: Error | TRenderError | null;
  errorInfo: React.ErrorInfo | null;
  hasReportedError: boolean;
};

export type TUIErrorBoundaryProps = {
  children: ReactNode;
  fallback?: ReactNode;
  resetKey?: string | number;
  onError?: (errorMessage: string) => void;
};

/**
 * Safely convert any value to a displayable string
 */
function safeStringify(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean')
    return String(value);
  if (value instanceof Error) return value.message;
  if (typeof value === 'object') {
    try {
      // Try to get a message property if it exists
      const obj = value as Record<string, unknown>;
      if (typeof obj.message === 'string') return obj.message;
      // Otherwise stringify the object (but limit length)
      const str = JSON.stringify(value, null, 2);
      return str.length > 500 ? str.slice(0, 500) + '...' : str;
    } catch {
      return '[Complex Object]';
    }
  }
  return String(value);
}

/**
 * Check if error is our custom TRenderError type
 */
function isRenderError(error: unknown): error is TRenderError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    'phase' in error
  );
}

/**
 * Parse an error to extract useful information for display
 */
function parseErrorDetails(error: Error | TRenderError | unknown): {
  errorType: string;
  message: string;
  location: string | null;
  suggestion: string | null;
  componentName: string | null;
  codeSnippet: string | null;
  phase: string | null;
  stack: string | null;
} {
  // Handle our custom TRenderError type
  if (isRenderError(error)) {
    return {
      errorType: 'RenderError',
      message: safeStringify(error.message),
      location: error.location
        ? `Line ${error.location.line}, Column ${error.location.column}`
        : null,
      suggestion: error.suggestion || null,
      componentName: error.componentName || null,
      codeSnippet: error.codeSnippet || null,
      phase: error.phase || null,
      stack: error.stack || null,
    };
  }

  // Handle standard Error objects
  const err = error instanceof Error ? error : new Error(safeStringify(error));
  const errorType = err.name || 'Error';
  const message = safeStringify(err.message);
  let location: string | null = null;
  let suggestion: string | null = null;

  // Check for common error patterns and provide helpful suggestions
  if (message.includes('is not defined')) {
    const match = message.match(/(\w+) is not defined/);
    if (match) {
      suggestion = `The variable or component "${match[1]}" is not available. Check if it's imported or defined correctly.`;
    }
  } else if (message.includes('is not a function')) {
    const match = message.match(/(\w+) is not a function/);
    if (match) {
      suggestion = `"${match[1]}" was called as a function but it's not callable. Check if it's the correct type.`;
    }
  } else if (message.includes('Cannot read properties of undefined')) {
    const match = message.match(
      /Cannot read properties of undefined \(reading '(\w+)'\)/
    );
    if (match) {
      suggestion = `Tried to access "${match[1]}" on an undefined value. Check if the parent object exists.`;
    }
  } else if (message.includes('Cannot read properties of null')) {
    const match = message.match(
      /Cannot read properties of null \(reading '(\w+)'\)/
    );
    if (match) {
      suggestion = `Tried to access "${match[1]}" on a null value. Add a null check before accessing this property.`;
    }
  } else if (message.includes('Objects are not valid as a React child')) {
    suggestion =
      'You may be trying to render an object directly. Convert it to a string or use JSON.stringify().';
  } else if (message.includes('Maximum update depth exceeded')) {
    suggestion =
      'Infinite re-render loop detected. Check for state updates in useEffect without proper dependencies.';
  }

  // Try to extract location from stack trace
  if (err.stack) {
    // Look for eval location which often contains our component info
    const evalMatch = err.stack.match(/eval.*?:(\d+):(\d+)/);
    if (evalMatch) {
      location = `Line ${evalMatch[1]}, Column ${evalMatch[2]} (in evaluated component code)`;
    }
  }

  return {
    errorType,
    message,
    location,
    suggestion,
    componentName: null,
    codeSnippet: null,
    phase: null,
    stack: err.stack || null,
  };
}

class UIErrorBoundary extends Component<
  TUIErrorBoundaryProps,
  TUIErrorBoundaryState
> {
  constructor(props: TUIErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      hasReportedError: false,
    };
  }

  static getDerivedStateFromError(
    error: Error
  ): Partial<TUIErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidUpdate(prevProps: TUIErrorBoundaryProps) {
    // Reset error state when resetKey changes
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.setState({
        hasError: false,
        error: null,
        errorInfo: null,
        hasReportedError: false,
      });
    }

    // Report error to callback if we have an error and haven't reported it yet
    if (
      this.state.hasError &&
      this.state.error &&
      !this.state.hasReportedError &&
      this.props.onError
    ) {
      this.setState({ hasReportedError: true });
      const errorMessage = safeStringify(this.state.error);
      this.props.onError(errorMessage);
    }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Store errorInfo for display
    this.setState({ errorInfo });

    // Report error to callback
    if (this.props.onError && !this.state.hasReportedError) {
      this.setState({ hasReportedError: true });
      const errorMessage = safeStringify(error);
      const fullErrorMessage = `${errorMessage}\n\nComponent Stack:${errorInfo.componentStack}`;
      this.props.onError(fullErrorMessage);
    }
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const { error, errorInfo } = this.state;
      const parsed = parseErrorDetails(error);

      return (
        <Box maxWidth="900px" marginX="auto">
          <Alert.Root colorPalette="critical" variant="outlined">
            <Stack direction="column" gap="200">
              <Text fontWeight="600">
                {/* The error name used to be a styled span with its own hardcoded red.
                    Inside a critical Alert the palette already says "error", so this only
                    needs the palette's own emphasis colour. */}
                <Text as="span" color="critical.11" fontWeight="600">
                  {parsed.errorType}
                </Text>
                {parsed.componentName && ` in "${parsed.componentName}"`}
                {parsed.phase && ` (${parsed.phase})`}
              </Text>

              <Text>{parsed.message}</Text>

              {parsed.location && (
                <Text fontSize="350" color="neutral.11">
                  Location: {parsed.location}
                </Text>
              )}

              {parsed.suggestion && (
                <Box
                  bg="critical.2"
                  border="solid-25"
                  borderColor="critical.6"
                  borderRadius="100"
                  padding="300"
                  marginTop="200"
                >
                  <Text fontWeight="600">Suggestion:</Text>
                  <Text>{parsed.suggestion}</Text>
                </Box>
              )}

              {parsed.codeSnippet && (
                <Box marginTop="200">
                  <Text fontSize="350" fontWeight="600">
                    Code snippet:
                  </Text>
                  <CodeBlock>{parsed.codeSnippet}</CodeBlock>
                </Box>
              )}

              {/* Was a native <details>/<summary> with an inline `cursor: pointer` and a
                  hardcoded grey. Accordion is the same disclosure with the keyboard
                  handling and aria-expanded wiring included, and no CSS of its own. */}
              {(parsed.stack || errorInfo?.componentStack) && (
                <Accordion.Root>
                  <Accordion.Item value="technical-details">
                    <Accordion.Header>Show technical details</Accordion.Header>
                    <Accordion.Content>
                      {parsed.stack && (
                        <>
                          <Text fontSize="350" fontWeight="600">
                            Stack Trace:
                          </Text>
                          <CodeBlock>{parsed.stack}</CodeBlock>
                        </>
                      )}
                      {errorInfo?.componentStack && (
                        <>
                          <Text fontSize="350" fontWeight="600">
                            Component Stack:
                          </Text>
                          <CodeBlock>{errorInfo.componentStack}</CodeBlock>
                        </>
                      )}
                    </Accordion.Content>
                  </Accordion.Item>
                </Accordion.Root>
              )}
            </Stack>
          </Alert.Root>
        </Box>
      );
    }

    return this.props.children;
  }
}

export default UIErrorBoundary;
