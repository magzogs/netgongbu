// A stand-in for the `claude` CLI: --version, auth status/login/logout, and print mode with
// stream-json in and out. Each answer echoes the options it was run with.
import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';

const args = process.argv.slice(2);
const option = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const out = (msg) => process.stdout.write(`${JSON.stringify(msg)}\n`);

if (args[0] === '--version') {
  console.log('9.9.9 (Claude Code)');
  process.exit(0);
}
if (args[0] === 'auth') {
  if (args[1] === 'status') {
    console.log(
      JSON.stringify(
        process.env.FAKE_CLAUDE_SIGNED_IN === '1'
          ? {
              loggedIn: true,
              authMethod: 'claude.ai',
              apiProvider: 'firstParty',
              email: 'learner@example.com',
              subscriptionType: 'max',
            }
          : { loggedIn: false, authMethod: 'none', apiProvider: 'firstParty' },
      ),
    );
    process.exit(0);
  }
  if (args[1] === 'login') {
    console.log('Opening browser to sign in…');
    console.log('If the browser did not open, visit: https://claude.ai/oauth/authorize?code=true');
    setTimeout(() => process.exit(0), 30);
  } else {
    process.exit(0);
  }
} else {
  createInterface({ input: process.stdin }).on('line', (line) => {
    const msg = JSON.parse(line);
    if (msg.type === 'control_request') {
      out({
        type: 'control_response',
        response: {
          subtype: 'success',
          request_id: msg.request_id,
          response: {
            models: [
              {
                value: 'default',
                displayName: 'Default (recommended)',
                supportsEffort: true,
                supportedEffortLevels: ['low', 'medium', 'high', 'xhigh', 'max'],
              },
              { value: 'haiku', displayName: 'Haiku', description: 'Fastest' },
            ],
          },
        },
      });
      return;
    }
    if (msg.type !== 'user') return;
    const content = msg.message.content;
    const text = content.find((c) => c.type === 'text')?.text ?? '';
    if (text.includes('AUTHFAIL')) {
      out({
        type: 'result',
        subtype: 'success',
        is_error: true,
        result: 'Failed to authenticate: OAuth session expired',
      });
      return;
    }
    const schema = option('--json-schema');
    const answer = JSON.stringify({
      model: option('--model') ?? null,
      effort: option('--effort') ?? null,
      system: readFileSync(option('--system-prompt-file'), 'utf8'),
      tools: option('--tools'),
      safe: args.includes('--safe-mode'),
      text,
      images: content.filter((c) => c.type === 'image').length,
    });
    out({ type: 'system', subtype: 'init', model: 'claude-fake-1' });
    for (const piece of [answer.slice(0, 10), answer.slice(10)]) {
      out({
        type: 'stream_event',
        event: {
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'text_delta', text: piece },
        },
      });
    }
    out({
      type: 'assistant',
      message: { model: 'claude-fake-1', content: [{ type: 'text', text: answer }] },
    });
    out({
      type: 'result',
      subtype: 'success',
      is_error: false,
      result: answer,
      stop_reason: 'end_turn',
      ...(schema && { structured_output: { schema: JSON.parse(schema).type } }),
    });
  });
}
