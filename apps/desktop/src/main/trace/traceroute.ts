import { spawn as nodeSpawn } from 'node:child_process';
import { lineSplitter, parseTracerouteLine, type TracerouteLine } from '@magvirtualedu/trace';

export interface TracerouteOptions {
  platform: NodeJS.Platform;
  maxHops?: number;
  /** Give up on the whole trace after this long. */
  timeoutMs?: number;
  /** Stop after this many silent hops in a row past the last answer (firewalled target). */
  maxSilentRun?: number;
  signal?: AbortSignal;
  spawn?: typeof nodeSpawn;
}

export interface TracerouteResult {
  lines: TracerouteLine[];
  complete: boolean;
  error: string | null;
}

function command(target: string, platform: NodeJS.Platform, maxHops: number): [string, string[]] {
  const args = ['-n', '-q', '1', '-w', '1', '-m', String(maxHops), target];
  const v6 = target.includes(':');
  if (platform === 'darwin') return [v6 ? '/usr/sbin/traceroute6' : '/usr/sbin/traceroute', args];
  return ['traceroute', v6 ? ['-6', ...args] : args];
}

/**
 * Runs the system traceroute (UDP probes, no administrator rights needed) and reports each hop
 * as soon as its line arrives, so the globe can grow while the trace runs.
 */
export function runTraceroute(
  target: string,
  onHop: (hop: TracerouteLine) => void,
  options: TracerouteOptions,
): Promise<TracerouteResult> {
  const { platform, maxHops = 30, timeoutMs = 60_000, maxSilentRun = 5, signal } = options;
  const spawn = options.spawn ?? nodeSpawn;
  if (platform === 'win32') {
    return Promise.resolve({
      lines: [],
      complete: false,
      error: 'Windows의 경로 추적은 아직 지원하지 않습니다.',
    });
  }
  const [file, args] = command(target, platform, maxHops);

  return new Promise((resolve) => {
    const lines: TracerouteLine[] = [];
    let silentRun = 0;
    let settled = false;
    let error: string | null = null;
    const child = spawn(file, args, { env: { ...process.env, LC_ALL: 'C' } });

    const finish = (): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      if (!child.killed && child.exitCode === null) child.kill();
      resolve({ lines, complete: lines.some((l) => l.ip === target), error });
    };
    const abort = (): void => {
      error = '취소했습니다.';
      finish();
    };
    const timer = setTimeout(() => {
      error = lines.length === 0 ? '경로 추적이 시간 안에 끝나지 않았습니다.' : null;
      finish();
    }, timeoutMs);
    signal?.addEventListener('abort', abort);

    child.stdout.setEncoding('utf8');
    child.stdout.on(
      'data',
      lineSplitter((line) => {
        // Lines already buffered when the trace was stopped are not part of it.
        if (settled) return;
        const hop = parseTracerouteLine(line);
        if (!hop) return;
        lines.push(hop);
        onHop(hop);
        silentRun = hop.ip === null ? silentRun + 1 : 0;
        if (hop.ip === target || (silentRun >= maxSilentRun && lines.some((l) => l.ip !== null)))
          finish();
      }),
    );
    child.on('error', (err: NodeJS.ErrnoException) => {
      error =
        err.code === 'ENOENT'
          ? 'traceroute가 설치되어 있지 않습니다 (Linux: sudo apt install traceroute).'
          : `traceroute를 실행하지 못했습니다: ${err.message}`;
      finish();
    });
    child.on('close', finish);
  });
}
