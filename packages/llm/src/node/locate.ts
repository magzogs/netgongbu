import { constants } from 'node:fs';
import { access, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, delimiter, isAbsolute, join } from 'node:path';
import { PROVIDERS, type CliProvider } from '../types';
import { cliEnv, runCli } from './process';

/*
 * Where the official CLIs usually are. An app started from the Dock or Finder gets a short PATH
 * (/usr/bin:/bin…), so the usual install folders are searched too, then the login shell's PATH.
 */

function commandOf(provider: CliProvider): string {
  return PROVIDERS[provider].cli?.command ?? provider;
}

/** File names the CLI may have on this platform. */
function names(provider: CliProvider): string[] {
  const command = commandOf(provider);
  return process.platform === 'win32' ? [`${command}.exe`, `${command}.cmd`, command] : [command];
}

/** A CLI path the learner typed must name the right program (not any executable). */
export function isCliPathFor(provider: CliProvider, path: string): boolean {
  return isAbsolute(path) && names(provider).includes(basename(path).toLowerCase());
}

function knownDirs(provider: CliProvider): string[] {
  const home = homedir();
  const common = [
    join(home, '.local', 'bin'),
    '/opt/homebrew/bin',
    '/usr/local/bin',
    join(home, '.npm-global', 'bin'),
    join(home, '.bun', 'bin'),
    join(home, '.volta', 'bin'),
    join(home, 'bin'),
  ];
  if (process.platform === 'win32' && process.env.APPDATA)
    common.push(join(process.env.APPDATA, 'npm'));
  if (provider === 'anthropic') common.unshift(join(home, '.claude', 'local'));
  return common;
}

/** CLIs that come inside desktop apps (macOS). */
function bundled(provider: CliProvider): string[] {
  if (process.platform !== 'darwin' || provider !== 'openai') return [];
  return [
    '/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex',
    '/Applications/Codex.app/Contents/Resources/codex',
    join(homedir(), 'Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex'),
  ];
}

async function executable(path: string): Promise<boolean> {
  try {
    if (!(await stat(path)).isFile()) return false;
    if (process.platform !== 'win32') await access(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/** `command -v` in the learner's login shell, which sees the PATH their terminal has. */
async function fromLoginShell(command: string): Promise<string | null> {
  if (process.platform === 'win32') return null;
  const shell = process.env.SHELL ?? '/bin/zsh';
  try {
    const { code, stdout } = await runCli(shell, ['-lc', `command -v ${command}`], {
      timeoutMs: 5000,
    });
    const found = stdout.trim().split('\n').at(-1) ?? '';
    return code === 0 && isAbsolute(found) && (await executable(found)) ? found : null;
  } catch {
    return null;
  }
}

/** The CLI's path, or null when it is not installed (or not where we can find it). */
export async function findCli(
  provider: CliProvider,
  env: NodeJS.ProcessEnv = process.env,
): Promise<string | null> {
  const pathDirs = (env.PATH ?? '').split(delimiter).filter(Boolean);
  const dirs = [...new Set([...pathDirs, ...knownDirs(provider)])];
  for (const dir of dirs) {
    for (const name of names(provider)) {
      const candidate = join(dir, name);
      if (await executable(candidate)) return candidate;
    }
  }
  for (const candidate of bundled(provider)) {
    if (await executable(candidate)) return candidate;
  }
  return fromLoginShell(commandOf(provider));
}

/** `<cli> --version`, e.g. "2.1.282 (Claude Code)" or "codex-cli 0.160.0". */
export async function cliVersion(path: string): Promise<string> {
  if (!(await executable(path))) throw new Error(`실행할 수 없는 파일입니다: ${path}`);
  const { code, stdout, stderr } = await runCli(path, ['--version'], {
    env: cliEnv(),
    timeoutMs: 15_000,
  });
  const version = stdout.trim().split('\n')[0] ?? '';
  if (code !== 0 || !version) throw new Error(stderr.trim() || `${path} --version 실패`);
  return version;
}
