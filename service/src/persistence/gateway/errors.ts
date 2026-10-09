/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

/** Base class of everything the persistence layer throws on purpose. */
export class PersistenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class NotFoundError extends PersistenceError {}

/** Stale version, or an object that already exists where a new one was required. */
export class ConflictError extends PersistenceError {
  constructor(
    message = 'Conflict, please retry',
    readonly currentVersion?: number
  ) {
    super(message);
  }
}

export class TooLargeError extends PersistenceError {}

/** A container, key or caller-supplied id failed validation. Mapped to 404. */
export class InvalidIdError extends PersistenceError {}

/** limit, offset or sort outside what the platform allows. */
export class QueryLimitError extends PersistenceError {}

/** Transient failure that survived the retry policy. Mapped to 503. */
export class UnavailableError extends PersistenceError {}

/** A value failed domain validation before anything was written. Mapped to 400. */
export class ValidationError extends PersistenceError {}

/** More messages than the 10 000 offset ceiling allows to read. */
export class SessionTooLongError extends PersistenceError {}
