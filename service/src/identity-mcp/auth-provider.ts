/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { randomBytes } from 'node:crypto';
import type {
  OAuthAuthorizationServerInformation,
  OAuthClientInformation,
  OAuthClientMetadata,
  OAuthClientProvider,
  OAuthTokens,
} from '@ai-sdk/mcp';
import type { AppConfig } from '../config';
import { getContext } from '../context/request-context';
import { CryptoError, decryptJson, encryptJson } from '../crypto/envelope';
import {
  IDENTITY_CLIENT_AAD,
  identityTokensAad,
  identityVerifierAad,
} from '../crypto/aad';
import { logger } from '../utils/logger.utils';
import { AUTH_STATE_TTL_MS } from './constants';
import { callbackUrl, identityScope } from './keys';
import type { IdentityStores } from './ports';
import { auth2Url, isCommercetoolsAuthHost } from './region';
import type {
  AuthStateRecord,
  IdentityBinding,
  IdentityMcpClient,
  IdentityMcpClientSecrets,
  IdentityMcpTokenSecrets,
} from './types';

/**
 * The `OAuthClientProvider` that lets the service reach a `CommercetoolsIdentity`-mode
 * Managed MCP Server.
 *
 * `@ai-sdk/mcp` ships the whole OAuth client (discovery, RFC 7591 registration, PKCE S256,
 * the state check, code exchange, refresh, a de-duplicated 401 retry). This file supplies
 * storage and two policy decisions only. A provider is built fresh per request from
 * `(binding, userId, mode)`; every method reads or writes persistence on demand, so nothing
 * depends on which instance serves the request.
 *
 * The three modes matter:
 * - `authorize`: a user clicked Connect. The ONLY mode that may start an attempt or stage a
 *   code verifier.
 * - `callback`: the browser came back with a code; reads the attempt that `authorize` stored.
 * - `runtime`: a tool call needs a bearer. Must never start an interactive flow: there is no
 *   browser attached, and saving a verifier would overwrite the user's live pending attempt.
 */

export type IdentityAuthMode = 'authorize' | 'callback' | 'runtime';

export interface IdentityProviderOptions {
  config: Pick<AppConfig, 'auth' | 'ctp'>;
  binding: IdentityBinding;
  userId: string;
  mode: IdentityAuthMode;
  /** The `authorize`-leg attempt, loaded and claimed before the exchange. */
  loadedState?: AuthStateRecord;
  stores: IdentityStores;
}

/**
 * Drop the authorization-server pin `@ai-sdk/mcp` folds into saved client information and
 * tokens (`issuer`, `authorization_server`, `token_endpoint`). The SDK prefers the embedded
 * copy to `authorizationServerInformation()`, so as long as it is present the provider's own
 * pin is bypassed; records written before the 2026-09-30 issuer change still carry it.
 */
const withoutEmbeddedAuthorizationServer = <T extends Record<string, unknown>>(
  value: T
): T => {
  const copy: Record<string, unknown> = { ...value };
  delete copy.issuer;
  delete copy.authorization_server;
  delete copy.token_endpoint;
  return copy as T;
};

const LOG_PREFIX = '[mcp-identity]';

export class IdentityMcpAuthProvider implements OAuthClientProvider {
  /** Set by {@link redirectToAuthorization} in `authorize` mode. */
  capturedAuthorizationUrl?: URL;

  private readonly config: IdentityProviderOptions['config'];
  private readonly binding: IdentityBinding;
  private readonly userId: string;
  private readonly mode: IdentityAuthMode;
  private readonly loadedState?: AuthStateRecord;
  private readonly stores: IdentityStores;

  /** The stored client; kept current so the SDK sees its own registration within one call. */
  private client: IdentityMcpClient | undefined;
  /** Version of the token record read by `tokens()`, for compare-and-delete. */
  private tokenVersion: number | undefined;
  /** What the last `tokens()` call found (`unread` before the first call). */
  private tokenState: 'unread' | 'absent' | 'present' = 'unread';
  /**
   * Accumulated during the authorize leg and written as ONE record afterwards: the SDK calls
   * `saveState()` and `saveCodeVerifier()` separately, and half an attempt must never be
   * persisted.
   */
  private pending: { state?: string; codeVerifier?: string } = {};

  constructor(options: IdentityProviderOptions) {
    this.config = options.config;
    this.binding = options.binding;
    this.userId = options.userId;
    this.mode = options.mode;
    this.loadedState = options.loadedState;
    this.stores = options.stores;
    this.client = options.binding.client;
  }

  private get projectKey(): string {
    return this.config.ctp.projectKey;
  }

  private get region(): string {
    return this.config.ctp.region;
  }

  /** Never contains the user id, a code, a state or a token. */
  private log(message: string): string {
    return (
      `${LOG_PREFIX} rid=${getContext()?.requestId?.slice(0, 8) ?? '-'} ` +
      `srv=${this.binding.serverKey} mode=${this.mode} ${message}`
    );
  }

  private expectedAuth2Origin(): string {
    return new URL(auth2Url(this.region)).origin;
  }

  private currentScope(): string {
    return identityScope(this.projectKey, this.binding.serverKey);
  }

  // -- Redirect and client metadata ------------------------------------------------------

  get redirectUrl(): string {
    return callbackUrl(this.config);
  }

  get clientMetadata(): OAuthClientMetadata {
    return {
      client_name: 'commercetools AI Assistant',
      redirect_uris: [this.redirectUrl],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      scope: this.currentScope(),
      // `application_type` and `token_endpoint_auth_method` stay unset on purpose: the SDK
      // derives `web` from the https redirect and the authorization server picks the method.
    };
  }

  // -- Client registration ---------------------------------------------------------------

  async clientInformation(): Promise<OAuthClientInformation | undefined> {
    const stored = this.client;
    if (!stored) return undefined;

    // A registration is bound to the exact redirect URI and scope it was made with; when
    // either moved (another deployment host), treat it as unusable and let the SDK register
    // again. Registration is unauthenticated, so this costs one request.
    const currentRedirectUri = this.redirectUrl;
    if (stored.redirectUri !== currentRedirectUri) {
      logger.warn(
        this.log(
          `CLIENT_STALE_REDIRECT stored=${stored.redirectUri} current=${currentRedirectUri} ` +
            '- discarding and re-registering'
        )
      );
      return undefined;
    }
    const currentScope = this.currentScope();
    if ((stored.registeredScope ?? '') !== currentScope) {
      logger.warn(
        this.log(
          `CLIENT_STALE_SCOPE stored="${stored.registeredScope ?? ''}" current="${currentScope}" ` +
            '- discarding and re-registering'
        )
      );
      return undefined;
    }

    try {
      const secrets = decryptJson<IdentityMcpClientSecrets>(
        'identity-client',
        stored.encryptedClient,
        IDENTITY_CLIENT_AAD
      );
      return withoutEmbeddedAuthorizationServer(
        secrets
      ) as unknown as OAuthClientInformation;
    } catch (error) {
      if (!(error instanceof CryptoError)) throw error;
      logger.error(
        this.log(
          `CLIENT_UNREADABLE ${error.name} - discarding and re-registering (wrong ENCRYPTION_KEY?)`
        )
      );
      return undefined;
    }
  }

  async saveClientInformation(
    clientInformation: OAuthClientInformation
  ): Promise<void> {
    const secrets = clientInformation as unknown as IdentityMcpClientSecrets;
    // Persist issuer + token endpoint for diagnosis only; the authorization server URL is
    // derived from the region, never round-tripped from storage.
    const record: IdentityMcpClient = {
      encryptedClient: encryptJson(
        'identity-client',
        secrets,
        IDENTITY_CLIENT_AAD
      ),
      clientIdPrefix: String(secrets.client_id).slice(0, 6),
      redirectUri: this.redirectUrl,
      registeredScope: this.currentScope(),
      issuer: typeof secrets.issuer === 'string' ? secrets.issuer : undefined,
      tokenEndpoint:
        typeof secrets.token_endpoint === 'string'
          ? secrets.token_endpoint
          : undefined,
      registeredAt: Date.now(),
    };

    if (secrets.client_secret) {
      logger.warn(
        this.log(
          `DCR_RETURNED_SECRET len=${String(secrets.client_secret).length} - encrypting it; ` +
            'the authorization server did not accept a public client'
        )
      );
    }

    await this.stores.binding.setClient(record);
    this.client = record;
  }

  /**
   * The authorization-server pin. `issuer` is deliberately left out so the SDK skips the
   * exact-string issuer comparison: on 2026-09-30 auth2 dropped the trailing slash of its
   * issuer and every stored credential then failed the check. The origin restriction in
   * {@link validateAuthorizationServerURL} plus the compared authorization-server URL and
   * token endpoint already pin what matters. Never pin `issuer` here.
   */
  async authorizationServerInformation(): Promise<
    OAuthAuthorizationServerInformation | undefined
  > {
    const stored = this.client;
    if (!stored?.tokenEndpoint) return undefined;
    return {
      authorizationServerUrl: auth2Url(this.region),
      tokenEndpoint: stored.tokenEndpoint,
    };
  }

  async saveAuthorizationServerInformation(
    info: OAuthAuthorizationServerInformation
  ): Promise<void> {
    const stored = this.client;
    // Nothing to attach it to yet; `saveClientInformation` records the same values from the
    // registration response moments later.
    if (!stored) return;
    const next: IdentityMcpClient = {
      ...stored,
      issuer: info.issuer,
      tokenEndpoint: info.tokenEndpoint,
    };
    await this.stores.binding.setClient(next);
    this.client = next;
  }

  // -- Tokens ----------------------------------------------------------------------------

  /** `true` when the last `tokens()` call found no usable record for this user. */
  get hadNoToken(): boolean {
    return this.tokenState === 'absent';
  }

  async tokens(): Promise<OAuthTokens | undefined> {
    this.tokenVersion = undefined;
    this.tokenState = 'absent';
    const found = await this.stores.tokens.get(this.userId);
    if (!found) return undefined;
    const { record, version } = found;

    if (record.bindingConnectedAt !== this.binding.connectedAt) {
      logger.warn(
        this.log(
          `TOK_STALE_BINDING tokenRevision=${record.bindingConnectedAt ?? 'ABSENT'} ` +
            `bindingRevision=${this.binding.connectedAt} - deleting tokens issued for an older binding`
        )
      );
      await this.stores.tokens.deleteIfVersion(this.userId, version);
      return undefined;
    }

    let secrets: IdentityMcpTokenSecrets;
    try {
      secrets = decryptJson<IdentityMcpTokenSecrets>(
        'identity-tokens',
        record.encryptedTokens,
        identityTokensAad(this.userId)
      );
    } catch (error) {
      if (!(error instanceof CryptoError)) throw error;
      // Not deleted: a wrong key during a rotation must not destroy everybody's consent.
      logger.error(
        this.log(
          `TOK_UNREADABLE ${error.name} - treating the user as not connected`
        )
      );
      return undefined;
    }

    this.tokenVersion = version;
    this.tokenState = 'present';
    // Returned even when expired: the SDK sends, takes the 401 and refreshes through its own
    // de-duplicated path. Returning undefined would lose the refresh token.
    return withoutEmbeddedAuthorizationServer(
      secrets
    ) as unknown as OAuthTokens;
  }

  async saveTokens(tokens: OAuthTokens): Promise<void> {
    const secrets = tokens as unknown as IdentityMcpTokenSecrets;
    const now = Date.now();

    if (!secrets.refresh_token) {
      logger.warn(
        this.log(
          `TOK_NO_REFRESH scopeSent="${this.currentScope()}" scopeGranted="${
            secrets.scope ?? 'ABSENT'
          }" - every tool call will need a new consent; check that the authorization ` +
            'server granted offline_access'
        )
      );
    }

    const outcome = await this.stores.tokens.put({
      userId: this.userId,
      serverKey: this.binding.serverKey,
      encryptedTokens: encryptJson('identity-tokens', secrets, identityTokensAad(this.userId)),
      accessTokenExpiresAt: secrets.expires_in
        ? now + secrets.expires_in * 1000
        : undefined,
      hasRefreshToken: Boolean(secrets.refresh_token),
      scope: secrets.scope,
      issuedAt: now,
      updatedAt: now,
      bindingConnectedAt: this.binding.connectedAt,
    });
    // The stored record has a new version now; a later invalidate must re-read first.
    this.tokenVersion = undefined;

    if (outcome === 'stale-ignored') {
      logger.warn(
        this.log(
          'TOK_STALE_IGNORED - a newer token set is already stored; this one arrived out of order'
        )
      );
    }
  }

  /**
   * Called by the SDK when the server rejects our credentials. Token deletion is
   * compare-and-delete on the version `tokens()` read: with refresh-token rotation and two
   * instances, a slow instance must not delete the record another instance just stored.
   */
  async invalidateCredentials(
    scope: 'all' | 'client' | 'tokens' | 'verifier'
  ): Promise<void> {
    logger.warn(this.log(`INVALIDATE scope=${scope}`));

    if (scope === 'tokens' || scope === 'all') {
      if (this.tokenVersion !== undefined) {
        const result = await this.stores.tokens.deleteIfVersion(
          this.userId,
          this.tokenVersion
        );
        if (result === 'conflict') {
          logger.warn(
            this.log(
              'INVALIDATE_SKIPPED_NEWER - another request stored newer tokens; keeping them'
            )
          );
        }
      } else if (scope === 'all' && this.mode === 'authorize') {
        // Nothing was read, so nothing newer can be lost: this leg is about to start over.
        await this.stores.tokens.delete(this.userId);
      } else {
        logger.warn(
          this.log(
            'INVALIDATE_SKIPPED_NO_VERSION - tokens were never read; not deleting'
          )
        );
      }
    }

    if (scope === 'client' || scope === 'all') {
      await this.stores.binding.setClient(null);
      this.client = undefined;
    }
    // 'verifier' needs no action: an attempt is single-use and already claimed.
  }

  // -- The authorization attempt ---------------------------------------------------------

  /** A fresh 256-bit state (43 base64url characters). Only this service ever generates one. */
  async state(): Promise<string> {
    if (this.mode === 'callback') {
      // The state the browser presented, already loaded and claimed.
      return this.loadedState?.state ?? '';
    }
    const value = randomBytes(32).toString('base64url');
    this.pending.state = value;
    return value;
  }

  async saveState(state: string): Promise<void> {
    this.pending.state = state;
  }

  /**
   * Must never return `undefined` on the callback leg: the SDK only compares the callback's
   * state when a stored value is defined, so `undefined` would silently disable the check.
   */
  async storedState(): Promise<string | undefined> {
    if (this.mode === 'callback') {
      return this.loadedState?.state ?? '';
    }
    return this.pending.state;
  }

  async saveCodeVerifier(codeVerifier: string): Promise<void> {
    if (this.mode !== 'authorize') {
      // On the runtime path with no usable token `auth()` walks to `startAuthorization`,
      // which saves a verifier as a side effect. Persisting it would overwrite the user's
      // live pending attempt.
      logger.warn(
        this.log(
          'VERIFIER_DISCARDED - refusing to start an attempt outside the authorize leg'
        )
      );
      return;
    }
    this.pending.codeVerifier = codeVerifier;
  }

  async codeVerifier(): Promise<string> {
    if (this.mode === 'callback') {
      if (!this.loadedState) {
        throw new Error(
          'No authorization attempt loaded for this callback - the state was not claimed'
        );
      }
      const { codeVerifier } = decryptJson<{ codeVerifier: string }>(
        'identity-verifier',
        this.loadedState.encryptedVerifier,
        identityVerifierAad(this.loadedState.state)
      );
      return codeVerifier;
    }
    if (!this.pending.codeVerifier) {
      throw new Error('No code verifier staged for this authorization attempt');
    }
    return this.pending.codeVerifier;
  }

  async redirectToAuthorization(authorizationUrl: URL): Promise<void> {
    if (this.mode === 'runtime') {
      // Returning (not throwing) lets `auth()` end in 'REDIRECT', which the transport turns
      // into `UnauthorizedError`; the caller maps it to a named re-authorization signal.
      logger.warn(
        this.log(
          `REAUTH_REQUIRED would redirect to ${authorizationUrl.origin}${authorizationUrl.pathname} ` +
            'but no browser is attached to this request'
        )
      );
      return;
    }
    if (this.mode === 'callback') {
      throw new Error(
        'auth() asked to restart authorization during a callback - the code exchange fell ' +
          'through, which usually means the stored client or verifier did not match'
      );
    }
    this.capturedAuthorizationUrl = authorizationUrl;
  }

  // -- Policy hooks ----------------------------------------------------------------------

  /**
   * Refuse an authorization server that is not this region's auth2. The SDK checks the
   * protected-resource metadata URL against the MCP server but NOT the `authorization_servers`
   * array inside it; without this a misconfigured gateway could send the browser leg, and the
   * resulting user token, to an arbitrary host.
   */
  async validateAuthorizationServerURL(
    serverUrl: string | URL,
    authorizationServerUrl: string | URL
  ): Promise<void> {
    const asUrl = new URL(String(authorizationServerUrl));
    const mcpUrl = new URL(String(serverUrl));
    const expectedOrigin = this.expectedAuth2Origin();

    const family = asUrl.host.startsWith('auth2.')
      ? 'auth2 (IDENTITY)'
      : asUrl.host.startsWith('auth.identity.')
        ? 'auth.identity (UPSTREAM IdP - has no dynamic registration)'
        : asUrl.host.startsWith('auth.')
          ? 'auth (CLIENT-CREDENTIALS)'
          : asUrl.host === mcpUrl.host
            ? 'MCP HOST ITSELF - protected-resource discovery failed and the SDK fell back'
            : 'UNEXPECTED';

    // Only the unexpected selection is logged; the healthy case says nothing new.
    if (family !== 'auth2 (IDENTITY)' || asUrl.origin !== expectedOrigin) {
      logger.error(
        this.log(
          `AS_SELECTED as=${asUrl.origin} expected=${expectedOrigin} family=${family} ` +
            `(from the metadata of ${mcpUrl.origin})`
        )
      );
    }

    if (!isCommercetoolsAuthHost(asUrl.host)) {
      throw new Error(
        `Refusing authorization server ${asUrl.origin}: not a commercetools host. ` +
          'A user token would have been sent there.'
      );
    }
    if (asUrl.origin !== expectedOrigin) {
      throw new Error(
        `Refusing authorization server ${asUrl.origin}: expected ${expectedOrigin} for region ${this.region}`
      );
    }
  }

  /**
   * Decide the RFC 8707 `resource` parameter ourselves: the SDK's default throws before
   * anything else when the metadata's `resource` is not the MCP URL or a prefix of it. A
   * mismatch is logged and the derived MCP URL is used (no env switch).
   */
  async validateResourceURL(
    serverUrl: string | URL,
    resource?: string
  ): Promise<URL | undefined> {
    const derived = new URL(String(serverUrl));
    if (!resource) return derived;

    const advertised = new URL(resource);
    const matches =
      advertised.origin === derived.origin &&
      derived.pathname.startsWith(advertised.pathname.replace(/\/$/, ''));
    if (matches) return advertised;

    logger.error(
      this.log(
        `RESOURCE_MISMATCH advertised=${advertised.href} derived=${derived.href} - using the derived value`
      )
    );
    return derived;
  }

  // -- Persisting the attempt ------------------------------------------------------------

  /**
   * Write the staged attempt as one record. Called by the authorize controller after
   * `auth()` returned 'REDIRECT'; state and verifier are persisted together or not at all.
   */
  async persistPendingAttempt(): Promise<string> {
    if (this.mode !== 'authorize') {
      throw new Error(
        `persistPendingAttempt is only valid on the authorize leg (mode=${this.mode})`
      );
    }
    const { state, codeVerifier } = this.pending;
    if (!state || !codeVerifier) {
      throw new Error(
        `Incomplete authorization attempt: state=${state ? 'yes' : 'no'}, verifier=${
          codeVerifier ? 'yes' : 'no'
        }`
      );
    }

    const now = Date.now();
    await this.stores.authStates.create({
      state,
      userId: this.userId,
      encryptedVerifier: encryptJson(
        'identity-verifier',
        { codeVerifier },
        identityVerifierAad(state)
      ),
      redirectUri: this.redirectUrl,
      authorizationServerUrl: auth2Url(this.region),
      bindingConnectedAt: this.binding.connectedAt,
      createdAt: now,
      expiresAt: now + AUTH_STATE_TTL_MS,
    });
    return state;
  }
}

export const createIdentityMcpAuthProvider = (
  options: IdentityProviderOptions
): IdentityMcpAuthProvider => new IdentityMcpAuthProvider(options);
