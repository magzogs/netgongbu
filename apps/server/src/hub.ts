import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { exec } from 'node:child_process';
import { AiPrefsSchema, type AiPrefs, type ProviderId } from '@netgongbu/llm';
import { AiHub, type PrefsStore, type SecretStore } from '@netgongbu/llm/node';
import type { ServerConfig } from './config';

const ENV_KEYS: Partial<Record<ProviderId, string>> = {
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
};

/**
 * API keys typed into the web viewer stay in this process's memory only (the server has no
 * keychain); ANTHROPIC_API_KEY and OPENAI_API_KEY are used when none is typed.
 */
export function memorySecrets(env: NodeJS.ProcessEnv = process.env): SecretStore {
  const keys = new Map<ProviderId, string>();
  return {
    kind: 'memory',
    get: (provider) => {
      const typed = keys.get(provider);
      if (typed) return { key: typed, source: 'saved' };
      const name = ENV_KEYS[provider];
      const key = name ? env[name] : undefined;
      return key ? { key, source: 'environment' } : null;
    },
    set: (provider, key) => {
      if (key) keys.set(provider, key);
      else keys.delete(provider);
    },
  };
}

/** The connection choice (no secrets) as a JSON file next to the stored scenarios. */
export function filePrefs(file: string): PrefsStore {
  return {
    read: (): AiPrefs | null => {
      try {
        const parsed = AiPrefsSchema.safeParse(JSON.parse(readFileSync(file, 'utf8')));
        return parsed.success ? parsed.data : null;
      } catch {
        return null;
      }
    },
    write: (prefs) => {
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, JSON.stringify(prefs, null, 2));
    },
  };
}

/** Opens a sign-in page in this computer's browser (the server runs where the learner is). */
function openInBrowser(url: string): void {
  if (!/^https:\/\/[^\s"'`$\\]+$/.test(url)) return;
  const command =
    process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start ""' : 'xdg-open';
  exec(`${command} "${url}"`);
}

export function createHub(config: ServerConfig, log: (message: string) => void): AiHub {
  const secrets = memorySecrets();
  return new AiHub({
    prefs: filePrefs(config.aiPrefsFile),
    secrets,
    workDir: config.aiWorkDir,
    log,
    openExternal: openInBrowser,
    ...(secrets.get('anthropic') && {
      defaults: {
        provider: 'anthropic',
        providers: { anthropic: { method: 'api', model: config.model, effort: config.effort } },
      },
    }),
  });
}
