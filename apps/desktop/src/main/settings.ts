import { safeStorage } from 'electron';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { AiPrefsSchema, type AiPrefs, type ProviderId } from '@netgongbu/llm';
import type { PrefsStore, SecretStore } from '@netgongbu/llm/node';

interface SettingsFile {
  /** API keys encrypted with the OS keychain (safeStorage), base64, per provider. */
  apiKeys?: Partial<Record<ProviderId, string>>;
  /** Before ChatGPT: the Anthropic key alone (read once, then moved to apiKeys). */
  apiKey?: string;
  /** Which AI questions go to, how, with which model and effort. */
  ai?: unknown;
}

/** Keys from the environment, used when none is saved. */
const ENV_KEYS: Partial<Record<ProviderId, string>> = {
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
};

/**
 * The app's own settings. API keys are stored only encrypted by the OS keychain; when the
 * keychain is unavailable the app refuses to save them rather than keep them in plain text.
 */
export class SettingsStore {
  constructor(private readonly file: string) {}

  private read(): SettingsFile {
    try {
      return JSON.parse(readFileSync(this.file, 'utf8')) as SettingsFile;
    } catch {
      return {};
    }
  }

  private write(settings: SettingsFile): void {
    mkdirSync(dirname(this.file), { recursive: true });
    writeFileSync(this.file, JSON.stringify(settings, null, 2), { mode: 0o600 });
  }

  get canSaveKey(): boolean {
    return safeStorage.isEncryptionAvailable();
  }

  private savedKey(provider: ProviderId): string | null {
    const settings = this.read();
    const saved =
      settings.apiKeys?.[provider] ?? (provider === 'anthropic' ? settings.apiKey : undefined);
    if (!saved || !this.canSaveKey) return null;
    try {
      return safeStorage.decryptString(Buffer.from(saved, 'base64'));
    } catch {
      // Encrypted by another keychain (e.g. copied settings): ignore it.
      return null;
    }
  }

  /** API keys: the saved one first, else the provider's environment variable. */
  secrets(): SecretStore {
    return {
      kind: this.canSaveKey ? 'keychain' : 'unavailable',
      get: (provider) => {
        const saved = this.savedKey(provider);
        if (saved) return { key: saved, source: 'saved' };
        const name = ENV_KEYS[provider];
        const env = name ? process.env[name] : undefined;
        return env ? { key: env, source: 'environment' } : null;
      },
      set: (provider, key) => {
        const settings = this.read();
        const { apiKey: legacy, ...rest } = settings;
        const keys: Partial<Record<ProviderId, string>> = {
          ...(legacy && { anthropic: legacy }),
          ...settings.apiKeys,
        };
        if (key !== null && !this.canSaveKey)
          throw new Error('이 컴퓨터에서는 키를 암호화해 저장할 수 없습니다.');
        const others = Object.entries(keys).filter(([name]) => name !== provider);
        const apiKeys = Object.fromEntries(
          key === null
            ? others
            : [...others, [provider, safeStorage.encryptString(key).toString('base64')]],
        );
        this.write({ ...rest, apiKeys });
      },
    };
  }

  /** The AI connection choice (no secrets in it). */
  prefs(): PrefsStore {
    return {
      read: (): AiPrefs | null => {
        const parsed = AiPrefsSchema.safeParse(this.read().ai);
        return parsed.success ? parsed.data : null;
      },
      write: (prefs) => {
        this.write({ ...this.read(), ai: prefs });
      },
    };
  }
}
