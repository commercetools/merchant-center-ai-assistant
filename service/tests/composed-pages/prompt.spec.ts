/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from '@jest/globals';
import { NIMBUS_LOOKUP_TOOLS } from '../../src/composed-pages/constants';
import { getCommercetoolsUIPrompt } from '../../src/composed-pages/prompt/commercetools-ui.prompt';
import { NIMBUS_VERSION } from '../../src/composed-pages/prompt/nimbus-surface.generated';

describe('page-generation prompt', () => {
  const on = getCommercetoolsUIPrompt({ locale: 'de' }, { nimbusTools: true });
  const off = getCommercetoolsUIPrompt(
    { locale: 'de' },
    { nimbusTools: false }
  );

  it('with Nimbus tools: lists every lookup tool and batches get_components', () => {
    expect(on).toContain('Look up the Nimbus API');
    for (const name of Object.values(NIMBUS_LOOKUP_TOOLS)) {
      expect(on).toContain(name);
    }
    expect(on).toMatch(/ONE .*get_components.* call/);
  });

  it('without Nimbus tools: no lookup section and no mention of the tools, scope list stays', () => {
    expect(off).not.toContain('Look up the Nimbus API');
    for (const name of Object.values(NIMBUS_LOOKUP_TOOLS)) {
      expect(off).not.toContain(name);
    }
    expect(off).toContain('What is in scope in generated code');
    expect(off).toContain('PageContent*');
  });

  it('with hasTool: mentions only the Nimbus tools the merged set has', () => {
    const only = new Set([NIMBUS_LOOKUP_TOOLS.getComponents, NIMBUS_LOOKUP_TOOLS.searchIcons]);
    const prompt = getCommercetoolsUIPrompt(
      { locale: 'en' },
      { nimbusTools: true, hasTool: (n) => only.has(n as never) }
    );
    expect(prompt).toContain('`get_components`');
    expect(prompt).toContain('`search_icons`');
    for (const gone of [
      NIMBUS_LOOKUP_TOOLS.listComponents,
      NIMBUS_LOOKUP_TOOLS.getTokens,
      NIMBUS_LOOKUP_TOOLS.searchDocs,
      NIMBUS_LOOKUP_TOOLS.getDocsPage,
      NIMBUS_LOOKUP_TOOLS.migrateFromUikit,
    ]) {
      expect(prompt).not.toContain(gone);
    }
  });

  it('with hasTool saying none: identical to nimbusTools false, whatever nimbusTools says', () => {
    const none = getCommercetoolsUIPrompt(
      { locale: 'de' },
      { nimbusTools: true, hasTool: () => false }
    );
    expect(none).toBe(off);
  });

  it('with hasTool and no get_components: no batching rule that names it', () => {
    const prompt = getCommercetoolsUIPrompt(
      { locale: 'en' },
      { nimbusTools: true, hasTool: (n) => n === NIMBUS_LOOKUP_TOOLS.getTokens }
    );
    expect(prompt).toContain('`get_tokens`');
    expect(prompt).not.toContain('get_components');
  });

  it('always: tool name, versions, no imports, SQL rule, locale', () => {
    for (const prompt of [on, off]) {
      expect(prompt).toContain('create_composed_page');
      expect(prompt).toContain('previousVersion');
      expect(prompt).toContain('do **not** write import statements');
      expect(prompt).toContain('query_aggregated_data');
      expect(prompt).toContain('Current locale: de');
      expect(prompt).not.toContain('version 4.0');
    }
  });
});

describe('Nimbus surface manifest', () => {
  it('exports a semver NIMBUS_VERSION', () => {
    expect(NIMBUS_VERSION).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('check:nimbus-surface exits non-zero on a version mismatch and names the fix', () => {
    const dir = mkdtempSync(join(tmpdir(), 'nimbus-surface-'));
    const copy = join(dir, 'surface.ts');
    const source = readFileSync(
      join(
        process.cwd(),
        'src/composed-pages/prompt/nimbus-surface.generated.ts'
      ),
      'utf8'
    );
    writeFileSync(
      copy,
      source.replace(
        `NIMBUS_VERSION = '${NIMBUS_VERSION}'`,
        "NIMBUS_VERSION = '0.0.1'"
      )
    );
    const script = join(process.cwd(), 'scripts/generate-nimbus-surface.mjs');
    const stale = spawnSync(
      process.execPath,
      [script, '--check', '--service-file', copy],
      { encoding: 'utf8' }
    );
    expect(stale.status).toBe(1);
    expect(stale.stderr).toContain('npm run generate:nimbus-surface');
    const fresh = spawnSync(process.execPath, [script, '--check'], {
      encoding: 'utf8',
    });
    expect(fresh.status).toBe(0);
  });
});
