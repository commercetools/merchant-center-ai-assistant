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

  constructor(
    statusCode: number | string,
    message: string,
    errors?: ErrorItem[]
  ) {
    super(message);
    this.statusCode = statusCode;
    this.message = message;
    if (errors) {
      this.errors = errors;
    }
  }
}

export default CustomError;
