/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

type ErrorItem = {
  statusCode: number | string;
  message: string;
  referencedBy?: string;
};

class CustomError extends Error {
  statusCode: number | string;
  message: string;
  errors?: ErrorItem[];
  /** Stable machine-readable code (for example ADMIN_REQUIRED). */
  code?: string;

  constructor(
    statusCode: number | string,
    message: string,
    errorsOrOptions?: ErrorItem[] | { code: string }
  ) {
    super(message);
    this.statusCode = statusCode;
    this.message = message;
    if (Array.isArray(errorsOrOptions)) {
      this.errors = errorsOrOptions;
    } else if (errorsOrOptions) {
      this.code = errorsOrOptions.code;
    }
  }
}

export default CustomError;
