import { randomBytes } from 'node:crypto';
import { rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import type { AccountState, ModelOption } from '../types';
import { AiError, parseDataUrl } from './http';
import { cliEnv, onLines, runCli, spawnCli, tail } from './process';
import { asOnePrompt, type Answer, type Ask, type Provider } from './provider';

/*
 * Claude through the official Claude Code CLI (`claude`). Signing in with a Claude account is
 * Claude Code's own (`claude auth login`): Anthropic allows the subscription's OAuth tokens only
 * in Claude Code and Claude.ai, so this app runs the CLI and never touches the tokens.
 * Each question is one print-mode run with no tools, no settings or plugins (safe mode), in an
 * empty folder; the answer streams back as stream-json.
 */

const ModelSchema = z.looseObject({
  value: z.string(),
  displayName: z.string().optional(),
  description: z.string().optional(),
  supportsEffort: z.boolean().optional(),
  supportedEffortLevels: z.array(z.string()).optional(),
});

const StatusSchema = z.looseObject({
  loggedIn: z.boolean().optional(),
  authMethod: z.string().optional(),
  apiProvider: z.string().optional(),
  email: z.string().nullish(),
  orgName: z.string().nullish(),
  subscriptionType: z.string().nullish(),
});

const STREAM_ARGS = [
  '-p',
  '--input-format',
  'stream-json',
  '--output-format',
  'stream-json',
  '--verbose',
  '--no-session-persistence',
  '--safe-mode',
  '--strict-mcp-config',
];

const capitalize = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/** The parts of one stream-json line this client reads. */
interface Line {
  type?: string;
  subtype?: string;
  event?: { type?: string; delta?: { type?: string; text?: string } };
  message?: { model?: string; content?: { type?: string; text?: string }[] };
  model?: string;
  response?: { subtype?: string; request_id?: string; error?: string; response?: unknown };
  is_error?: boolean;
  result?: string;
  stop_reason?: string | null;
  structured_output?: unknown;
}

function userMessage(text: string, images: string[]): string {
  const content = [
    ...images.flatMap((url) => {
      const image = parseDataUrl(url);
      return image
        ? [
            {
              type: 'image',
              source: { type: 'base64', media_type: image.mediaType, data: image.data },
            },
          ]
        : [];
    }),
    { type: 'text', text },
  ];
  return `${JSON.stringify({
    type: 'user',
    message: { role: 'user', content },
    parent_tool_use_id: null,
    session_id: '',
  })}\n`;
}

export class ClaudeCli implements Provider {
  constructor(
    readonly path: string,
    private readonly options: { cwd: string; log: (message: string) => void },
  ) {}

  async account(): Promise<AccountState> {
    const { stdout, stderr } = await runCli(this.path, ['auth', 'status', '--json'], {
      cwd: this.options.cwd,
      env: cliEnv(),
      timeoutMs: 20_000,
    });
    let json: unknown;
    try {
      json = JSON.parse(stdout);
    } catch {
      return {
        state: 'error',
        message: tail(stderr || stdout) || '로그인 상태를 읽지 못했습니다.',
      };
    }
    const status = StatusSchema.safeParse(json);
    if (!status.success || !status.data.loggedIn) return { state: 'signed-out' };
    const s = status.data;
    const method = (s.authMethod ?? '').toLowerCase();
    if (s.apiProvider && s.apiProvider !== 'firstParty')
      return { state: 'signed-in', kind: 'other', label: s.apiProvider };
    const plan = s.subscriptionType ? `Claude ${capitalize(s.subscriptionType)}` : null;
    const label = [s.email, plan, s.orgName].filter(Boolean).join(' · ') || (s.authMethod ?? '');
    if (method.includes('api') || method.includes('console'))
      return { state: 'signed-in', kind: 'apiKey', label: label || 'API 키' };
    return { state: 'signed-in', kind: 'subscription', label: label || 'Claude 계정' };
  }

  /**
   * `claude auth login`: Claude Code opens the sign-in page in the browser and waits for it.
   * `onUrl` gets the page's address in case the browser did not open.
   */
  login(onUrl: (url: string) => void): { done: Promise<void>; cancel: () => void } {
    const child = spawnCli(this.path, ['auth', 'login', '--claudeai'], {
      cwd: this.options.cwd,
      env: cliEnv(),
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let output = '';
    let sent = false;
    const read = (line: string): void => {
      output = (output + line + '\n').slice(-4000);
      const url = /https:\/\/\S+/.exec(line)?.[0];
      if (url && !sent) {
        sent = true;
        onUrl(url);
      }
    };
    onLines(child.stdout, read);
    onLines(child.stderr, read);
    const timer = setTimeout(() => child.kill(), 10 * 60_000);
    const done = new Promise<void>((resolve, reject) => {
      child.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        if (code === 0) resolve();
        else reject(new Error(tail(output) || `claude auth login 실패 (코드 ${String(code)})`));
      });
    });
    return {
      done,
      cancel: () => {
        child.kill();
      },
    };
  }

  async logout(): Promise<void> {
    const { code, stdout, stderr } = await runCli(this.path, ['auth', 'logout'], {
      cwd: this.options.cwd,
      env: cliEnv(),
      timeoutMs: 20_000,
    });
    if (code !== 0) throw new Error(tail(stderr || stdout) || 'claude auth logout 실패');
  }

  /** The models Claude Code offers this account, from its `initialize` handshake. */
  models(): Promise<ModelOption[]> {
    return new Promise((resolve, reject) => {
      const child = spawnCli(this.path, [...STREAM_ARGS, '--tools', ''], {
        cwd: this.options.cwd,
        env: cliEnv(),
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      let stderr = '';
      child.stderr?.setEncoding('utf8');
      child.stderr?.on('data', (d: string) => {
        stderr = (stderr + d).slice(-4000);
      });
      let settled = false;
      const finish = (result: ModelOption[] | Error): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        child.kill();
        if (result instanceof Error) reject(result);
        else resolve(result);
      };
      const timer = setTimeout(() => {
        finish(new AiError('Claude Code가 모델 목록에 답하지 않습니다.', 'connect'));
      }, 30_000);
      onLines(child.stdout, (raw) => {
        let line: Line;
        try {
          line = JSON.parse(raw) as Line;
        } catch {
          return;
        }
        if (line.type !== 'control_response' || line.response?.request_id !== 'models') return;
        if (line.response.subtype === 'error') {
          finish(new AiError(line.response.error ?? 'Claude Code가 모델 목록을 주지 않았습니다.'));
          return;
        }
        const listed = z.object({ models: z.array(ModelSchema) }).safeParse(line.response.response);
        if (!listed.success) {
          finish(new AiError('Claude Code의 모델 목록 형식을 알 수 없습니다.', 'format'));
          return;
        }
        finish(
          listed.data.models.map((m) => ({
            id: m.value,
            label: m.displayName ?? m.value,
            ...(m.description && { description: m.description }),
            efforts: m.supportsEffort === false ? [] : (m.supportedEffortLevels ?? []),
            vision: true,
            ...(m.value === 'default' && { recommended: true }),
          })),
        );
      });
      child.on('error', (err) => {
        finish(new AiError(`Claude Code를 실행하지 못했습니다: ${err.message}`, 'connect'));
      });
      child.on('close', (code) => {
        finish(
          new AiError(
            `Claude Code가 종료되었습니다 (코드 ${String(code)})${stderr ? `: ${tail(stderr, 2)}` : ''}`,
            'connect',
          ),
        );
      });
      child.stdin?.write(
        `${JSON.stringify({ type: 'control_request', request_id: 'models', request: { subtype: 'initialize' } })}\n`,
      );
    });
  }

  async ask(ask: Ask): Promise<Answer> {
    // The system prompt (topology and example scenario for questions that make one) is long:
    // a file keeps it off the command line.
    const promptFile = join(this.options.cwd, `system-${randomBytes(6).toString('hex')}.txt`);
    await writeFile(promptFile, ask.system);
    const args = [
      ...STREAM_ARGS,
      '--include-partial-messages',
      '--tools',
      '',
      '--system-prompt-file',
      promptFile,
      ...(ask.model && ask.model !== 'default' ? ['--model', ask.model] : []),
      ...(ask.effort ? ['--effort', ask.effort] : []),
      ...(ask.schema ? ['--json-schema', JSON.stringify(ask.schema)] : []),
    ];
    try {
      return await this.run(args, ask);
    } finally {
      await rm(promptFile, { force: true });
    }
  }

  private run(args: string[], ask: Ask): Promise<Answer> {
    const prompt = asOnePrompt(ask.turns);
    return new Promise<Answer>((resolve, reject) => {
      const child = spawnCli(this.path, args, {
        cwd: this.options.cwd,
        env: cliEnv(),
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      let stderr = '';
      child.stderr?.setEncoding('utf8');
      child.stderr?.on('data', (d: string) => {
        stderr = (stderr + d).slice(-4000);
      });
      let streamed = '';
      let finalText = '';
      let model: string | null = null;
      // Set by the line reader; read when the process ends.
      const out: { answer: Answer | Error | null } = { answer: null };

      onLines(child.stdout, (raw) => {
        let line: Line;
        try {
          line = JSON.parse(raw) as Line;
        } catch {
          return;
        }
        if (line.type === 'system' && line.subtype === 'init') {
          model = line.model ?? model;
        } else if (line.type === 'stream_event') {
          const { event } = line;
          if (event?.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
            const piece = event.delta.text ?? '';
            streamed += piece;
            if (piece) ask.onText?.(piece);
          }
        } else if (line.type === 'assistant') {
          model = line.message?.model ?? model;
          const text = (line.message?.content ?? [])
            .flatMap((b) => (b.type === 'text' && b.text ? [b.text] : []))
            .join('');
          if (text) finalText = text;
        } else if (line.type === 'result') {
          if (line.is_error) {
            const message = line.result ?? 'Claude Code가 답하지 못했습니다.';
            out.answer = new AiError(
              message,
              /login|authenticat|credential/i.test(message) ? 'auth' : 'http',
            );
          } else {
            const structured =
              line.structured_output === undefined ? null : JSON.stringify(line.structured_output);
            const stop: Answer['stop'] =
              line.stop_reason === 'refusal'
                ? 'refusal'
                : line.stop_reason === 'max_tokens'
                  ? 'max_tokens'
                  : 'end';
            out.answer = {
              text: structured ?? (finalText || streamed || (line.result ?? '')),
              stop,
              model,
            };
          }
          child.stdin?.end();
        }
      });

      const abort = (): void => {
        child.kill();
      };
      ask.signal?.addEventListener('abort', abort);
      child.on('error', (err) => {
        ask.signal?.removeEventListener('abort', abort);
        reject(new AiError(`Claude Code를 실행하지 못했습니다: ${err.message}`, 'connect'));
      });
      child.on('close', (code) => {
        ask.signal?.removeEventListener('abort', abort);
        const result = out.answer;
        if (result instanceof Error) reject(result);
        else if (result) resolve(result);
        else if (ask.signal?.aborted) resolve({ text: streamed, stop: 'end', model });
        else
          reject(
            new AiError(
              `Claude Code가 답 없이 끝났습니다 (코드 ${String(code)})${stderr ? `: ${tail(stderr, 3)}` : ''}`,
            ),
          );
      });
      child.stdin?.write(userMessage(prompt.text, prompt.images));
    });
  }
}
