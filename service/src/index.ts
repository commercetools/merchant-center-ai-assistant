/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import app from './app';

const PORT = Number(process.env.PORT) || 8080;

app.listen(PORT, () => {
  process.stdout.write(`service listening on ${PORT}\n`);
});
