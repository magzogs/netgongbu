/** A failed call, with a message the viewer can show as is. */
export class AiError extends Error {
  constructor(
    message: string,
    /** connect: not reachable; auth: credentials refused; http: any other error answer. */
    readonly kind: 'connect' | 'auth' | 'http' | 'format' | 'refused' = 'http',
  ) {
    super(message);
    this.name = 'AiError';
  }
}

export type Fetch = typeof fetch;

/** The message inside an OpenAI-style error body ({"error": {"message": …}} or {"error": "…"}). */
function errorDetail(body: string): string {
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string } | string; message?: string };
    if (typeof parsed.error === 'string') return parsed.error;
    return parsed.error?.message ?? parsed.message ?? body.slice(0, 300);
  } catch {
    return body.slice(0, 300);
  }
}

/** fetch that turns network failures and error answers into AiError. */
export async function request(
  url: string,
  init: RequestInit,
  what: string,
  fetchImpl: Fetch = fetch,
): Promise<Response> {
  let res: Response;
  try {
    res = await fetchImpl(url, init);
  } catch (err) {
    if (err instanceof Error && (err.name === 'AbortError' || err.name === 'TimeoutError'))
      throw err;
    throw new AiError(`${what}에 연결하지 못했습니다.`, 'connect');
  }
  if (!res.ok) {
    const detail = errorDetail(await res.text().catch(() => ''));
    const kind = res.status === 401 || res.status === 403 ? 'auth' : 'http';
    throw new AiError(
      `${what} 오류 (HTTP ${String(res.status)})${detail ? `: ${detail}` : ''}`,
      kind,
    );
  }
  return res;
}

/** Lines of a stream as they arrive (a line may come split over several chunks). */
export async function* lines(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let newline = buffer.indexOf('\n');
      while (newline >= 0) {
        yield buffer.slice(0, newline).replace(/\r$/, '');
        buffer = buffer.slice(newline + 1);
        newline = buffer.indexOf('\n');
      }
    }
    buffer += decoder.decode();
    if (buffer) yield buffer;
  } finally {
    reader.releaseLock();
  }
}

/** The JSON payloads of a server-sent event stream; stops at `data: [DONE]`. */
export async function* sseJson(body: ReadableStream<Uint8Array>): AsyncGenerator {
  for await (const line of lines(body)) {
    if (!line.startsWith('data:')) continue;
    const data = line.slice(5).trim();
    if (data === '[DONE]') return;
    try {
      yield JSON.parse(data) as unknown;
    } catch {
      // A keep-alive or a line we do not understand.
    }
  }
}

/** A data: URL split into its media type and base64 payload. */
export function parseDataUrl(url: string): { mediaType: string; data: string } | null {
  const match = /^data:([^;,]+);base64,(.*)$/s.exec(url);
  return match?.[1] && match[2] ? { mediaType: match[1], data: match[2] } : null;
}
