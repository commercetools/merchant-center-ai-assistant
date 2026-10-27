/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

/*
 * The real `ChatArea` over the real `useChat` and the real stream transport. Only the network
 * (`forwardToFetch`), the session context, the service connector and a few heavy children are
 * replaced, so what is exercised is the wiring: when the gateway cuts a response mid-answer,
 * the app must reattach or wait for the stored answer, and must never start a second run.
 */

import type { UIMessage } from '@ai-sdk/react';
import { NimbusProvider } from '@commercetools/nimbus';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ChatArea from './chat-area';

// The message list measures itself; jsdom has no layout, so stand-ins that never fire.
class NoopObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}
globalThis.ResizeObserver ??= NoopObserver;
globalThis.IntersectionObserver ??=
  NoopObserver as unknown as typeof IntersectionObserver;

const mockFetch = jest.fn();
const mockGetMessages = jest.fn();
const mockCancel = jest.fn();
const mockRefresh = jest.fn();

jest.mock('../../utils/forward-to', () => ({
  forwardToFetch: (...args: unknown[]) => mockFetch(...args),
}));
jest.mock('../../contexts', () => {
  const value = {
    pendingPrompt: undefined,
    clearPendingPrompt: () => undefined,
    allSessions: [],
    setCurrentSession: () => undefined,
    refreshSessions: (...args: unknown[]) => mockRefresh(...args),
  };
  return { useSession: () => value };
});
jest.mock(
  '../../hooks/use-chat-service-connector/use-chat-service-connector',
  () => {
    const value = {
      submitFeedback: async () => ({ success: true }),
      getMessages: (...args: unknown[]) => mockGetMessages(...args),
      cancelChatStream: (...args: unknown[]) => mockCancel(...args),
    };
    return { useChatServiceConnector: () => value };
  }
);
jest.mock('../../hooks/use-current-user', () => ({
  useCurrentUser: () => ({ email: 'a@b.c' }),
}));
jest.mock('@commercetools-frontend/application-shell-connectors', () => ({
  useApplicationContext: (select: (context: unknown) => unknown) =>
    select({ dataLocale: 'en' }),
}));
jest.mock('../../motion', () => ({
  ...jest.requireActual('../../motion'),
  useFlipTransition: () => undefined,
}));
jest.mock('../../contexts/tool-call-logs-config', () => ({
  useToolCallLogsConfigContext: () => ({ showReasoning: false, state: {} }),
}));
jest.mock('../shell/conversation-header', () => ({
  ConversationHeader: () => null,
}));
jest.mock('./empty-state', () => ({ EmptyState: () => null }));
jest.mock('./follow-up-chips', () => ({ FollowUpChips: () => null }));
jest.mock('./typing-indicator', () => ({ TypingIndicator: () => null }));
jest.mock('./composer', () => ({
  Composer: ({
    isLoading,
    onStop,
    onSubmit,
    value,
    onChange,
    error,
  }: {
    isLoading: boolean;
    onStop: () => void;
    onSubmit: () => void;
    value: string;
    onChange: (value: string) => void;
    error?: Error | null;
  }) => (
    <div>
      <span data-testid="isLoading">{String(isLoading)}</span>
      <span data-testid="composer-error">{error?.message ?? ''}</span>
      <input
        data-testid="input"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      <button data-testid="send" onClick={onSubmit} />
      <button data-testid="stop" onClick={onStop} />
    </div>
  ),
}));
// The real hook, on a schedule of milliseconds instead of minutes.
jest.mock('./use-stream-recovery', () => {
  const actual = jest.requireActual('./use-stream-recovery');
  return {
    ...actual,
    useStreamRecovery: (deps: Record<string, unknown>) =>
      actual.useStreamRecovery({
        ...deps,
        timing: {
          maxResumes: 3,
          resumeDelayMs: 5,
          pollIntervalMs: 25,
          maxPolls: 20,
        },
      }),
  };
});

const URL = 'https://svc.example/service/ai-chat/s1/message/stream?locale=en';
const encoder = new TextEncoder();
const frame = (part: unknown) =>
  encoder.encode(`data: ${JSON.stringify(part)}\n\n`);

type Controller = ReadableStreamDefaultController<Uint8Array>;
const makeStream = () => {
  let controller!: Controller;
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
    },
  });
  return { body, ctl: () => controller };
};
type Stream = ReturnType<typeof makeStream>;

/** The first frames of an answer: the message id, a step and some text. */
const begin = (stream: Stream, id: string, text: string) => {
  const ctl = stream.ctl();
  ctl.enqueue(frame({ type: 'start', messageId: id }));
  ctl.enqueue(frame({ type: 'start-step' }));
  ctl.enqueue(frame({ type: 'text-start', id: 't1' }));
  ctl.enqueue(frame({ type: 'text-delta', id: 't1', delta: text }));
};
const finish = (stream: Stream) => {
  const ctl = stream.ctl();
  ctl.enqueue(frame({ type: 'finish-step' }));
  ctl.enqueue(frame({ type: 'finish', finishReason: 'stop' }));
  ctl.close();
};
/** What the gateway does at 120 s: the connection ends in an error, with no finish frame. */
const cut = (stream: Stream, message = 'network error') =>
  stream.ctl().error(new TypeError(message));

const ok = (stream: Stream) => ({
  ok: true,
  status: 200,
  body: stream.body,
  text: async () => '',
});
const noContent = () => ({
  ok: true,
  status: 204,
  body: null,
  text: async () => '',
});

const methods = () =>
  mockFetch.mock.calls.map(
    ([, init]) => ((init as RequestInit | undefined)?.method ?? 'GET') as string
  );

const userMessage = (id: string, text: string): UIMessage => ({
  id,
  role: 'user',
  parts: [{ type: 'text', text }],
});
const assistantMessage = (id: string, text: string): UIMessage => ({
  id,
  role: 'assistant',
  parts: [{ type: 'text', text }],
});

const element = (
  sessionId: string,
  initial: UIMessage[],
  onTurnFinished: jest.Mock
) => (
  <NimbusProvider>
    <ChatArea
      sessionId={sessionId}
      initialMessages={initial}
      url={URL.replace('/s1/', `/${sessionId}/`)}
      activeTab="assistant"
      onTabChange={() => undefined}
      onNewSession={() => undefined}
      onOpenChatsDrawer={() => undefined}
      isLoadingSuggestions={false}
      followUps={[]}
      onDismissFollowUps={() => undefined}
      onTurnFinished={onTurnFinished}
    />
  </NimbusProvider>
);

const renderChat = (initial: UIMessage[] = []) => {
  const onTurnFinished = jest.fn();
  const view = render(element('s1', initial, onTurnFinished));
  return {
    ...view,
    onTurnFinished,
    switchTo: (sessionId: string, messages: UIMessage[]) =>
      view.rerender(element(sessionId, messages, onTurnFinished)),
  };
};

const send = (text: string) => {
  fireEvent.change(screen.getByTestId('input'), { target: { value: text } });
  fireEvent.click(screen.getByTestId('send'));
};

const status = () =>
  screen.getByTestId('chat-status').getAttribute('data-status');
const note = () => screen.queryByText('Reconnecting to the answer…');
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Whatever the components print fails the test, except one known warning about the markup
// the real markdown renderer produces.
const printed: string[] = [];
const record = (...args: unknown[]) => {
  const text = args.map(String).join(' ');
  if (!/cannot be a descendant of/.test(text)) printed.push(text);
};

beforeEach(() => {
  mockFetch.mockReset();
  mockGetMessages.mockReset();
  mockCancel.mockReset().mockResolvedValue({ success: true });
  mockRefresh.mockReset();
  printed.length = 0;
  jest.spyOn(console, 'error').mockImplementation(record);
  jest.spyOn(console, 'warn').mockImplementation(record);
});

afterEach(() => {
  jest.restoreAllMocks();
  expect(printed).toEqual([]);
});

/** Sends a first message and cuts the answer after some text: the state every case starts from. */
const startAndCut = async (
  view: ReturnType<typeof renderChat>,
  first: Stream
) => {
  send('hello');
  await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));
  begin(first, 'a1', 'partial answer');
  await screen.findByText('partial answer');
  cut(first);
  return view;
};

describe('ChatArea: the connection is cut while the answer is being written', () => {
  it('reattaches once, asks for the turn it was showing, and never runs the turn again', async () => {
    const first = makeStream();
    const second = makeStream();
    mockFetch
      .mockResolvedValueOnce(ok(first))
      .mockResolvedValueOnce(ok(second));
    const view = renderChat();
    await startAndCut(view, first);

    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2));
    expect(methods()).toEqual(['POST', 'GET']);
    // The reattach goes to the same path, keeps the locale, and names the answer.
    expect(String(mockFetch.mock.calls[1][0])).toBe(`${URL}&messageId=a1`);

    begin(second, 'a1', 'the whole answer');
    finish(second);
    await screen.findByText('the whole answer');
    await waitFor(() => expect(status()).toBe('ready'));

    expect(screen.queryByText('partial answer')).toBeNull();
    expect(note()).toBeNull();
    expect(methods()).toEqual(['POST', 'GET']);
    expect(mockCancel).not.toHaveBeenCalled();
    expect(view.onTurnFinished).toHaveBeenCalledTimes(1);
  });

  it('treats Safari’s wording of a cut response the same way', async () => {
    const first = makeStream();
    mockFetch.mockResolvedValueOnce(ok(first)).mockResolvedValue(noContent());
    const view = renderChat();
    send('hello');
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));
    begin(first, 'a1', 'partial answer');
    await screen.findByText('partial answer');
    cut(first, 'Load failed');
    await waitFor(() => expect(methods()).toEqual(['POST', 'GET']));
    view.unmount();
  });

  it('does not offer Try again, which would start a second run, while it recovers', async () => {
    const first = makeStream();
    mockFetch.mockResolvedValueOnce(ok(first)).mockResolvedValue(noContent());
    mockGetMessages.mockResolvedValue({
      success: true,
      data: [userMessage('u1', 'hello')],
    });
    const view = renderChat();
    await startAndCut(view, first);

    await waitFor(() => expect(note()).not.toBeNull());
    await waitFor(() => expect(methods()).toEqual(['POST', 'GET']));
    expect(screen.queryByLabelText('Try again')).toBeNull();
    expect(screen.getByTestId('isLoading').textContent).toBe('true');

    // The answer lands in storage: it replaces the partial one, and the actions come back.
    mockGetMessages.mockResolvedValue({
      success: true,
      data: [userMessage('u1', 'hello'), assistantMessage('a1', 'WHOLE')],
    });
    await screen.findByText('WHOLE');
    expect(screen.queryByText('partial answer')).toBeNull();
    await waitFor(() => expect(note()).toBeNull());
    expect(screen.getByLabelText('Try again')).toBeTruthy();
    expect(screen.getByTestId('isLoading').textContent).toBe('false');
    expect(methods()).toEqual(['POST', 'GET']);
    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });

  it('reports the end of a recovered turn from when the connection was lost, not from when it was noticed', async () => {
    const first = makeStream();
    mockFetch.mockResolvedValueOnce(ok(first)).mockResolvedValue(noContent());
    mockGetMessages
      .mockResolvedValueOnce({
        success: true,
        data: [userMessage('u1', 'hello')],
      })
      .mockResolvedValue({
        success: true,
        data: [userMessage('u1', 'hello'), assistantMessage('a1', 'WHOLE')],
      });
    const before = Date.now();
    const view = renderChat();
    await startAndCut(view, first);
    await screen.findByText('WHOLE');

    expect(view.onTurnFinished).toHaveBeenCalledTimes(1);
    const [since] = view.onTurnFinished.mock.calls[0] as [number];
    expect(since).toBeGreaterThanOrEqual(before);
    expect(since).toBeLessThan(Date.now() - 20);
  });

  it('keeps recovering when the reattach is itself cut before it delivers anything', async () => {
    const first = makeStream();
    const second = makeStream();
    mockFetch
      .mockResolvedValueOnce(ok(first))
      .mockResolvedValueOnce(ok(second))
      .mockResolvedValue(noContent());
    mockGetMessages.mockResolvedValue({
      success: true,
      data: [userMessage('u1', 'hello'), assistantMessage('a1', 'WHOLE')],
    });
    const view = renderChat();
    await startAndCut(view, first);
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2));

    // Only the opening frame arrives, then the connection fails again.
    second.ctl().enqueue(frame({ type: 'start', messageId: 'a1' }));
    cut(second);

    await screen.findByText('WHOLE');
    expect(view.onTurnFinished).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('network error')).toBeNull();
    expect(methods().filter((method) => method === 'POST')).toHaveLength(1);
  });

  it('hides the "Reconnecting" note once the reattached answer is streaming in', async () => {
    const first = makeStream();
    const second = makeStream();
    mockFetch
      .mockResolvedValueOnce(ok(first))
      .mockResolvedValueOnce(ok(second));
    const view = renderChat();
    await startAndCut(view, first);
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2));

    begin(second, 'a1', 'replayed so far');
    await screen.findByText('replayed so far');
    await waitFor(() => expect(status()).toBe('streaming'));
    expect(note()).toBeNull();

    finish(second);
    await waitFor(() => expect(status()).toBe('ready'));
  });

  it('gives up with a message, and leaves the composer able to send', async () => {
    const first = makeStream();
    mockFetch
      .mockResolvedValueOnce(ok(first))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValue(noContent());
    mockGetMessages.mockResolvedValue({
      success: true,
      data: [userMessage('u1', 'hello')],
    });
    const view = renderChat();
    await startAndCut(view, first);

    // 20 reads of 25 ms before it gives up.
    await screen.findByText(/could not be retrieved/, undefined, {
      timeout: 4000,
    });
    expect(note()).toBeNull();
    await waitFor(() => expect(status()).toBe('ready'));
    expect(screen.getByTestId('composer-error').textContent).toBe('');

    send('and now?');
    await waitFor(() =>
      expect(methods().filter((m) => m === 'POST')).toHaveLength(2)
    );
    view.unmount();
  });
});

describe('ChatArea: what the user sees while it recovers', () => {
  it('shows no error while it reconnects, even after the reattach failed to connect', async () => {
    const first = makeStream();
    mockFetch
      .mockResolvedValueOnce(ok(first))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'));
    // The answer is not stored yet and the read stays open: the recovery stays active.
    mockGetMessages.mockReturnValue(new Promise(() => undefined));
    const view = renderChat();
    await startAndCut(view, first);

    await waitFor(() => expect(status()).toBe('error'));
    expect(note()).not.toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByTestId('composer-error').textContent).toBe('');
    view.unmount();
  });

  it('leaves the chat ready, with no error, when a poll recovers after a reattach that failed to connect', async () => {
    const first = makeStream();
    mockFetch
      .mockResolvedValueOnce(ok(first))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'));
    mockGetMessages
      .mockResolvedValueOnce({
        success: true,
        data: [userMessage('u1', 'hello')],
      })
      .mockResolvedValue({
        success: true,
        data: [userMessage('u1', 'hello'), assistantMessage('a1', 'WHOLE')],
      });
    const view = renderChat();
    await startAndCut(view, first);

    await screen.findByText('WHOLE');
    await waitFor(() => expect(status()).toBe('ready'));
    expect(screen.getByTestId('composer-error').textContent).toBe('');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByTestId('isLoading').textContent).toBe('false');

    send('and then?');
    await waitFor(() =>
      expect(methods().filter((m) => m === 'POST')).toHaveLength(2)
    );
    view.unmount();
  });

  it('keeps the copy and rating actions of the earlier answers, and their rated state', async () => {
    const first = makeStream();
    mockFetch.mockResolvedValueOnce(ok(first)).mockResolvedValue(noContent());
    mockGetMessages.mockReturnValue(new Promise(() => undefined));
    const view = renderChat([
      userMessage('u0', 'earlier question'),
      assistantMessage('a0', 'earlier answer'),
    ]);
    fireEvent.click(screen.getByLabelText('Good answer'));
    await screen.findByLabelText('Rated good');

    await startAndCut(view, first);
    await waitFor(() => expect(note()).not.toBeNull());

    // The answer being recovered has no actions yet; the earlier one is untouched.
    expect(screen.getAllByLabelText('Copy reply')).toHaveLength(1);
    expect(screen.getByLabelText('Rated good')).toBeTruthy();
    expect(screen.queryByLabelText('Good answer')).toBeNull();
    expect(screen.queryByLabelText('Try again')).toBeNull();
    view.unmount();
  });

  it('does not take the answer the retry replaced for the new one, while that one is still being written', async () => {
    const retry = makeStream();
    mockFetch.mockResolvedValueOnce(ok(retry)).mockResolvedValue(noContent());
    const oldStored = [
      userMessage('u1', 'hello'),
      assistantMessage('a1', 'OLD ANSWER'),
    ];
    let reads = 0;
    let newAnswerStored = false;
    mockGetMessages.mockImplementation(async () => {
      reads += 1;
      // The service still stores the old answer; the new one lands when the test says so.
      return {
        success: true,
        data: newAnswerStored
          ? [...oldStored, assistantMessage('a2', 'NEW ANSWER')]
          : oldStored,
      };
    });
    const view = renderChat(oldStored);
    await screen.findByText('OLD ANSWER');

    // Try again: the old answer leaves the screen and a new one starts streaming.
    fireEvent.click(screen.getByLabelText('Try again'));
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));
    begin(retry, 'a2', 'new partial');
    await screen.findByText('new partial');
    expect(screen.queryByText('OLD ANSWER')).toBeNull();
    cut(retry);

    // Several reads that return only the old answer: it must neither show nor end the recovery.
    await waitFor(() => expect(reads).toBeGreaterThanOrEqual(3));
    expect(screen.queryByText('OLD ANSWER')).toBeNull();
    expect(note()).not.toBeNull();
    expect(screen.getByTestId('isLoading').textContent).toBe('true');
    expect(view.onTurnFinished).not.toHaveBeenCalled();

    newAnswerStored = true;
    await screen.findByText('NEW ANSWER');
    expect(screen.queryByText('OLD ANSWER')).toBeNull();
    await waitFor(() => expect(note()).toBeNull());
    expect(view.onTurnFinished).toHaveBeenCalledTimes(1);
    view.unmount();
  });

  it('reports a reattached turn as finished from when the connection was lost, not from the end of the replay', async () => {
    const first = makeStream();
    const second = makeStream();
    mockFetch
      .mockResolvedValueOnce(ok(first))
      .mockResolvedValueOnce(ok(second));
    const view = renderChat();
    send('hello');
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));
    begin(first, 'a1', 'partial answer');
    await screen.findByText('partial answer');

    const lostAt = Date.now();
    cut(first);
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2));
    await sleep(150);
    const endedAt = Date.now();
    begin(second, 'a1', 'the whole answer');
    finish(second);
    await screen.findByText('the whole answer');
    await waitFor(() => expect(view.onTurnFinished).toHaveBeenCalledTimes(1));

    const [since] = view.onTurnFinished.mock.calls[0] as [number];
    expect(since).toBeGreaterThanOrEqual(lostAt);
    expect(since).toBeLessThan(endedAt - 50);
    view.unmount();
  });
});

describe('ChatArea: stop', () => {
  it('stops the run on the service, naming the turn, as well as the request', async () => {
    const first = makeStream();
    mockFetch.mockResolvedValueOnce(ok(first));
    const view = renderChat();
    send('hello');
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));
    begin(first, 'a1', 'partial answer');
    await screen.findByText('partial answer');

    fireEvent.click(screen.getByTestId('stop'));
    expect(mockCancel).toHaveBeenCalledWith('s1', 'a1');
    await waitFor(() => expect(status()).toBe('ready'));
    view.unmount();
  });

  it('during a recovery ends it, and leaves the composer able to send', async () => {
    const first = makeStream();
    mockFetch
      .mockResolvedValueOnce(ok(first))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValue(noContent());
    mockGetMessages.mockResolvedValue({
      success: true,
      data: [userMessage('u1', 'hello')],
    });
    const view = renderChat();
    await startAndCut(view, first);
    await waitFor(() => expect(note()).not.toBeNull());
    await waitFor(() => expect(status()).toBe('error'));

    fireEvent.click(screen.getByTestId('stop'));
    expect(mockCancel).toHaveBeenCalledWith('s1', 'a1');
    await waitFor(() => expect(note()).toBeNull());
    expect(status()).toBe('ready');
    expect(screen.getByTestId('composer-error').textContent).toBe('');
    expect(screen.getByTestId('isLoading').textContent).toBe('false');

    // Nothing keeps looking for the answer after stop.
    const reads = mockGetMessages.mock.calls.length;
    await sleep(150);
    expect(mockGetMessages.mock.calls.length).toBe(reads);

    send('a new question');
    await waitFor(() =>
      expect(methods().filter((m) => m === 'POST')).toHaveLength(2)
    );
    view.unmount();
  });
});

describe('ChatArea: what is not a dropped connection', () => {
  it('does not reattach, poll or run again for an error the service reported itself', async () => {
    const first = makeStream();
    mockFetch.mockResolvedValueOnce(ok(first)).mockResolvedValue(noContent());
    const view = renderChat();
    send('hello');
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));
    begin(first, 'a1', 'partial answer');
    await screen.findByText('partial answer');
    first
      .ctl()
      .enqueue(frame({ type: 'error', errorText: 'Model unavailable' }));

    expect((await screen.findByRole('alert')).textContent).toContain(
      'Model unavailable'
    );
    await sleep(250);
    expect(methods()).toEqual(['POST']);
    expect(mockGetMessages).not.toHaveBeenCalled();
    expect(note()).toBeNull();
    view.unmount();
  });

  it('runs a new turn when Try again is pressed on a finished answer', async () => {
    const first = makeStream();
    const second = makeStream();
    mockFetch
      .mockResolvedValueOnce(ok(first))
      .mockResolvedValueOnce(ok(second));
    const view = renderChat();
    send('hello');
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));
    begin(first, 'a1', 'first answer');
    finish(first);
    await waitFor(() => expect(status()).toBe('ready'));

    fireEvent.click(screen.getByLabelText('Try again'));
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2));
    expect(methods()).toEqual(['POST', 'POST']);
    view.unmount();
  });
});

describe('ChatArea: a drop that does not belong to the chat on screen', () => {
  it('is ignored when the user has moved to another chat', async () => {
    const first = makeStream();
    mockFetch.mockResolvedValueOnce(ok(first)).mockResolvedValue(noContent());
    const view = renderChat();
    send('hello');
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));
    begin(first, 'a1', 'partial answer');
    await screen.findByText('partial answer');

    // The user opens another chat while the first answer is still streaming.
    view.switchTo('s2', [
      userMessage('b1', 'a different chat'),
      assistantMessage('b2', 'its answer'),
    ]);
    await screen.findByText('its answer');
    cut(first);
    await sleep(250);

    expect(methods()).toEqual(['POST']);
    expect(mockGetMessages).not.toHaveBeenCalled();
    expect(note()).toBeNull();
    expect(screen.getByTestId('isLoading').textContent).toBe('false');
    view.unmount();
  });

  it('is not ended or confused by the late finish of a chat the user left', async () => {
    const chatA = makeStream();
    const chatB = makeStream();
    let releaseReattach!: () => void;
    mockFetch
      .mockResolvedValueOnce(ok(chatA))
      .mockResolvedValueOnce(ok(chatB))
      // The reattach of chat B stays in flight until the test lets it answer.
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            releaseReattach = () => resolve(noContent());
          })
      );
    mockGetMessages.mockResolvedValue({
      success: true,
      data: [userMessage('b1', 'question in b')],
    });
    const view = renderChat();
    send('hello');
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));
    begin(chatA, 'a1', 'answer in a');
    await screen.findByText('answer in a');

    // The user opens chat B, asks something, and its connection is cut.
    view.switchTo('s2', [userMessage('b1', 'question in b')]);
    await screen.findByText('question in b');
    send('second');
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2));
    begin(chatB, 'b2', 'partial in b');
    await screen.findByText('partial in b');
    cut(chatB);
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(3));

    // While chat B reattaches, chat A, which the user left, finishes normally. That says
    // nothing about chat B: its recovery must neither end nor count it as its own.
    finish(chatA);
    await sleep(60);
    releaseReattach();

    mockGetMessages.mockResolvedValue({
      success: true,
      data: [
        userMessage('b1', 'question in b'),
        assistantMessage('b2', 'WHOLE in b'),
      ],
    });
    await screen.findByText('WHOLE in b');
    await waitFor(() => expect(note()).toBeNull());
    expect(methods()).toEqual(['POST', 'POST', 'GET']);
    view.unmount();
  });

  it('starts nothing after the chat has unmounted', async () => {
    const first = makeStream();
    mockFetch.mockResolvedValueOnce(ok(first)).mockResolvedValue(noContent());
    const view = renderChat();
    send('hello');
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));
    begin(first, 'a1', 'partial answer');
    await screen.findByText('partial answer');

    view.unmount();
    cut(first);
    await sleep(250);

    expect(methods()).toEqual(['POST']);
    expect(mockGetMessages).not.toHaveBeenCalled();
    expect(mockRefresh).not.toHaveBeenCalled();
  });
});
