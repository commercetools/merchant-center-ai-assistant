/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import React, { useMemo, useCallback } from 'react';
import { Alert, Button, Card, Flex, Stack, Text } from '@commercetools/nimbus';
import {
  Download,
  InsertDriveFile,
  TableChart,
} from '@commercetools/nimbus-icons';

/**
 * Export success data structure
 */
interface ExportData {
  success: true;
  content: string;
  mimeType: string;
  filename: string;
  rowCount: number;
  columnCount: number;
}

/**
 * Export error data structure
 */
interface ExportErrorData {
  success: false;
  error: string;
  hint: string;
}

type ExportResult = ExportData | ExportErrorData;

interface ExportPartProps {
  output: unknown;
}

/**
 * Type guard for export success data
 */
const isExportData = (output: unknown): output is ExportData => {
  if (!output || typeof output !== 'object') return false;
  const obj = output as Record<string, unknown>;
  return (
    obj.success === true &&
    typeof obj.content === 'string' &&
    typeof obj.mimeType === 'string' &&
    typeof obj.filename === 'string'
  );
};

/**
 * Type guard for export error data
 */
const isExportError = (output: unknown): output is ExportErrorData => {
  if (!output || typeof output !== 'object') return false;
  const obj = output as Record<string, unknown>;
  return obj.success === false && typeof obj.error === 'string';
};

/**
 * Get file icon based on mime type
 *
 * Both branches used to return the same CSV glyph. CSV now gets a table, everything else the
 * generic document - the distinction the function was written to make, which the Tabler icon
 * set had no second glyph for.
 */
const getFileIcon = (mimeType: string) => {
  if (mimeType === 'text/csv') {
    return <TableChart />;
  }
  return <InsertDriveFile />;
};

/**
 * Trigger browser file download from base64 content
 */
const downloadFile = (
  content: string,
  filename: string,
  mimeType: string
): void => {
  // Decode base64 content
  const binaryString = atob(content);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  // Create blob and download
  const blob = new Blob([bytes], { type: mimeType });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  // Clean up the URL object
  URL.revokeObjectURL(url);
};

/**
 * The result of an export tool call: a card naming the generated file and offering it for
 * download, or an alert explaining why nothing was generated.
 *
 * `ExportBlock`/`ExportHeader`/`HeaderLeft`/`FileIcon`/`FileInfo`/`FileName`/`FileMeta` were
 * a green-tinted card built by hand; `Card` + `Flex`/`Stack`/`Text` are the same layout in
 * design-system tokens. `DownloadButton` is a Nimbus `Button` with `onPress`, not `onClick`
 * - the mechanical rename compiles but skips react-aria's press handling, so the button
 * would stop responding to keyboard activation.
 *
 * The `svg { width: 16px }` and `svg { width: 20px }` descendant rules are gone. Nimbus
 * icons are `1em` square, so the button recipe's own font size sizes the download icon, and
 * the `fontSize` on the file-icon tile sizes that one - no descendant selectors.
 */
export const ExportPart: React.FC<ExportPartProps> = ({ output }) => {
  // Parse and validate the export data
  const exportResult = useMemo((): ExportResult | null => {
    if (isExportData(output)) {
      return output;
    }
    if (isExportError(output)) {
      return output;
    }
    return null;
  }, [output]);

  const handleDownload = useCallback(() => {
    if (exportResult && exportResult.success) {
      downloadFile(
        exportResult.content,
        exportResult.filename,
        exportResult.mimeType
      );
    }
  }, [exportResult]);

  if (!exportResult) {
    return null;
  }

  // Handle error state
  //
  // `ErrorBlock`/`ErrorTitle`/`ErrorMessage`/`ErrorHint` were a red-tinted div and three
  // text styles. `Alert` is that, and it also supplies `role="alert"` and the critical icon,
  // which the hand-rolled version had no equivalent of. Its parts have to stay direct
  // children of `Alert.Root` - the root owns the layout grid - so the hint is nested inside
  // the description rather than wrapped alongside it.
  if (!exportResult.success) {
    return (
      <Alert.Root colorPalette="critical">
        <Alert.Title>Export Error</Alert.Title>
        <Alert.Description>
          {exportResult.error}
          {exportResult.hint && (
            <Text fontSize="300" fontStyle="italic" color="neutral.11">
              {exportResult.hint}
            </Text>
          )}
        </Alert.Description>
      </Alert.Root>
    );
  }

  // Success state - render the download card
  const { filename, mimeType, rowCount, columnCount } = exportResult;

  return (
    <Card.Root
      variant="outlined-muted"
      colorPalette="positive"
      size="sm"
      my="400"
    >
      <Card.Header>
        <Flex align="center" justify="space-between" gap="400">
          <Flex align="center" gap="200" minW="0">
            <Flex
              align="center"
              justify="center"
              boxSize="900"
              flexShrink="0"
              borderRadius="150"
              bg="positive.3"
              color="positive.11"
              fontSize="500"
            >
              {getFileIcon(mimeType)}
            </Flex>
            <Stack direction="column" gap="50" minW="0">
              <Text fontSize="350" fontWeight="500" color="neutral.12">
                {filename}
              </Text>
              <Text fontSize="300" fontFamily="mono" color="neutral.11">
                {rowCount} rows, {columnCount} columns
              </Text>
            </Stack>
          </Flex>
          <Button
            variant="outline"
            colorPalette="positive"
            size="xs"
            flexShrink="0"
            onPress={handleDownload}
          >
            <Download />
            Download
          </Button>
        </Flex>
      </Card.Header>
    </Card.Root>
  );
};

export default ExportPart;
