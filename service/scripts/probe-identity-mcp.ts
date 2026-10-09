/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

/**
 * Probe a Managed MCP Server's OAuth discovery chain.
 *
 *   npm run probe:identity -- <serverKey> [apiRegion]
 *
 * `apiRegion` is the API host spelling (`us-central1.gcp`); it defaults to `CTP_REGION`, then
 * `us-central1.gcp`. The project key comes from `CTP_PROJECT_KEY` (default `zzz-probe`: the
 * metadata of any server name is template-generated, so a placeholder still shows the shape).
 *
 * Read-only: unauthenticated requests plus one unauthenticated registration POST that is
 * expected to be refused. Registers nothing, stores nothing, needs no credentials.
 *
 * Exit codes: 0 verdict `auth2`; 1 any other verdict; 2 the script could not run.
 */
import { probeIdentityMcp } from '../src/identity-mcp/discovery';
import { managedMcpUrl } from '../src/identity-mcp/region';

const USAGE =
  'Usage: npm run probe:identity -- <serverKey> [apiRegion]\n' +
  '  apiRegion defaults to CTP_REGION, then us-central1.gcp\n' +
  '  project key comes from CTP_PROJECT_KEY';

const out = (line = ''): void => {
  process.stdout.write(`${line}\n`);
};

async function main(): Promise<number> {
  const [serverKey, regionArg] = process.argv.slice(2);
  if (!serverKey) {
    process.stderr.write(`${USAGE}\n`);
    return 2;
  }
  if (serverKey.includes('://') || !/^[A-Za-z0-9_-]{2,256}$/.test(serverKey)) {
    process.stderr.write(
      `Invalid serverKey ${JSON.stringify(serverKey)}. Pass only the key, not the URL.\n\n${USAGE}\n`
    );
    return 2;
  }
  const apiRegion = regionArg || process.env.CTP_REGION || 'us-central1.gcp';
  if (!/^[a-z0-9-]+\.(gcp|aws)$/.test(apiRegion)) {
    process.stderr.write(`Invalid apiRegion ${JSON.stringify(apiRegion)}.\n\n${USAGE}\n`);
    return 2;
  }
  const projectKey = process.env.CTP_PROJECT_KEY || 'zzz-probe';
  const mcpUrl = managedMcpUrl(apiRegion, projectKey, serverKey);

  out(`\nProbing ${mcpUrl}\n`);
  const result = await probeIdentityMcp({ apiRegion, mcpUrl });

  out('================ VERDICT ================');
  out(`  verdict                  ${result.verdict}`);
  out(`  authorization_servers    ${result.authorizationServers.join(', ') || '(none)'}`);
  out(`  expected for this region ${result.expectedAuthorizationServer}`);
  out(`  resource                 ${result.resource ?? '(absent)'}`);
  out(`  scopes_supported         ${(result.scopesSupported ?? []).join(', ') || '(none)'}`);
  if (result.asMetadata) {
    out(`  registration_endpoint    ${result.asMetadata.registrationEndpoint ?? '(ABSENT)'}`);
    out(`  grant_types              ${(result.asMetadata.grantTypes ?? []).join(', ') || '(none)'}`);
    out(
      `  pkce methods             ${(result.asMetadata.codeChallengeMethods ?? []).join(', ') || '(none)'}`
    );
  }
  if (result.dcrReachable !== undefined) {
    out(`  registration reachable   ${result.dcrReachable} (${result.dcrDetail})`);
  }
  if (result.problems.length > 0) {
    out(`  problems                 ${result.problems.join('; ')}`);
  }
  out('=========================================\n');

  switch (result.verdict) {
    case 'auth2':
      out('PASS - the server names the identity-mode authorization server.');
      return 0;
    case 'client-credentials-as':
      out(
        'The metadata names the ClientCredentials authorization server. For a server\n' +
          'configured as CommercetoolsIdentity this is the decisive negative result (or the\n' +
          'metadata is mode-blind: it is template-generated for any server name).'
      );
      return 1;
    case 'upstream-idp':
      out('The metadata names the upstream user IdP, which refuses dynamic registration.');
      return 1;
    case 'no-metadata':
      out('No authorization server was advertised.');
      return 1;
    default:
      out('Unrecognised topology - read the values above before proceeding.');
      return 1;
  }
}

main()
  .then((code) => process.exit(code))
  .catch((error: unknown) => {
    process.stderr.write(
      `Probe could not run: ${error instanceof Error ? error.message : String(error)}\n`
    );
    process.exit(2);
  });
