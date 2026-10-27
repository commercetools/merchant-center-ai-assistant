/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import React from 'react';
import { Tabs } from '@commercetools/nimbus';
import BackofficeThreadList from './thread-list';
import QueryThreads from './query-threads';
import FeedbackList from './feedback-list';

/**
 * Nimbus `Tabs` replaces the hand-rolled `<button>` strip.
 *
 * The selection is uncontrolled (`defaultSelectedKey`): the old
 * `useState<TabId>` existed only to colour the active button and to pick which
 * child to render, and `Tabs.Root` now owns both.
 *
 * `Tabs.Panel` does not mount an unselected panel (`shouldForceMount` is off by
 * default), which is the same mount/unmount behaviour as the previous
 * `activeTab === '…' && <List />` render - each list still refetches when the
 * reviewer switches back to it, and `feedback-list`'s master/detail state is
 * still discarded on tab change exactly as before.
 *
 * `pt` on the panels stands in for the old `TabBar` `margin-bottom: 16px`; the
 * Nimbus recipe gives the panels no padding of their own.
 */
const BackofficeTabs: React.FC = () => (
  <Tabs.Root defaultSelectedKey="list">
    <Tabs.List aria-label="Backoffice sections">
      <Tabs.Tab id="list">Thread List</Tabs.Tab>
      <Tabs.Tab id="query">Query Threads</Tabs.Tab>
      <Tabs.Tab id="feedback">Feedback</Tabs.Tab>
    </Tabs.List>

    <Tabs.Panels pt="400">
      <Tabs.Panel id="list">
        <BackofficeThreadList />
      </Tabs.Panel>
      <Tabs.Panel id="query">
        <QueryThreads />
      </Tabs.Panel>
      <Tabs.Panel id="feedback">
        <FeedbackList />
      </Tabs.Panel>
    </Tabs.Panels>
  </Tabs.Root>
);

export default BackofficeTabs;
