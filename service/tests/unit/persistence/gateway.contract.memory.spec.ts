/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { MemoryObjectGateway } from '../../../src/persistence/gateway/memory.gateway';
import { describeGatewayContract } from '../../helpers/gateway-contract';

describeGatewayContract('memory', () => new MemoryObjectGateway());
