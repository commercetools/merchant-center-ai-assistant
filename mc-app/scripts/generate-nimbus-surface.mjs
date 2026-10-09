/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

/**
 * Generate the Nimbus surface manifest.
 *
 * WHY THIS EXISTS
 * ---------------
 * `buildBaseScope()` in src/utils/babel-renderer.tsx spreads every `@commercetools/nimbus`
 * export into the scope of generated pages. About a third of those exports are not
 * components at all - they are compound *namespace objects*:
 *
 *   PageContent === { Root, Column }        // a plain object
 *
 * React cannot render an object. `<PageContent>` throws the minified error #130
 * ("expected a string or a class/function but got: object"), which surfaces in the composed
 * page preview with no indication of which tag was at fault. The only correct usage is the
 * dot form, `<PageContent.Root>`.
 *
 * The prompts that tell the model what is in scope used to carry this split as a
 * hand-maintained list, and it was wrong for 16 of the ~30 compound components - including
 * PageContent, which a page-layout prompt reaches for first. This script derives the split
 * from the installed Nimbus bundle instead, by importing it and asking `typeof`. That is the
 * same question React asks, so the answer cannot drift from what the renderer does.
 *
 * Nimbus touches `document` at module load, so the import runs under jsdom.
 *
 * USAGE
 *   yarn generate:nimbus-surface                       # rewrite src/utils/nimbus-surface.generated.ts
 *   yarn generate:nimbus-surface --check               # fail if the committed copy is stale
 *   yarn generate:nimbus-surface --out ../path/file.ts # write somewhere else instead
 *
 * The service keeps a copy because its prompts are built there and it cannot install Nimbus
 * itself without pulling React, Chakra and react-aria into a backend. Produce that copy with
 *   yarn generate:nimbus-surface --out ../service/src/<path>
 * (the exact path is fixed by the changes that consume it, H and M).
 */

import { JSDOM } from 'jsdom';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(HERE, '..');
const DEFAULT_OUT = path.join(
  APP_ROOT,
  'src/utils/nimbus-surface.generated.ts'
);

// ============================================
// A DOM, because importing Nimbus executes browser code
// ============================================

function installDom() {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'http://localhost/',
    pretendToBeVisual: true,
  });

  const stubMatchMedia = () => ({
    matches: false,
    media: '',
    onchange: null,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent: () => false,
  });

  dom.window.matchMedia = stubMatchMedia;

  const forwarded = [
    'window',
    'document',
    'navigator',
    'location',
    'HTMLElement',
    'Element',
    'Node',
    'SVGElement',
    'Event',
    'CustomEvent',
    'DOMParser',
    'MutationObserver',
    'getComputedStyle',
    'matchMedia',
    'requestAnimationFrame',
    'cancelAnimationFrame',
  ];

  for (const key of forwarded) {
    const value = key === 'window' ? dom.window : dom.window[key];
    if (value === undefined) continue;
    // `navigator` is a getter-only property on modern Node globals, so plain assignment throws.
    Object.defineProperty(globalThis, key, {
      value:
        typeof value === 'function' && key !== 'window'
          ? value.bind(dom.window)
          : value,
      writable: true,
      configurable: true,
    });
  }
}

// ============================================
// Classification
// ============================================

/**
 * The `$$typeof` brands that make a non-function object renderable. `react.context` is
 * deliberately absent: `Button.Context` and `TextInput.Context` are contexts, so React would
 * accept `<Button.Context>` as a provider, but they are not components to build pages from
 * and listing them as parts would only invite wrong JSX.
 */
const RENDERABLE_BRANDS = new Set([
  'Symbol(react.forward_ref)',
  'Symbol(react.memo)',
  'Symbol(react.lazy)',
]);

/**
 * Can React render `<X />` for this value, as a component?
 *
 * A function (function or class component) or a forwardRef/memo/lazy object. Everything else
 * is error #130.
 *
 * React also accepts a plain string, as the name of a host element - but Nimbus never exports
 * one, and treating strings as renderable turns string enums into fake compound components
 * (`FieldErrorTypes.MISSING` would read as a component and render a `<missing>` tag).
 */
function isRenderable(value) {
  if (typeof value === 'function') return true;
  if (typeof value !== 'object' || value === null) return false;
  return RENDERABLE_BRANDS.has(String(value.$$typeof));
}

/** The renderable, PascalCase properties hanging off an export: `Card.Root`, `Grid.Item`. */
function partsOf(value) {
  if (typeof value !== 'object' && typeof value !== 'function') return [];
  if (value === null) return [];
  // Insertion order is meaningful - Nimbus declares parts in the order they nest.
  return Object.keys(value).filter(
    (key) => isPascalCase(key) && isRenderable(value[key])
  );
}

/**
 * A namespace object whose properties are the real components: Card, PageContent, Tabs, ...
 * Distinguished from a component-with-parts (`Grid` + `Grid.Item`) by not being renderable
 * itself.
 */
function compoundParts(value) {
  if (isRenderable(value)) return null;
  const parts = partsOf(value);
  return parts.length > 0 ? parts : null;
}

const isPascalCase = (name) => /^[A-Z][A-Za-z0-9]*$/.test(name);
const isHookName = (name) => /^use[A-Z]/.test(name);

function classify(nimbus) {
  const components = [];
  const compounds = {};
  const componentParts = {};
  const hooks = [];
  const values = [];

  for (const name of Object.keys(nimbus).sort()) {
    // `_CardRoot`-style aliases are the same components the compound namespaces already
    // expose, kept by Nimbus for direct import. Listing both doubles the prompt for nothing.
    if (name.startsWith('_')) continue;

    const value = nimbus[name];
    const parts = compoundParts(value);

    if (isPascalCase(name) && parts) {
      compounds[name] = parts;
    } else if (isPascalCase(name) && isRenderable(value)) {
      components.push(name);
      const own = partsOf(value);
      if (own.length > 0) componentParts[name] = own;
    } else if (isHookName(name)) {
      hooks.push(name);
    } else {
      values.push(name);
    }
  }

  return { components, compounds, componentParts, hooks, values };
}

// ============================================
// Rendering
// ============================================

function renderList(names) {
  return names.map((name) => `  '${name}',`).join('\n');
}

function renderCompounds(compounds) {
  return Object.keys(compounds)
    .map(
      (name) =>
        `  ${name}: [${compounds[name].map((part) => `'${part}'`).join(', ')}],`
    )
    .join('\n');
}

function renderModule({
  version,
  components,
  compounds,
  componentParts,
  hooks,
  values,
}) {
  return `/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

/**
 * GENERATED FILE - do not edit by hand.
 *
 * Produced by mc-app/scripts/generate-nimbus-surface.mjs, which imports
 * @commercetools/nimbus and asks \`typeof\` for every export. Run
 * \`yarn generate:nimbus-surface\` in mc-app to refresh it.
 *
 * Read from @commercetools/nimbus ${version}.
 */

/** The Nimbus version this manifest was derived from. */
export const NIMBUS_VERSION = '${version}';

/**
 * Exports React can render directly: \`<Stack>\`, \`<Heading>\`, \`<Button>\`.
 */
export const NIMBUS_COMPONENTS: readonly string[] = [
${renderList(components)}
];

/**
 * Compound components: namespace objects, not components. \`<Card>\` is React error #130;
 * \`<Card.Root>\` is the component. Parts are listed in the order they nest.
 */
export const NIMBUS_COMPOUND_COMPONENTS: Readonly<Record<string, readonly string[]>> = {
${renderCompounds(compounds)}
};

/**
 * Components that are renderable *and* carry sub-components: \`<Grid>\` works, and so does
 * \`<Grid.Item>\`. Unlike the compound namespaces above, the bare tag is valid here.
 */
export const NIMBUS_COMPONENT_PARTS: Readonly<Record<string, readonly string[]>> = {
${renderCompounds(componentParts)}
};

/** Exports that are hooks. */
export const NIMBUS_HOOKS: readonly string[] = [
${renderList(hooks)}
];

/**
 * Everything else: helpers, enums, theme objects. Not renderable, not hooks - e.g. \`toast\`
 * is a function you call, \`system\` is the Chakra system object.
 */
export const NIMBUS_VALUES: readonly string[] = [
${renderList(values)}
];
`;
}

// ============================================
// Main
// ============================================

function parseArgs(argv) {
  const outs = [];
  let check = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--check') check = true;
    else if (argv[i] === '--out')
      outs.push(path.resolve(process.cwd(), argv[++i]));
    else throw new Error(`Unknown argument: ${argv[i]}`);
  }
  if (outs.length === 0) outs.push(DEFAULT_OUT);
  return { outs, check };
}

async function main() {
  const { outs, check } = parseArgs(process.argv.slice(2));

  installDom();

  const version = JSON.parse(
    fs.readFileSync(
      path.join(APP_ROOT, 'node_modules/@commercetools/nimbus/package.json'),
      'utf8'
    )
  ).version;

  const nimbus = await import('@commercetools/nimbus');
  const classified = classify(nimbus);
  const source = renderModule({ version, ...classified });

  const counts =
    `${classified.components.length} components, ` +
    `${Object.keys(classified.compounds).length} compound, ` +
    `${classified.hooks.length} hooks, ${classified.values.length} other`;

  if (check) {
    const stale = outs.filter(
      (out) => !fs.existsSync(out) || fs.readFileSync(out, 'utf8') !== source
    );
    if (stale.length > 0) {
      process.stderr.write(
        `nimbus surface manifest is stale (Nimbus ${version}: ${counts}):\n` +
          stale
            .map((out) => `  ${path.relative(process.cwd(), out)}`)
            .join('\n') +
          `\nRun \`yarn generate:nimbus-surface\` and commit the result.\n`
      );
      process.exit(1);
    }
    process.stdout.write(
      `nimbus surface manifest is up to date (Nimbus ${version}: ${counts})\n`
    );
    return;
  }

  for (const out of outs) {
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, source);
    process.stdout.write(
      `wrote ${path.relative(
        process.cwd(),
        out
      )} (Nimbus ${version}: ${counts})\n`
    );
  }
}

await main();
