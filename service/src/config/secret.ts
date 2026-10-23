/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

/**
 * Holds a secret value so it cannot leak through JSON.stringify, string
 * interpolation or util.inspect (console / logger output of a whole config).
 * Call reveal() at the single place that needs the value.
 */
export class Secret<T> {
  constructor(private readonly value: T) {}

  reveal(): T {
    return this.value;
  }

  toJSON(): string {
    return '[secret]';
  }

  toString(): string {
    return '[secret]';
  }

  [Symbol.for('nodejs.util.inspect.custom')](): string {
    return '[secret]';
  }
}
