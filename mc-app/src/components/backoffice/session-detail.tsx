/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useHistory, useRouteMatch } from 'react-router-dom';
import { useAdminConnector } from '../../hooks/use-admin-connector';
import type {
  BackofficeThread,
  BackofficeThreadMessage,
} from '../../hooks/admin-types';
import { describeAdminError } from '../../utils/admin-error';
import { SERVICE_FILE_PREFIX } from '../../hooks/use-service-image';
import { FilePartRenderer } from '../new-chat/parts/file-part';
import { UserDisplay } from './user-display';
import { ArrowBack } from '@commercetools/nimbus-icons';
import {
  Box,
  Button,
  LoadingSpinner,
  Stack,
  Text,
} from '@commercetools/nimbus';

const BackofficeSessionDetail: React.FC = () => {
  const { sessionId } = useParams<{ sessionId: string }>();
  const history = useHistory();
  const match = useRouteMatch();

  const { getBackofficeThreadMessages } = useAdminConnector();

  const [thread, setThread] = useState<BackofficeThread | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchThread = useCallback(async () => {
    if (!sessionId) return;

    setIsLoading(true);
    setError(null);
    try {
      const response = await getBackofficeThreadMessages(sessionId);
      if (response.success) {
        setThread(response.data);
      }
    } catch (err) {
      setThread(null);
      setError(describeAdminError(err, 'Failed to fetch thread'));
    } finally {
      setIsLoading(false);
    }
  }, [sessionId, getBackofficeThreadMessages]);

  useEffect(() => {
    fetchThread();
  }, [fetchThread]);

  // Derive the parent backoffice path from the current match
  const backofficeUrl = match.url.replace(`/${sessionId}`, '');

  const handleBack = () => {
    history.push(backofficeUrl);
  };

  if (isLoading) {
    return (
      <Stack direction="column" gap="600" alignItems="center">
        <LoadingSpinner size="lg" />
      </Stack>
    );
  }

  if (!thread) {
    return (
      <Stack direction="column" gap="200">
        <Button variant="ghost" colorPalette="primary" onPress={handleBack}>
          {<ArrowBack />} Back to threads
        </Button>
        <Text>{error ?? 'Thread not found.'}</Text>
      </Stack>
    );
  }

  return (
    <Stack direction="column" gap="100">
      <Button variant="ghost" colorPalette="primary" onPress={handleBack}>
        {<ArrowBack />} Back to threads
      </Button>

      <Stack direction="row" gap="400">
        <Text textStyle="sm" color="neutral.11">
          Session: {thread.sessionId}
        </Text>
        <Text textStyle="sm" color="neutral.11">
          User:{' '}
          <UserDisplay userId={thread.userId} userLabel={thread.userLabel} />
        </Text>
        {thread.createdAt ? (
          <Text textStyle="sm" color="neutral.11">
            Created: {new Date(thread.createdAt).toLocaleString()}
          </Text>
        ) : null}
      </Stack>

      <Box mt="100">
        {thread.messages.map((msg: BackofficeThreadMessage, index: number) => (
          <Box
            key={msg.id || index}
            px="200"
            py="100"
            borderBottom="solid-25"
            borderColor="neutral.6"
            // The user rows keep their tinted surface so a long transcript
            // still reads as alternating turns.
            bg={msg.role === 'user' ? 'neutral.3' : 'transparent'}
          >
            <Stack direction="row" gap="200" alignItems="center">
              <Text
                textStyle="sm"
                fontWeight="600"
                color={msg.role === 'user' ? 'primary.11' : 'neutral.11'}
              >
                {msg.role}
              </Text>
              {msg.timestamp && (
                <Text textStyle="sm" color="neutral.11">
                  {new Date(msg.timestamp).toLocaleString()}
                </Text>
              )}
            </Stack>
            <Box py="50">
              {msg.parts?.map((part, pIdx: number) => {
                if (part.type === 'text') {
                  return <Text key={pIdx}>{part.text}</Text>;
                }
                // A service-relative image goes through the gateway (useServiceImage),
                // never a plain <img src>.
                if (
                  part.type === 'file' &&
                  typeof part.url === 'string' &&
                  part.url.startsWith(SERVICE_FILE_PREFIX) &&
                  typeof part.mediaType === 'string' &&
                  part.mediaType.startsWith('image/')
                ) {
                  return (
                    <FilePartRenderer
                      key={pIdx}
                      mediaType={part.mediaType}
                      url={part.url}
                      filename={
                        typeof part.filename === 'string'
                          ? part.filename
                          : undefined
                      }
                    />
                  );
                }
                if (part.type === 'tool-invocation') {
                  return (
                    <Text textStyle="sm" color="neutral.11" key={pIdx}>
                      [Tool: {part.toolInvocation?.toolName || 'unknown'}]
                    </Text>
                  );
                }
                return (
                  <Text textStyle="sm" color="neutral.11" key={pIdx}>
                    [{part.type}]
                  </Text>
                );
              })}
            </Box>
          </Box>
        ))}
      </Box>
    </Stack>
  );
};

export default BackofficeSessionDetail;
