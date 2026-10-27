/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { InvalidIdError, SessionTooLongError } from '../../../src/persistence/gateway/errors';
import { makePersistence, spyGateway } from '../../helpers/persistence';

const msg = (id: string, text = id) => ({
  id,
  role: 'user' as const,
  parts: [{ type: 'text', text }],
});

type Spy = ReturnType<typeof spyGateway>;

describe('MessageStore', () => {
  it('keeps nested null members byte-exact', async () => {
    const { p } = makePersistence();
    await p.messages.put('s1', [
      { id: 'm1', role: 'assistant', parts: [{ type: 'tool-x', output: null, n: [null, 1] }] },
    ]);
    const [m] = await p.messages.list('s1');
    expect(m.parts).toEqual([{ type: 'tool-x', output: null, n: [null, 1] }]);
  });

  it('keeps the order of a batch and assigns increasing timestamps', async () => {
    const { p } = makePersistence();
    const stored = await p.messages.put('s1', [msg('c'), msg('a'), msg('b')]);
    expect(stored.map((m) => m.timestamp)).toEqual(
      [...stored.map((m) => m.timestamp)].sort((x, y) => x - y)
    );
    expect(new Set(stored.map((m) => m.timestamp)).size).toBe(3);
    expect((await p.messages.list('s1')).map((m) => m.id)).toEqual(['c', 'a', 'b']);
  });

  it('upserts by id without changing count or position', async () => {
    const { p } = makePersistence();
    await p.messages.put('s1', [msg('a'), msg('b'), msg('c')]);
    await p.messages.put('s1', [msg('a', 'changed')]);
    const list = await p.messages.list('s1');
    expect(list.map((m) => m.id)).toEqual(['a', 'b', 'c']);
    expect(list[0].parts).toEqual([{ type: 'text', text: 'changed' }]);
    expect(await p.messages.count('s1')).toBe(3);
  });

  it('returns the newest N chronologically', async () => {
    const { p } = makePersistence();
    await p.messages.put('s1', Array.from({ length: 30 }, (_, i) => msg(`m${String(i).padStart(2, '0')}`)));
    const last = await p.messages.list('s1', { limit: 20, order: 'desc' });
    expect(last).toHaveLength(20);
    expect(last[0].id).toBe('m10');
    expect(last[19].id).toBe('m29');
    const first = await p.messages.list('s1', { limit: 5 });
    expect(first.map((m) => m.id)).toEqual(['m00', 'm01', 'm02', 'm03', 'm04']);
  });

  it('reads 1200 messages with three queries', async () => {
    const holder: { spy?: ReturnType<typeof spyGateway> } = {};
    const { p, mem } = makePersistence((gw) => (holder.spy = spyGateway(gw)));
    for (let i = 0; i < 1200; i++) {
      await mem.put(
        'ai-assistant-messages-s1',
        `m${i}`,
        { v: 1, id: `m${i}`, role: 'user', timestamp: i + 1, partsJson: '[]' }
      );
    }
    (holder.spy as Spy).calls.length = 0;
    const all = await p.messages.list('s1');
    expect(all).toHaveLength(1200);
    expect(all[0].id).toBe('m0');
    expect(all[1199].id).toBe('m1199');
    expect((holder.spy as Spy).calls.filter((c) => c.startsWith('query'))).toHaveLength(3);
  });

  it('refuses to read a session beyond the ceiling', async () => {
    const { p, mem } = makePersistence();
    for (let i = 0; i < 10001; i++) {
      await mem.put('ai-assistant-messages-big', `m${i}`, {
        v: 1,
        id: `m${i}`,
        role: 'user',
        timestamp: i,
        partsJson: '[]',
      });
    }
    await expect(p.messages.list('big')).rejects.toBeInstanceOf(SessionTooLongError);
    expect(await p.messages.list('big', { limit: 20, order: 'desc' })).toHaveLength(20);
  }, 30000);

  it('checks ids in chunks of at most 50', async () => {
    const holder: { spy?: ReturnType<typeof spyGateway> } = {};
    const { p } = makePersistence((gw) => (holder.spy = spyGateway(gw)));
    await p.messages.put('s1', [msg('a'), msg('b')]);
    (holder.spy as Spy).calls.length = 0;
    const ids = ['a', 'b', ...Array.from({ length: 120 }, (_, i) => `x${i}`)];
    const found = await p.messages.has('s1', ids);
    expect([...found].sort()).toEqual(['a', 'b']);
    expect((holder.spy as Spy).calls.filter((c) => c.startsWith('query'))).toHaveLength(3);
  });

  it('deleteAll respects the concurrency limit and empties the container', async () => {
    let inFlight = 0;
    let peak = 0;
    const { p } = makePersistence(
      (gw) =>
        spyGateway(gw, {
          onDelete: async () => {
            inFlight += 1;
            peak = Math.max(peak, inFlight);
            await new Promise((r) => setTimeout(r, 1));
            inFlight -= 1;
          },
        }),
      { PERSISTENCE_CONCURRENCY: '4' }
    );
    await p.messages.put('s1', Array.from({ length: 50 }, (_, i) => msg(`m${i}`)));
    expect(await p.messages.deleteAll('s1')).toBe(50);
    expect(await p.messages.count('s1')).toBe(0);
    expect(peak).toBeLessThanOrEqual(4);
  });

  it('gets and deletes a single message', async () => {
    const { p } = makePersistence();
    await p.messages.put('s1', [msg('a')]);
    expect((await p.messages.get('s1', 'a'))?.id).toBe('a');
    expect(await p.messages.delete('s1', 'a')).toBe(true);
    expect(await p.messages.delete('s1', 'a')).toBe(false);
    expect(await p.messages.get('s1', 'a')).toBeNull();
  });

  it('rejects unsafe session and message ids', async () => {
    const { p } = makePersistence();
    await expect(p.messages.list('../x')).rejects.toBeInstanceOf(InvalidIdError);
    await expect(p.messages.put('s1', [msg('a b')])).rejects.toBeInstanceOf(InvalidIdError);
    await expect(p.messages.has('s1', ['ok', '../x'])).rejects.toBeInstanceOf(InvalidIdError);
  });
});
