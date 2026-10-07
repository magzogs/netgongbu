import type { ChatMessage, ModelOption } from '../types';

/** One turn of a conversation, in plain text with optional pictures (data: URLs). */
export interface Turn {
  role: 'user' | 'assistant';
  text: string;
  images?: string[];
}

export interface Ask {
  /** Empty: the provider's default model. */
  model: string;
  effort: string | null;
  system: string;
  /** The conversation; the last turn is the learner's. */
  turns: Turn[];
  /** JSON Schema the answer must follow (scenario generation). */
  schema?: Record<string, unknown>;
  signal?: AbortSignal;
  /** Each piece of the answer as it is written. */
  onText?: (text: string) => void;
}

export interface Answer {
  text: string;
  stop: 'end' | 'max_tokens' | 'refusal';
  /** The model that answered, when the provider says. */
  model: string | null;
}

/** One way of reaching a model: an API, a CLI. */
export interface Provider {
  models: (signal?: AbortSignal) => Promise<ModelOption[]>;
  ask: (ask: Ask) => Promise<Answer>;
}

/** The viewer's chat messages (system first, parts with pictures) as a system prompt and turns. */
export function toTurns(messages: readonly ChatMessage[]): { system: string; turns: Turn[] } {
  const system: string[] = [];
  const turns: Turn[] = [];
  for (const m of messages) {
    const parts = typeof m.content === 'string' ? [{ type: 'text', text: m.content }] : m.content;
    const text = parts
      .flatMap((p) => (p.type === 'text' && 'text' in p ? [p.text] : []))
      .join('\n');
    if (m.role === 'system') {
      system.push(text);
      continue;
    }
    const images = parts.flatMap((p) =>
      p.type === 'image_url' && 'image_url' in p ? [p.image_url.url] : [],
    );
    turns.push({ role: m.role, text, ...(images.length > 0 && { images }) });
  }
  return { system: system.join('\n\n'), turns };
}

/**
 * The conversation as one prompt, for CLIs that take a single message per run: earlier turns are
 * written out as a transcript before the new question.
 */
export function asOnePrompt(turns: readonly Turn[]): { text: string; images: string[] } {
  const last = turns.at(-1);
  if (!last) return { text: '', images: [] };
  const earlier = turns.slice(0, -1);
  const images = last.images ?? [];
  if (earlier.length === 0) return { text: last.text, images };
  const transcript = earlier.map((t) => `<${t.role}>\n${t.text}\n</${t.role}>`).join('\n\n');
  return {
    text: `<conversation_so_far>\n${transcript}\n</conversation_so_far>\n\n${last.text}`,
    images,
  };
}
