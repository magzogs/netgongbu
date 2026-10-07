// A stand-in for `codex app-server`: the JSON-RPC requests this app sends, answered the way
// Codex does. Each answer echoes what the turn was given, so tests can check it.
import { createInterface } from 'node:readline';

if (process.argv[2] === '--version') {
  console.log('codex-cli 0.0.0-fake');
  process.exit(0);
}

let signedIn = process.env.FAKE_CODEX_SIGNED_IN === '1';
const threads = new Map();
const send = (msg) => process.stdout.write(`${JSON.stringify(msg)}\n`);
const notify = (method, params) => send({ method, params });

const models = [
  {
    id: 'gpt-fast',
    model: 'gpt-fast',
    displayName: 'GPT Fast',
    description: 'quick',
    hidden: false,
    isDefault: true,
    supportedReasoningEfforts: [{ reasoningEffort: 'low' }, { reasoningEffort: 'high' }],
    defaultReasoningEffort: 'low',
    inputModalities: ['text', 'image'],
  },
  {
    id: 'gpt-hidden',
    model: 'gpt-hidden',
    displayName: 'Hidden',
    hidden: true,
    supportedReasoningEfforts: [],
  },
];
const page2 = [
  {
    id: 'gpt-deep',
    model: 'gpt-deep',
    displayName: 'GPT Deep',
    hidden: false,
    isDefault: false,
    supportedReasoningEfforts: [{ reasoningEffort: 'medium' }, { reasoningEffort: 'xhigh' }],
    defaultReasoningEffort: 'medium',
    inputModalities: ['text'],
  },
];

createInterface({ input: process.stdin }).on('line', (line) => {
  const { id, method, params } = JSON.parse(line);
  if (id === undefined) return;
  switch (method) {
    case 'initialize':
      return send({ id, result: { userAgent: 'fake' } });
    case 'account/read':
      return send({
        id,
        result: {
          account: signedIn
            ? { type: 'chatgpt', email: 'learner@example.com', planType: 'plus' }
            : null,
          requiresOpenaiAuth: true,
        },
      });
    case 'account/login/start':
      send({
        id,
        result: { type: 'chatgpt', loginId: 'login-1', authUrl: 'https://auth.example/oauth' },
      });
      setTimeout(() => {
        signedIn = true;
        notify('account/login/completed', { loginId: 'login-1', success: true, error: null });
      }, 30);
      return;
    case 'account/logout':
      signedIn = false;
      return send({ id, result: {} });
    case 'model/list':
      return send({
        id,
        result: params.cursor
          ? { data: page2, nextCursor: null }
          : { data: models, nextCursor: 'p2' },
      });
    case 'thread/start': {
      const threadId = `thread-${String(threads.size + 1)}`;
      threads.set(threadId, params);
      return send({ id, result: { thread: { id: threadId }, model: params.model ?? 'gpt-fast' } });
    }
    case 'turn/start': {
      const thread = threads.get(params.threadId);
      const text = params.input.find((i) => i.type === 'text')?.text ?? '';
      send({ id, result: { turn: { id: 'turn-1', status: 'inProgress' } } });
      if (!signedIn) {
        notify('error', {
          threadId: params.threadId,
          turnId: 'turn-1',
          willRetry: false,
          error: { message: 'no auth', codexErrorInfo: 'unauthorized' },
        });
        notify('turn/completed', {
          threadId: params.threadId,
          turn: {
            id: 'turn-1',
            status: 'failed',
            error: { message: 'no auth', codexErrorInfo: 'unauthorized' },
          },
        });
        return;
      }
      if (text.includes('WAIT')) return; // until interrupted
      const answer = JSON.stringify({
        model: params.model ?? null,
        effort: params.effort ?? null,
        instructions: thread.baseInstructions,
        sandbox: thread.sandbox,
        ephemeral: thread.ephemeral,
        text,
        images: params.input.filter((i) => i.type === 'image').length,
        schema: Boolean(params.outputSchema),
      });
      const half = Math.floor(answer.length / 2);
      for (const delta of [answer.slice(0, half), answer.slice(half)]) {
        notify('item/agentMessage/delta', {
          threadId: params.threadId,
          turnId: 'turn-1',
          itemId: 'msg-1',
          delta,
        });
      }
      notify('item/completed', {
        threadId: params.threadId,
        turnId: 'turn-1',
        item: { type: 'agentMessage', id: 'msg-1', text: answer },
      });
      notify('turn/completed', {
        threadId: params.threadId,
        turn: { id: 'turn-1', status: 'completed', error: null },
      });
      return;
    }
    case 'turn/interrupt':
      send({ id, result: {} });
      notify('turn/completed', {
        threadId: params.threadId,
        turn: { id: params.turnId, status: 'interrupted', error: null },
      });
      return;
    default:
      return send({ id, result: {} });
  }
});
