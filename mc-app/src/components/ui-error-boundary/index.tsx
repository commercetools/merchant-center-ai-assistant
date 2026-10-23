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

import { Component, type ReactNode, useCallback } from 'react';
import { useSession } from '../../contexts/session';
import { useTabbedHeaderContext } from '../../contexts/tabbed-header-context';
import {
  Accordion,
  Alert,
  Box,
  Button,
  Code,
  Stack,
  Text,
} from '@commercetools/nimbus';

/**
 * Multi-line code dump for stacks and snippets.
 *
 * Not a styled(Code): Chakra v3 emits cascade-layered styles that a
 * styled-components class cannot beat. This is a plain wrapper that only sets
 * props. `Code` is inline-flex by default, so display="block" plus the wrapping
 * and scroll rules are what turn it into a block.
 */
const ErrorCodeBlock = ({ children }: { children: ReactNode }) => (
  <Code
    as="pre"
    variant="subtle"
    colorPalette="neutral"
    size="sm"
    display="block"
    width="100%"
    p="300"
    borderRadius="100"
    whiteSpace="pre-wrap"
    wordBreak="break-word"
    overflow="auto"
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
 * Button component to report error to assistant
 * Uses hooks to access session and tabbed header contexts
 */
type ReportErrorButtonProps = {
  errorMessage: string;
};

function ReportErrorButton({ errorMessage }: ReportErrorButtonProps) {
  const { queuePrompt } = useSession();
  const { highlightTab } = useTabbedHeaderContext();

  const handleClick = useCallback(() => {
    // Into the composer rather than straight down the wire: a render error is worth a
    // second look before it becomes a turn, and the user often knows what they changed.
    queuePrompt(
      `I encountered this error while rendering a composed page:\n\n${errorMessage}\n\nCan you help me fix it?`
    );
    // Highlight the assistant tab
    highlightTab('assistant');
  }, [errorMessage, queuePrompt, highlightTab]);

  return (
    <Button
      variant="outline"
      colorPalette="primary"
      onPress={handleClick}
      size="md"
    >
      Report Error to Assistant
    </Button>
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
        <Box width="900px" maxWidth="100%" marginX="auto">
          {/*
           * Alert.Root renders its own critical icon and lays its parts out on a
           * grid, so the content goes into Title / Description / Actions rather
           * than a single Stack dropped into the grid's first free cell.
           */}
          <Alert.Root colorPalette="critical" variant="outlined">
            <Alert.Title>
              {parsed.errorType}
              {parsed.componentName && ` in "${parsed.componentName}"`}
              {parsed.phase && ` (${parsed.phase})`}
            </Alert.Title>

            <Alert.Description>
              <Stack direction="column" gap="200">
                <Text>{parsed.message}</Text>

                {parsed.location && (
                  <Text fontSize="350" color="neutral.11">
                    Location: {parsed.location}
                  </Text>
                )}

                {parsed.suggestion && (
                  <Box
                    bg="critical.2"
                    borderWidth="1px"
                    borderStyle="solid"
                    borderColor="critical.6"
                    borderRadius="100"
                    p="300"
                  >
                    <Text fontWeight="600">Suggestion:</Text>
                    <Text>{parsed.suggestion}</Text>
                  </Box>
                )}

                {parsed.codeSnippet && (
                  <Stack direction="column" gap="100">
                    <Text fontSize="350" fontWeight="600">
                      Code snippet:
                    </Text>
                    <ErrorCodeBlock>{parsed.codeSnippet}</ErrorCodeBlock>
                  </Stack>
                )}

                {(parsed.stack || errorInfo?.componentStack) && (
                  /*
                   * Accordion replaces a <details>/<summary> pair that was styled
                   * with inline CSS. Same collapsed-by-default behaviour, but it
                   * carries the aria-expanded/controls wiring for free.
                   */
                  <Accordion.Root>
                    <Accordion.Item value="technical-details">
                      <Accordion.Header>
                        Show technical details
                      </Accordion.Header>
                      <Accordion.Content>
                        <Stack direction="column" gap="200">
                          {parsed.stack && (
                            <Stack direction="column" gap="100">
                              <Text fontSize="350" fontWeight="600">
                                Stack Trace:
                              </Text>
                              <ErrorCodeBlock>{parsed.stack}</ErrorCodeBlock>
                            </Stack>
                          )}
                          {errorInfo?.componentStack && (
                            <Stack direction="column" gap="100">
                              <Text fontSize="350" fontWeight="600">
                                Component Stack:
                              </Text>
                              <ErrorCodeBlock>
                                {errorInfo.componentStack}
                              </ErrorCodeBlock>
                            </Stack>
                          )}
                        </Stack>
                      </Accordion.Content>
                    </Accordion.Item>
                  </Accordion.Root>
                )}
              </Stack>
            </Alert.Description>

            <Alert.Actions>
              <ReportErrorButton errorMessage={parsed.message} />
            </Alert.Actions>
          </Alert.Root>
        </Box>
      );
    }

    return this.props.children;
  }
}

export default UIErrorBoundary;
