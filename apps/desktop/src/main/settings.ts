import { safeStorage } from 'electron';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

interface SettingsFile {
  /** Anthropic API key encrypted with the OS keychain (safeStorage), base64. */
  apiKey?: string;
}

export interface ApiKey {
  key: string;
  source: 'saved' | 'environment';
}

/**
 * The app's own settings. The API key is stored only encrypted by the OS keychain; when the
 * keychain is unavailable the app refuses to save it rather than keep it in plain text.
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

  /** The saved key first, else ANTHROPIC_API_KEY from the environment. */
  apiKey(): ApiKey | null {
    const saved = this.read().apiKey;
    if (saved && this.canSaveKey) {
      try {
        return { key: safeStorage.decryptString(Buffer.from(saved, 'base64')), source: 'saved' };
      } catch {
        // Encrypted by another keychain (e.g. copied settings): ignore it.
      }
    }
    const env = process.env.ANTHROPIC_API_KEY;
    return env ? { key: env, source: 'environment' } : null;
  }

  setApiKey(key: string | null): void {
    const settings = this.read();
    if (key === null) {
      delete settings.apiKey;
    } else {
      if (!this.canSaveKey) throw new Error('이 컴퓨터에서는 키를 암호화해 저장할 수 없습니다.');
      settings.apiKey = safeStorage.encryptString(key).toString('base64');
    }
    this.write(settings);
  }
}
