/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import {
  Box,
  Button,
  Checkbox,
  LoadingSpinner,
  Stack,
  Tabs,
  Text,
  TextInputField,
} from '@commercetools/nimbus';
import { ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import {
  MCP_MAJOR_VERSION,
  MCP_SERVER_TYPE,
  useManagedMcpServers,
} from '../../hooks/use-managed-mcp';
import type {
  McpServer,
  McpServerAuthenticationMode,
  McpServerTypeTool,
} from '../../hooks/use-managed-mcp/types';
import {
  isInsufficientPermissionError,
  missingScopesFromError,
} from '../../utils/mc-api-error';

/**
 * Pick an existing commercetools MCP Server, or create one - and hand the result back.
 *
 * THIS COMPONENT OWNS EVERYTHING THAT TALKS TO COMMERCETOOLS (listing servers, the tool
 * catalog, creating a server). The PARENT OWNS EVERYTHING THAT TALKS TO THE ROUTER (saving
 * the identity binding, refreshing the session). `onSubmit` receives an MCP Server that
 * definitely exists - created just now if the user was in create mode - and the parent
 * binds it.
 */

export type ResolvedMcpServer = {
  serverKey: string;
  url: string;
  majorVersion: string;
};

type Mode = 'select' | 'create';

/** Which tool preset filled the checkbox list, for the highlighted preset button. */
type ToolPreset = 'default' | 'read' | 'none';

/**
 * What each tab lets the user do, under its own tab rather than in the page intro: the two
 * paths differ in what they change on the project (nothing vs. a new server), and that is
 * only worth reading for the tab you are actually on.
 */
const TAB_DESCRIPTION: Record<Mode, string> = {
  select:
    'Bind the assistant to a Managed MCP server that already exists on this project. ' +
    'Nothing about the server changes - it keeps the tools it was created with.',
  create:
    'Create a new Managed MCP server on this project, choose which tools it exposes, ' +
    'and bind the assistant to it.',
};

type CreateOrReuseFormProps = {
  /** Every MCP Server on the project, loaded by the parent. */
  servers: McpServer[];
  /** Marked " - in use" in the list. The parent's current binding, if any. */
  inUseServerKey?: string | null;
  /** Non-null while a request is in flight; doubles as the disable flag. */
  busy: string | null;
  onBusyChange: (busy: string | null) => void;
  error: string;
  onError: (error: string) => void;
  /**
   * Creating the server was refused for lack of permission, rather than failing.
   *
   * Optional; when omitted the refusal falls back to `onError`. The setup page hands it to
   * `permission-notice.tsx`.
   */
  onPermissionDenied?: (missingScopes: string[]) => void;
  /**
   * Called with a server that exists. Throwing is fine - the parent reports the failure
   * through `onError` and this component stays as it was.
   */
  onSubmit: (server: ResolvedMcpServer) => Promise<void>;
  /** Submit label per mode. */
  submitLabel?: { select: string; create: string };
  /** Pre-filled server key in create mode. */
  defaultNewServerKey?: string;
  /** Extra fields rendered above the submit button of the active tab. */
  children?: ReactNode;
  /** Blocks submit for a parent-owned reason. */
  isSubmitDisabled?: boolean;
  /**
   * Auth mode for create drafts and the client-side server filter. Defaults to
   * CommercetoolsIdentity — this app is identity-only.
   */
  authenticationMode?: McpServerAuthenticationMode;
};

export const CreateOrReuseForm = ({
  servers,
  inUseServerKey,
  busy,
  onBusyChange,
  error,
  onError,
  onPermissionDenied,
  onSubmit,
  submitLabel = {
    select: 'Bind to Managed MCP',
    create: 'Create Managed MCP server',
  },
  defaultNewServerKey = 'ai-assistant-identity',
  children,
  isSubmitDisabled,
  authenticationMode = 'CommercetoolsIdentity',
}: CreateOrReuseFormProps) => {
  const { fetchToolCatalog, createServer } = useManagedMcpServers();
  const eligibleServers = useMemo(
    () =>
      servers.filter(
        (server) => server.authenticationMode === authenticationMode
      ),
    [servers, authenticationMode]
  );

  // Lazy initialisers rather than an effect: `servers` is already loaded by the time this
  // mounts (both parents await it before rendering), so there is nothing to sync later. With
  // no servers to pick from, the create tab is the only one worth opening on.
  const [mode, setMode] = useState<Mode>(() =>
    eligibleServers.length === 0 ? 'create' : 'select'
  );
  /*
   * Deliberately empty: binding the project is a decision, and pre-selecting the first row
   * (or the current binding) means a stray click on the submit button makes it for the user.
   * The button stays disabled until a row is picked.
   */
  const [selectedKey, setSelectedKey] = useState<string>('');

  const [catalog, setCatalog] = useState<McpServerTypeTool[]>([]);
  const [newKey, setNewKey] = useState<string>(defaultNewServerKey);
  const [newName, setNewName] = useState<string>('AI Assistant');
  const [selectedTools, setSelectedTools] = useState<Set<string>>(new Set());
  const [activePreset, setActivePreset] = useState<ToolPreset | null>(
    'default'
  );

  // The tool catalog is only needed by the create form, so fetch it lazily.
  useEffect(() => {
    if (mode !== 'create' || catalog.length) return;
    void (async () => {
      try {
        const type = await fetchToolCatalog();
        const tools = (type?.tools ?? []).filter(
          (tool) => tool.name !== 'all' && tool.name !== 'read_all'
        );
        setCatalog(tools);
        // The Default preset: every tool the catalog offers. The assistant is only as useful
        // as the tools it can reach, and the identity MCP still filters each call by the
        // signed-in user's own permissions - so narrowing the server here is a second, blunter
        // restriction most projects do not want.
        setSelectedTools(new Set(tools.map((tool) => tool.name)));
        setActivePreset('default');
      } catch (err) {
        onError(
          err instanceof Error ? err.message : 'Could not load the tool catalog'
        );
      }
    })();
  }, [mode, catalog.length, fetchToolCatalog, onError]);

  const toggleTool = useCallback((name: string) => {
    setSelectedTools((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
    // The selection no longer matches whichever preset produced it.
    setActivePreset(null);
  }, []);

  const selectPreset = useCallback(
    (preset: ToolPreset) => {
      setSelectedTools(
        new Set(
          preset === 'none'
            ? []
            : catalog
                .filter(
                  (tool) =>
                    preset === 'default' || tool.operationType === 'read'
                )
                .map((tool) => tool.name)
        )
      );
      setActivePreset(preset);
    },
    [catalog]
  );

  const handleUseExisting = useCallback(async () => {
    const server = eligibleServers.find((s) => s.key === selectedKey);
    if (!server) {
      onError('Select an MCP Server first');
      return;
    }
    if (server.state !== 'Enabled') {
      onError(
        `MCP Server "${server.key}" is Disabled. Enable it in Settings > Managed MCP Servers first.`
      );
      return;
    }
    await onSubmit({
      serverKey: server.key,
      url: server.mcpServer.url,
      majorVersion: server.mcpServer.majorVersion,
    });
  }, [eligibleServers, selectedKey, onSubmit, onError]);

  const handleCreate = useCallback(async () => {
    if (!newKey.trim()) {
      onError('A server key is required');
      return;
    }
    if (selectedTools.size === 0) {
      onError('Enable at least one tool');
      return;
    }

    onBusyChange('Creating the MCP Server…');
    onError('');
    try {
      const created = await createServer({
        key: newKey.trim(),
        name: { en: newName || newKey },
        state: 'Enabled',
        authenticationMode,
        mcpServer: {
          type: MCP_SERVER_TYPE,
          majorVersion: MCP_MAJOR_VERSION,
          tools: Array.from(selectedTools),
        },
      });
      await onSubmit({
        serverKey: created.key,
        url: created.mcpServer.url,
        majorVersion: created.mcpServer.majorVersion,
      });
    } catch (err) {
      onBusyChange(null);
      // `manage_mcp_servers` is a separate grant from the `view_mcp_servers` that filled the
      // form, so a user can get this far and still be refused here.
      if (onPermissionDenied && isInsufficientPermissionError(err)) {
        onPermissionDenied(missingScopesFromError(err));
        return;
      }
      onError(
        err instanceof Error ? err.message : 'Failed to create the MCP Server'
      );
    }
  }, [
    newKey,
    newName,
    selectedTools,
    createServer,
    onSubmit,
    onBusyChange,
    onError,
    onPermissionDenied,
    authenticationMode,
  ]);

  const readCount = useMemo(
    () => catalog.filter((tool) => tool.operationType === 'read').length,
    [catalog]
  );

  /*
   * One submit button per tab, rather than a shared row below both: the button is the end of
   * the tab's own flow, and a tab panel that scrolls its own content would otherwise leave
   * the action stranded outside it. Only the selected panel is mounted, so exactly one of
   * these exists at a time.
   */
  const submitButton = (target: Mode) => (
    <Stack direction="row" gap="200">
      <Button
        variant="solid"
        colorPalette="primary"
        onPress={target === 'select' ? handleUseExisting : handleCreate}
        isDisabled={
          Boolean(busy) ||
          Boolean(isSubmitDisabled) ||
          (target === 'select' && !selectedKey)
        }
      >
        {target === 'select' ? submitLabel.select : submitLabel.create}
      </Button>
    </Stack>
  );

  const presetButton = (preset: ToolPreset, label: string) => (
    <Button
      variant={activePreset === preset ? 'outline' : 'ghost'}
      colorPalette="primary"
      onPress={() => selectPreset(preset)}
    >
      {label}
    </Button>
  );

  return (
    <Stack direction="column" gap="400">
      <Tabs.Root
        selectedKey={mode}
        onSelectionChange={(key) => setMode(key as Mode)}
      >
        <Tabs.List aria-label="Managed MCP server setup">
          <Tabs.Tab id="select">Use an existing Managed MCP</Tabs.Tab>
          <Tabs.Tab id="create">Create a new Managed MCP</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panels pt="400">
          <Tabs.Panel id="select">
            <Stack direction="column" gap="400">
              <Text color="neutral.11">{TAB_DESCRIPTION.select}</Text>

              <Stack direction="column" gap="200">
                {eligibleServers.length === 0 ? (
                  <Text>
                    This project has no MCP Servers yet. Create one on the other
                    tab, or in Settings &gt; Managed MCP Servers.
                  </Text>
                ) : (
                  eligibleServers.map((server) => (
                    /*
                     * A plain <button> box rather than a Nimbus Button: this is a
                     * multi-line selectable row, and Button's recipe forces a
                     * single centred line. aria-pressed carries the selected state.
                     */
                    <Box
                      key={server.key}
                      asChild
                      display="flex"
                      flexDirection="column"
                      alignItems="flex-start"
                      gap="50"
                      width="100%"
                      textAlign="left"
                      cursor="pointer"
                      appearance="none"
                      fontFamily="body"
                      px="300"
                      py="250"
                      borderRadius="100"
                      borderWidth="1px"
                      borderStyle="solid"
                      bg={server.key === selectedKey ? 'primary.3' : 'bg'}
                      borderColor={
                        server.key === selectedKey ? 'primary.9' : 'neutral.6'
                      }
                      _hover={{ borderColor: 'primary.9' }}
                    >
                      {/*
                       * asChild rather than as="button" because Box is typed as a
                       * div and rejects the `type` attribute.
                       */}
                      <button
                        type="button"
                        aria-pressed={server.key === selectedKey}
                        onClick={() => setSelectedKey(server.key)}
                      >
                        <Text fontWeight="600">
                          {server.key}
                          {server.state !== 'Enabled' ? ' - Disabled' : ''}
                          {server.key === inUseServerKey ? ' - in use' : ''}
                        </Text>
                        <Text
                          fontSize="300"
                          fontFamily="mono"
                          color="neutral.11"
                          wordBreak="break-all"
                        >
                          {server.mcpServer.url}
                        </Text>
                        <Text
                          fontSize="300"
                          fontFamily="mono"
                          color="neutral.11"
                          wordBreak="break-all"
                        >
                          {server.authenticationMode} ·{' '}
                          {server.mcpServer.tools.length} tool(s)
                        </Text>
                      </button>
                    </Box>
                  ))
                )}
              </Stack>

              {children}
              {submitButton('select')}
            </Stack>
          </Tabs.Panel>

          <Tabs.Panel id="create">
            <Stack direction="column" gap="400">
              <Text color="neutral.11">{TAB_DESCRIPTION.create}</Text>

              {/*
               * The paragraph that used to sit under the key field is the field's own
               * description, so it is announced with the input instead of floating beside it.
               */}
              <TextInputField
                label="Server key"
                value={newKey}
                onChange={setNewKey}
                placeholder={defaultNewServerKey}
                description="The key becomes part of the server URL and cannot be changed afterwards."
              />
              <TextInputField
                label="Name"
                value={newName}
                onChange={setNewName}
                placeholder="AI Assistant"
              />

              <Stack direction="column" gap="200">
                <Stack direction="row" gap="200" alignItems="center">
                  <Text>Tools</Text>
                  {presetButton('default', `Default (${catalog.length})`)}
                  {presetButton('read', `Read-only (${readCount})`)}
                  {presetButton('none', 'None')}
                </Stack>

                {catalog.length === 0 ? (
                  <LoadingSpinner size="md" />
                ) : (
                  <Box
                    maxHeight="260px"
                    overflowY="auto"
                    borderWidth="1px"
                    borderStyle="solid"
                    borderColor="neutral.6"
                    borderRadius="100"
                    p="200"
                    display="flex"
                    flexDirection="column"
                    gap="50"
                  >
                    {catalog.map((tool) => (
                      <Checkbox
                        key={tool.name}
                        isSelected={selectedTools.has(tool.name)}
                        onChange={() => toggleTool(tool.name)}
                        width="100%"
                        px="150"
                        py="100"
                        borderRadius="100"
                        _hover={{ bg: 'neutral.3' }}
                        /*
                         * Escape hatch: the checkbox label slot is flexShrink: 0
                         * in the recipe and there is no prop for it, so a long
                         * tool name would push the row past the scroll container
                         * instead of wrapping.
                         */
                        css={{
                          "& [data-slot='label']": {
                            flexShrink: 1,
                            minWidth: 0,
                          },
                        }}
                      >
                        <Text fontFamily="mono" fontWeight="600" fontSize="350">
                          {tool.name}
                        </Text>
                      </Checkbox>
                    ))}
                  </Box>
                )}

                {/*
                 * Under the list rather than beside the presets: it is the result of the
                 * scrolling list above it, and it moves on every checkbox click.
                 */}
                <Text color="neutral.11" fontSize="300">
                  {selectedTools.size} of {catalog.length} tools selected
                </Text>
              </Stack>

              {children}
              {submitButton('create')}
            </Stack>
          </Tabs.Panel>
        </Tabs.Panels>
      </Tabs.Root>

      {busy && (
        <Stack direction="row" gap="200" alignItems="center">
          <LoadingSpinner size="md" />
          <Text>{busy}</Text>
        </Stack>
      )}

      {error && <Text color="critical.11">{error}</Text>}
    </Stack>
  );
};

CreateOrReuseForm.displayName = 'CreateOrReuseForm';

export default CreateOrReuseForm;
