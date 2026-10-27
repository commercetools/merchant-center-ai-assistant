/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { useApplicationContext } from '@commercetools-frontend/application-shell-connectors';
import { MC_API_PROXY_TARGETS } from '@commercetools-frontend/constants';
import {
  useAsyncDispatch,
  actions,
  TSdkAction,
} from '@commercetools-frontend/sdk';

function buildUrlWithParams(
  baseUrl: string,
  options?: Record<string, string | string[]>
) {
  const queryParams = new URLSearchParams();
  if (!options) {
    return baseUrl;
  }

  for (const [key, value] of Object.entries(options)) {
    if (Array.isArray(value)) {
      value.forEach((item) => queryParams.append(key, item));
    } else {
      queryParams.append(key, value);
    }
  }

  return `${baseUrl}?${queryParams}`;
}

/** The slice of a GraphQL answer the callers read. */
export type GraphqlResponse = {
  data?: Record<string, unknown>;
  errors?: { message: string }[];
};

export const useGraphql = () => {
  const dispatchGraphQL = useAsyncDispatch<TSdkAction, GraphqlResponse>();
  const context = useApplicationContext((context) => context);

  const callGraphQL = async (
    query: string,
    variables: Record<string, unknown>
  ) => {
    return dispatchGraphQL(
      actions.post({
        mcApiProxyTarget: MC_API_PROXY_TARGETS.COMMERCETOOLS_PLATFORM,
        uri: buildUrlWithParams(`/${context?.project?.key}/graphql`),
        payload: {
          query,
          variables,
        },
      })
    );
  };

  return {
    callGraphQL,
  };
};
