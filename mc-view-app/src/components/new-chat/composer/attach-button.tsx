/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import React, { useCallback } from 'react';
import { AttachFile } from '@commercetools/nimbus-icons';
import { Button, FileTrigger } from '@commercetools/nimbus';

// Kept as an array: `FileTrigger` maps `acceptedFileTypes` onto the hidden input's
// `accept` attribute itself, so a comma-joined string is not needed.
const ACCEPTED_FILE_TYPES = ['.txt', '.csv', '.log', 'image/*'];

type Props = {
  onFilesChange?: (files: FileList | undefined) => void;
  isDisabled?: boolean;
};

/**
 * Opens the native file picker.
 *
 * Labelled rather than icon-only. It sits in a row with Tools, and two bare icons side by
 * side in the corner of a text box read as decoration; the words are what make them look
 * like the controls they are.
 *
 * Nimbus `FileTrigger` owns the hidden input and wires it to any pressable child, so there
 * is no hand-rolled `<input type="file" hidden>` plus `ref.click()` pair here.
 */
export const AttachButton: React.FC<Props> = ({
  onFilesChange,
  isDisabled = false,
}) => {
  const handleSelect = useCallback(
    (files: FileList | null) => {
      // An empty or cancelled selection must not clear an existing attachment.
      if (files && files.length > 0) onFilesChange?.(files);
    },
    [onFilesChange]
  );

  return (
    <FileTrigger
      acceptedFileTypes={ACCEPTED_FILE_TYPES}
      allowsMultiple
      onSelect={handleSelect}
    >
      <Button variant="ghost" size="xs" isDisabled={isDisabled}>
        <AttachFile />
        Attach
      </Button>
    </FileTrigger>
  );
};
