/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

/**
 * The Nimbus surface, as the prompts advertise it to the model.
 *
 * WHY THIS EXISTS
 * ---------------
 * `buildBaseScope()` in the frontend's babel-renderer spreads every `@commercetools/nimbus`
 * export into the scope of generated pages, and about a third of those exports are not
 * components - they are compound *namespace objects*:
 *
 *   PageContent === { Root, Column }        // a plain object
 *
 * React cannot render an object. `<PageContent>` throws the minified error #130 ("expected a
 * string or a class/function but got: object"), which reaches the composed page preview with
 * no indication of which tag was at fault. Only the dot form works: `<PageContent.Root>`.
 *
 * These lists used to be hand-written prose, and the compound annotation was missing for 16
 * of the 30 compound components - including PageContent, which a page-layout prompt reaches
 * for first. So the model wrote `<PageContent>`, exactly as documented, and every generated
 * page died on its outermost tag.
 *
 * Now only the *grouping* is hand-maintained (which names to advertise, under which heading).
 * The flat-vs-compound split and the part names come from `nimbus-surface.generated.ts`,
 * which is produced by importing Nimbus and asking `typeof` - the same question React asks.
 * `auditNimbusScope()` checks the grouping against that manifest; the spec calls it, so a
 * Nimbus upgrade that turns a component into a namespace (or removes it) fails the build
 * instead of shipping a prompt that teaches a crash.
 *
 * To refresh the manifest after a Nimbus bump, run `npm run generate:nimbus-surface` in
 * `service/` (it re-derives the manifest in mc-app and copies it here); `npm run
 * check:nimbus-surface` fails when the two copies or their versions differ.
 */

import {
  NIMBUS_COMPONENTS,
  NIMBUS_COMPONENT_PARTS,
  NIMBUS_COMPOUND_COMPONENTS,
  NIMBUS_HOOKS,
  NIMBUS_VALUES,
  NIMBUS_VERSION,
} from './nimbus-surface.generated';

/**
 * Scope names that do not match their Nimbus export name.
 *
 * `buildBaseScope()` assigns react-router-dom after Nimbus, so `Switch` and `Link` in
 * generated code are react-router's. Nimbus's own are re-exposed under these names.
 */
const SCOPE_ALIASES: Readonly<Record<string, string>> = {
  ToggleSwitch: 'Switch',
  NimbusLink: 'Link',
};

/**
 * Advertised names that are deliberately not components. `toast` is a function you call; the
 * prompt says so in its own bullet. Anything else non-renderable is a bug.
 */
const ADVERTISED_NON_COMPONENTS = new Set(['toast']);

type TScopeCategory = {
  /** Heading the names appear under. */
  label: string;
  /** Parenthetical shown after the heading. */
  note?: string;
  /** Scope names, in the order they should be read. Omit for a category that is fully derived. */
  names?: readonly string[];
  /** Derived name list, used instead of `names`. */
  derived?: readonly string[];
};

/**
 * The curated part: which of Nimbus's 116 components and namespaces are worth advertising,
 * and how they group. Names only - whether a name is compound is never stated here.
 */
const CATEGORIES: readonly TScopeCategory[] = [
  {
    label: 'Layout',
    names: [
      'Box',
      'Flex',
      'Stack',
      'SimpleGrid',
      'Grid',
      'Spacer',
      'Separator',
      'ScrollArea',
      'Splitter',
      'PageContent',
      'DefaultPage',
      'ModalPage',
    ],
  },
  { label: 'Typography', names: ['Heading', 'Text', 'Code', 'Kbd', 'List'] },
  {
    label: 'Buttons',
    names: [
      'Button',
      'IconButton',
      'ToggleButton',
      'ToggleButtonGroup',
      'IconToggleButton',
      'SplitButton',
      'FloatingActionButton',
    ],
  },
  {
    label: 'Inputs',
    names: [
      'TextInput',
      'MultilineTextInput',
      'NumberInput',
      'PasswordInput',
      'SearchInput',
      'ScopedSearchInput',
      'Select',
      'ComboBox',
      'Checkbox',
      'RadioInput',
      'ToggleSwitch',
      'Slider',
      'RangeSlider',
      'DateInput',
      'DatePicker',
      'DateRangePicker',
      'Calendar',
      'RangeCalendar',
      'TimeInput',
      'MoneyInput',
      'RichTextInput',
      'DropZone',
      'FileTrigger',
    ],
  },
  {
    label: 'Form wrappers',
    note: 'label + description + error in one',
    names: [
      'FormField',
      'FieldErrors',
      'Group',
      'LocalizedField',
      'TextInputField',
      'MultilineTextInputField',
      'NumberInputField',
      'PasswordInputField',
      'SearchInputField',
      'MoneyInputField',
      'DateRangePickerField',
    ],
  },
  {
    label: 'Data display',
    names: [
      'DataTable',
      'Table',
      'Card',
      'Badge',
      'TagGroup',
      'Item',
      'ItemGroup',
      'DraggableList',
    ],
  },
  {
    label: 'Feedback',
    names: [
      'Alert',
      'Dialog',
      'Drawer',
      'Tooltip',
      'LoadingSpinner',
      'ProgressBar',
      'Skeleton',
      'SkeletonText',
      'SkeletonCircle',
      'ActivityIndicator',
      'toast',
    ],
  },
  {
    label: 'Navigation',
    names: [
      'NimbusLink',
      'Menu',
      'Tabs',
      'TabNav',
      'Breadcrumbs',
      'Accordion',
      'CollapsibleMotion',
      'Pagination',
      'Steps',
      'Toolbar',
      'Tree',
    ],
  },
  { label: 'Media', names: ['Icon', 'Avatar', 'Image', 'InlineSvg'] },
  { label: 'Content', names: ['Markdown'] },
  {
    label: 'Dialogs',
    names: ['FormDialog', 'ConfirmationDialog', 'InfoDialog'],
  },
  { label: 'Hooks', derived: NIMBUS_HOOKS },
];

// ============================================
// Lookups
// ============================================

const resolveExport = (scopeName: string): string =>
  SCOPE_ALIASES[scopeName] ?? scopeName;

/** Is this scope name a namespace object rather than a component? */
export function isCompoundComponent(scopeName: string): boolean {
  return resolveExport(scopeName) in NIMBUS_COMPOUND_COMPONENTS;
}

/** Every compound name the manifest knows about, as it appears in generated code. */
const scopeNameOf = (exportName: string): string =>
  Object.keys(SCOPE_ALIASES).find(
    (alias) => SCOPE_ALIASES[alias] === exportName
  ) ?? exportName;

const advertisedNames = (): string[] =>
  CATEGORIES.flatMap((category) => category.names ?? category.derived ?? []);

// ============================================
// Rendering
// ============================================

/** `PageContent` -> `PageContent*`. The legend explains the marker once. */
const withCompoundMarker = (scopeName: string): string =>
  isCompoundComponent(scopeName) ? `${scopeName}*` : scopeName;

const renderNames = (category: TScopeCategory): string =>
  (category.names ?? category.derived ?? []).map(withCompoundMarker).join(', ');

/**
 * `Card  ->  .Root .Header .Body .Footer`, one line per compound, derived from Nimbus.
 */
function renderPartsTable(): string {
  const width = Math.max(
    ...Object.keys(NIMBUS_COMPOUND_COMPONENTS).map(
      (name) => scopeNameOf(name).length
    )
  );

  const compound = Object.entries(NIMBUS_COMPOUND_COMPONENTS).map(
    ([name, parts]) =>
      `  ${scopeNameOf(name).padEnd(width)}  ${parts
        .map((part) => `.${part}`)
        .join(' ')}`
  );

  const withParts = Object.entries(NIMBUS_COMPONENT_PARTS).map(
    ([name, parts]) =>
      `  ${scopeNameOf(name).padEnd(width)}  ${parts
        .map((part) => `.${part}`)
        .join(' ')}`
  );

  return [
    'Compound components - the bare name is a namespace object, NOT a component. `<Card>` is',
    'React error #130; `<Card.Root>` is the component:',
    '',
    ...compound,
    '',
    'These are real components (the bare tag works) that also expose parts:',
    '',
    ...withParts,
  ].join('\n');
}

/**
 * The scope bullets for the system prompt: markdown list, compounds marked.
 */
export const NIMBUS_SCOPE_BULLETS: string = CATEGORIES.map(
  (category) =>
    `- **${category.label}**${
      category.note ? ` (${category.note})` : ''
    }: ${renderNames(category)}`
).join('\n');

/**
 * The scope lists for the tool description: no markdown, one line per category.
 */
export const NIMBUS_SCOPE_LINES: string = CATEGORIES.map(
  (category) => `${category.label}: ${renderNames(category)}`
).join('\n');

/** The `*` legend plus the full, derived part lists. */
export const NIMBUS_COMPOUND_REFERENCE: string = renderPartsTable();

/** One-line version of the legend, for the tool description. */
export const NIMBUS_COMPOUND_RULE: string =
  'A `*` marks a compound component: the bare name is a namespace object, not a component, ' +
  'so `<PageContent>` throws React error #130 - write `<PageContent.Root>`. The system ' +
  "prompt lists every compound's exact parts.";

/** The Nimbus version the lists above were derived from. */
export const NIMBUS_SCOPE_VERSION: string = NIMBUS_VERSION;

// ============================================
// Audit
// ============================================

export type TScopeAudit = {
  /** Advertised, but Nimbus does not export it under that name at all. */
  unknown: string[];
  /** Advertised and exported, but not renderable and not an allowed exception. */
  notComponents: string[];
  /** Compound in Nimbus but never advertised - informational, not a failure. */
  unadvertisedCompounds: string[];
};

/**
 * Check the curated grouping against the generated manifest.
 *
 * `unknown` and `notComponents` are both prompt bugs: the first advertises a name that will
 * be `undefined` in scope, the second one that cannot be rendered. Either produces React
 * error #130 in the browser, which is what this whole module exists to prevent.
 */
export function auditNimbusScope(): TScopeAudit {
  const known = new Set<string>([
    ...NIMBUS_COMPONENTS,
    ...Object.keys(NIMBUS_COMPOUND_COMPONENTS),
    ...NIMBUS_HOOKS,
    ...NIMBUS_VALUES,
  ]);
  const renderable = new Set<string>([
    ...NIMBUS_COMPONENTS,
    ...Object.keys(NIMBUS_COMPOUND_COMPONENTS),
    ...NIMBUS_HOOKS,
  ]);

  const unknown: string[] = [];
  const notComponents: string[] = [];

  for (const scopeName of advertisedNames()) {
    const exportName = resolveExport(scopeName);
    if (!known.has(exportName)) {
      unknown.push(scopeName);
    } else if (
      !renderable.has(exportName) &&
      !ADVERTISED_NON_COMPONENTS.has(scopeName)
    ) {
      notComponents.push(scopeName);
    }
  }

  const advertised = new Set(advertisedNames().map(resolveExport));
  const unadvertisedCompounds = Object.keys(NIMBUS_COMPOUND_COMPONENTS).filter(
    (name) => !advertised.has(name)
  );

  return { unknown, notComponents, unadvertisedCompounds };
}
