/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import React from 'react';
import { ChatMessage } from '@commercetools/nimbus';
import { IconRobot } from '@tabler/icons-react';

/**
 * The assistant's avatar.
 *
 * `ChatMessage.Avatar` would supply its own `AutoAwesome` sparkle for an unconfigured agent;
 * passing `children` overrides that. Note that in Nimbus `Avatar`, `children` takes
 * unconditional precedence over `src` - fine here, the agent has no image.
 *
 * The icon comes from `@tabler/icons-react`, not from the raw `@tabler/icons` SVG: mc-scripts
 * only runs SVGR over files named `*.react.svg`, so importing the package's `.svg` yields a
 * `data:image/svg+xml,…` string from `svg-url-loader`, which can only be an `<img>` - and an
 * `<img>` cannot inherit `currentColor`, so it would render black on the avatar's solid
 * surface. The React package tree-shakes to this one icon.
 *
 * Tabler defaults the svg to a fixed `size={24}`, but the Nimbus avatar recipe sets
 * `_icon: { boxSize: "500" }` for `size="xs"`, and CSS beats the width/height attributes - so
 * the icon follows the avatar's size rather than that default.
 *
 * Named rather than decorative. Nimbus hides an avatar from assistive technology unless it
 * is given a name, on the grounds that the sender is conveyed by the message's own
 * semantics - but this transcript dropped its "You"/"Assistant" captions when it moved onto
 * `ChatMessage`, so with no name here there would be nothing left saying who is speaking.
 */
export const AgentAvatar: React.FC = () => (
  <ChatMessage.Avatar aria-label="AI assistant"  colorPalette="primary">
    <IconRobot />
  </ChatMessage.Avatar>
);
