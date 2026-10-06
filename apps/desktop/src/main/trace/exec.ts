import { execFile } from 'node:child_process';

/** Runs a tool and returns its stdout, or null when it failed, timed out or does not exist. */
export type Exec = (
  file: string,
  args: readonly string[],
  timeoutMs?: number,
) => Promise<string | null>;

/**
 * execFile without a shell: arguments are passed as-is, never interpreted, so a host name
 * typed by the learner cannot run anything. Output is forced to English for the parsers.
 */
export const execTool: Exec = (file, args, timeoutMs = 5000) =>
  new Promise((resolve) => {
    execFile(
      file,
      [...args],
      { timeout: timeoutMs, maxBuffer: 1 << 20, env: { ...process.env, LC_ALL: 'C' } },
      (err, stdout) => {
        resolve(err ? null : stdout);
      },
    );
  });

/** Resolves (or rejects) within `ms`, whichever comes first. */
export function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      resolve(fallback);
    }, ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(fallback);
      },
    );
  });
}
