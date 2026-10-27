/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

/**
 * GENERATED FILE - do not edit by hand.
 *
 * Produced by mc-app/scripts/generate-nimbus-surface.mjs, which imports
 * @commercetools/nimbus and asks `typeof` for every export. Run
 * `yarn generate:nimbus-surface` in mc-app to refresh it.
 *
 * Read from @commercetools/nimbus 3.6.0.
 */

/** The Nimbus version this manifest was derived from. */
export const NIMBUS_VERSION = '3.6.0';

/**
 * Exports React can render directly: `<Stack>`, `<Heading>`, `<Button>`.
 */
export const NIMBUS_COMPONENTS: readonly string[] = [
  'ActivityIndicator',
  'Avatar',
  'Badge',
  'Box',
  'Button',
  'Calendar',
  'Checkbox',
  'Code',
  'ConfirmationDialog',
  'DataTable',
  'DateInput',
  'DatePicker',
  'DateRangePicker',
  'DateRangePickerField',
  'DropZone',
  'FieldErrors',
  'FileTrigger',
  'Flex',
  'FloatingActionButton',
  'FormActionBar',
  'FormDialog',
  'Grid',
  'Group',
  'Heading',
  'Icon',
  'IconButton',
  'IconToggleButton',
  'Image',
  'InfoDialog',
  'InlineSvg',
  'Kbd',
  'Link',
  'LoadingSpinner',
  'LocalizedField',
  'MakeElementFocusable',
  'Markdown',
  'MoneyInput',
  'MoneyInputField',
  'MultilineTextInput',
  'MultilineTextInputField',
  'NimbusI18nProvider',
  'NimbusProvider',
  'NumberInput',
  'NumberInputField',
  'Pagination',
  'PasswordInput',
  'PasswordInputField',
  'ProgressBar',
  'PublicPageLayout',
  'RangeCalendar',
  'RangeSlider',
  'Region',
  'RichTextInput',
  'ScopedSearchInput',
  'ScrollArea',
  'SearchInput',
  'SearchInputField',
  'Separator',
  'SimpleGrid',
  'Skeleton',
  'SkeletonCircle',
  'SkeletonText',
  'Slider',
  'Spacer',
  'SplitButton',
  'Stack',
  'Switch',
  'TableBody',
  'TableCaption',
  'TableCell',
  'TableColumn',
  'TableColumnGroup',
  'TableColumnHeader',
  'TableFooter',
  'TableHeader',
  'TableRoot',
  'TableRow',
  'TableScrollArea',
  'Text',
  'TextInput',
  'TextInputField',
  'TimeInput',
  'ToastOutlet',
  'ToggleButton',
  'Toolbar',
  'VisuallyHidden',
];

/**
 * Compound components: namespace objects, not components. `<Card>` is React error #130;
 * `<Card.Root>` is the component. Parts are listed in the order they nest.
 */
export const NIMBUS_COMPOUND_COMPONENTS: Readonly<Record<string, readonly string[]>> = {
  Accordion: ['Root', 'Item', 'Header', 'Content', 'HeaderRightContent'],
  Alert: ['Root', 'Title', 'Description', 'Actions', 'DismissButton'],
  Breadcrumbs: ['Root', 'Item'],
  Card: ['Root', 'Header', 'Body', 'Footer'],
  ChatMessage: ['Root', 'Avatar', 'Body', 'Actions', 'Meta', 'Typing'],
  ChatMessageList: ['Root', 'Item'],
  CollapsibleMotion: ['Root', 'Trigger', 'Content'],
  ComboBox: ['Root', 'Trigger', 'Popover', 'ListBox', 'Option', 'Section'],
  DefaultPage: ['Root', 'Header', 'BackLink', 'Title', 'Subtitle', 'Actions', 'Content', 'Footer', 'TabNav'],
  Dialog: ['Root', 'Trigger', 'Content', 'Header', 'Body', 'Footer', 'Title', 'CloseTrigger'],
  DraggableList: ['Root', 'Item', 'Field'],
  Drawer: ['Root', 'Trigger', 'Content', 'Header', 'Body', 'Footer', 'Title', 'CloseTrigger'],
  FormField: ['Root', 'Label', 'Input', 'Description', 'Error', 'InfoBox'],
  Item: ['Root', 'Header', 'Media', 'Content', 'Title', 'Description', 'Actions', 'Footer'],
  ItemGroup: ['Root', 'Separator'],
  List: ['Root', 'Item', 'Indicator'],
  Menu: ['Root', 'Trigger', 'Content', 'Item', 'Section', 'Submenu', 'SubmenuTrigger'],
  ModalPage: ['Root', 'TopBar', 'Header', 'Title', 'Subtitle', 'Actions', 'TabNav', 'Content', 'Footer'],
  PageContent: ['Root', 'Column'],
  Popover: ['Root', 'Trigger', 'Content'],
  RadioInput: ['Root', 'Option'],
  Select: ['Root', 'Options', 'Option', 'OptionGroup'],
  Splitter: ['Root', 'Aside', 'Main', 'Handle'],
  Steps: ['Root', 'List', 'Item', 'Trigger', 'Indicator', 'Number', 'Title', 'Description', 'Separator', 'Content', 'CompletedContent', 'PrevTrigger', 'NextTrigger', 'Status'],
  TabNav: ['Root', 'Item'],
  Table: ['Root', 'Caption', 'Header', 'Body', 'Footer', 'Row', 'ColumnHeader', 'Cell', 'ScrollArea', 'ColumnGroup', 'Column'],
  Tabs: ['Root', 'List', 'Tab', 'Panels', 'Panel'],
  TagGroup: ['Root', 'TagList', 'Tag'],
  ToggleButtonGroup: ['Root', 'Button'],
  Tooltip: ['Root', 'Content'],
  Tree: ['Root', 'Item', 'ItemContent', 'Indicator', 'SubTree'],
};

/**
 * Components that are renderable *and* carry sub-components: `<Grid>` works, and so does
 * `<Grid.Item>`. Unlike the compound namespaces above, the bare tag is valid here.
 */
export const NIMBUS_COMPONENT_PARTS: Readonly<Record<string, readonly string[]>> = {
  DataTable: ['Root', 'Table', 'Header', 'Body', 'Row', 'Cell', 'Column', 'Footer', 'Manager'],
  Grid: ['Item'],
  LocalizedField: ['RequiredValueErrorMessage'],
  Region: ['Provider'],
  SimpleGrid: ['Item'],
};

/** Exports that are hooks. */
export const NIMBUS_HOOKS: readonly string[] = [
  'useColorMode',
  'useColorModeValue',
  'useColorScheme',
  'useCopyToClipboard',
  'useDragAndDrop',
  'useFocusInputOnFieldClick',
  'useHotkeys',
  'useLocalizedStringFormatter',
  'useRegion',
  'useResponsiveSplitterSizes',
  'useScrollArea',
  'useScrollAreaContext',
  'useSlidingIndicator',
  'useTree',
];

/**
 * Everything else: helpers, enums, theme objects. Not renderable, not hooks - e.g. `toast`
 * is a function you call, `system` is the Chakra system object.
 */
export const NIMBUS_VALUES: readonly string[] = [
  'FieldErrorTypes',
  'SPLITTER_SIZE_TOKENS',
  'UPDATE_ACTIONS',
  'createArrayHandlers',
  'createItemsFromCsvDrop',
  'createItemsFromDirectoryDrop',
  'createItemsFromFileDrop',
  'createItemsFromImageDrop',
  'createItemsFromJsonDrop',
  'createItemsFromTextDrop',
  'createListDataHandlers',
  'system',
  'toast',
];
