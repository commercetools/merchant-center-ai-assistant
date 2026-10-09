/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { HighlightAlt } from '@commercetools/nimbus-icons';
import { ToggleButton } from '@commercetools/nimbus';

type TAnnotateToggleProps = {
  isSelected: boolean;
  onChange: (isSelected: boolean) => void;
};

/**
 * Arms and disarms annotation mode.
 *
 * The switch is ours rather than Agentation's because the scope guard has to know when the
 * mode is on, and the package exposes no "picking started" callback - only an undocumented
 * `data-active` attribute on an element inside its shadow root. Owning the state also means
 * the toolbar is not mounted at all until it is asked for, so nothing listens on `window`
 * while the user is just looking at the preview.
 */
const AnnotateToggle = ({ isSelected, onChange }: TAnnotateToggleProps) => (
  <ToggleButton
    isSelected={isSelected}
    onChange={onChange}
    size="md"
    variant="outline"
    colorPalette="primary"
  >
    <HighlightAlt />
    {isSelected ? 'Done annotating' : 'Annotate preview'}
  </ToggleButton>
);

export default AnnotateToggle;
