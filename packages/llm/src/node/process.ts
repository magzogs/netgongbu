import { spawn, type ChildProcess, type SpawnOptions } from 'node:child_process';
import type { Readable } from 'node:stream';

/**
 * Variables that mark a Claude Code session. When this app is started from inside one (a
 * developer's terminal in Claude Code), a CLI run from here would otherwise think it is nested
 * in that session and use its credentials or bare mode instead of the learner's own login.
 */
const SESSION_VARS = new Set([
  'CLAUDECODE',
  'CLAUDE_CODE_ENTRYPOINT',
  'CLAUDE_CODE_SESSION_ID',
  'CLAUDE_CODE_CHILD_SESSION',
  'CLAUDE_CODE_SESSION_ATTENDED',
  'CLAUDE_CODE_SIMPLE',
  'CLAUDE_CODE_HOST_SESSION_ID',
  'CLAUDE_CODE_MESSAGING_SOCKET',
  'CLAUDE_CODE_MESSAGING_TOKEN',
  'CLAUDE_CODE_SDK_HAS_HOST_AUTH_REFRESH',
  'CLAUDE_CODE_OAUTH_SCOPES',
  'CLAUDE_CODE_EXECPATH',
  'CLAUDE_CODE_ORGANIZATION_UUID',
  'CLAUDE_CODE_ACCOUNT_UUID',
  'CLAUDE_CODE_USER_EMAIL',
  'CLAUDE_AGENT_SDK_VERSION',
  'CLAUDE_PID',
  'CLAUDE_EFFORT',
]);

/** The environment for a CLI run: this process's, without a surrounding Claude Code session. */
export function cliEnv(base: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  // Inside a Claude Code session the base URL points at that session's proxy.
  const nested = Boolean(base.CLAUDECODE);
  return Object.fromEntries(
    Object.entries(base).filter(
      ([name]) => !SESSION_VARS.has(name) && !(nested && name === 'ANTHROPIC_BASE_URL'),
    ),
  );
}

/** Spawns a CLI; on Windows a .cmd shim has to go through the shell. */
export function spawnCli(path: string, args: string[], options: SpawnOptions = {}): ChildProcess {
  const shim = process.platform === 'win32' && /\.(cmd|bat)$/i.test(path);
  return spawn(path, args, {
    ...options,
    ...(shim && { shell: true }),
    windowsHide: true,
  });
}

/** Calls `onLine` with each line written to `stream`. */
export function onLines(stream: Readable | null, onLine: (line: string) => void): void {
  if (!stream) return;
  let buffer = '';
  stream.setEncoding('utf8');
  stream.on('data', (chunk: string) => {
    buffer += chunk;
    let newline = buffer.indexOf('\n');
    while (newline >= 0) {
      const line = buffer.slice(0, newline).replace(/\r$/, '');
      buffer = buffer.slice(newline + 1);
      if (line) onLine(line);
      newline = buffer.indexOf('\n');
    }
  });
  stream.on('end', () => {
    if (buffer) onLine(buffer);
    buffer = '';
  });
}

export interface RunResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

/** Runs a CLI to the end and collects what it wrote; kills it after `timeoutMs`. */
export function runCli(
  path: string,
  args: string[],
  options: { cwd?: string; env?: NodeJS.ProcessEnv; timeoutMs?: number; input?: string } = {},
): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawnCli(path, args, {
      cwd: options.cwd,
      env: options.env ?? cliEnv(),
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout?.setEncoding('utf8');
    child.stderr?.setEncoding('utf8');
    child.stdout?.on('data', (d: string) => {
      stdout += d;
    });
    child.stderr?.on('data', (d: string) => {
      stderr += d;
    });
    const timer = setTimeout(() => {
      child.kill();
    }, options.timeoutMs ?? 15_000);
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
    child.stdin?.end(options.input ?? '');
  });
}

/** The last few lines a failed CLI wrote, for an error message. */
export function tail(text: string, lines = 4): string {
  return text.trim().split('\n').slice(-lines).join('\n').slice(0, 600);
}
