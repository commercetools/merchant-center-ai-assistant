/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

// jsdom has no web streams and the AI SDK uses them while it loads; Node has them. Only fills
// in what is missing, so it changes nothing for the other specs.
const web = require('node:stream/web');
const util = require('node:util');

for (const name of [
  'ReadableStream',
  'WritableStream',
  'TransformStream',
  'TextEncoderStream',
  'TextDecoderStream',
  'ByteLengthQueuingStrategy',
  'CountQueuingStrategy',
]) {
  if (!globalThis[name]) globalThis[name] = web[name];
}
if (!globalThis.TextEncoder) globalThis.TextEncoder = util.TextEncoder;
if (!globalThis.TextDecoder) globalThis.TextDecoder = util.TextDecoder;
