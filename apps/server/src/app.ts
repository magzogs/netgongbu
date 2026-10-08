import { Hono, type Context } from 'hono';
import { streamSSE } from 'hono/streaming';
import { z } from 'zod';
import type { AskErrorCode, ScenarioService } from '@netgongbu/ai';
import {
  ApiKeyInputSchema,
  CLI_PROVIDERS,
  ChatRequestSchema,
  PROVIDER_IDS,
  PrefsChangeSchema,
  type ChatEvent,
} from '@netgongbu/llm';
import type { AiHub } from '@netgongbu/llm/node';
import { isLocale, setLocale } from '@netgongbu/schema';

const STATUS: Record<AskErrorCode, 400 | 404 | 422 | 429 | 502 | 503> = {
  'bad-request': 400,
  'not-found': 404,
  'no-credentials': 503,
  refused: 422,
  truncated: 422,
  invalid: 422,
  'rate-limited': 429,
  'api-error': 502,
};

export interface AppDeps {
  scenarios: ScenarioService;
  /** The AI connection (sign-in, keys, models, questions); without it /api/ai is absent. */
  hub?: AiHub;
}

const LOCAL_HOST = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;
const ProviderSchema = z.enum(PROVIDER_IDS);
const CliProviderSchema = z.object({ provider: z.enum(CLI_PROVIDERS) });

const message = (err: unknown): string => (err instanceof Error ? err.message : String(err));

async function body(c: Context): Promise<unknown> {
  return c.req.json().catch(() => null);
}

/** HTTP face of the scenario service and the AI connection, for the web viewer. */
export function createApp({ scenarios, hub }: AppDeps): Hono {
  const app = new Hono().basePath('/api');

  // The server signs in to the learner's accounts and runs their CLIs: it answers only this
  // computer (by name, against DNS rebinding) and never another site's page in the browser.
  app.use('*', async (c, next) => {
    if (!LOCAL_HOST.test(new URL(c.req.url).host)) return c.json({ error: 'Forbidden' }, 403);
    const site = c.req.header('sec-fetch-site');
    if (site === 'cross-site' || site === 'same-site') return c.json({ error: 'Forbidden' }, 403);
    if (c.req.method !== 'GET' && !c.req.header('content-type')?.startsWith('application/json'))
      return c.json({ error: 'JSON only' }, 415);
    // The viewer's language, for messages and the AI's answers (one learner per server).
    const locale = c.req.header('x-netgongbu-locale');
    if (isLocale(locale)) setLocale(locale);
    await next();
  });

  app.get('/health', (c) => c.json({ ok: true, ai: scenarios.ready }));

  app.get('/catalog', async (c) => c.json({ scenarios: await scenarios.catalog() }));

  app.get('/scenarios/:id', async (c) => {
    const scenario = await scenarios.scenario(c.req.param('id'));
    return scenario ? c.json(scenario) : c.json({ error: '시나리오를 찾을 수 없습니다.' }, 404);
  });

  app.post('/scenarios', async (c) => {
    const result = await scenarios.ask(await body(c));
    if (!result.ok) {
      return c.json(
        { code: result.code, error: result.error, issues: result.issues },
        STATUS[result.code],
      );
    }
    return c.json(
      { entry: result.entry, scenario: result.scenario, attempts: result.attempts },
      201,
    );
  });

  if (hub) addAiRoutes(app, hub);
  return app;
}

function addAiRoutes(app: Hono, hub: AiHub): void {
  const invalid = (c: Context, err: unknown) => c.json({ error: message(err) }, 400);

  app.get('/ai/status', async (c) =>
    c.json(c.req.query('refresh') === '1' ? await hub.refresh() : hub.status()),
  );

  app.post('/ai/change', async (c) => {
    const change = PrefsChangeSchema.safeParse(await body(c));
    if (!change.success) return invalid(c, '설정 값이 올바르지 않습니다.');
    try {
      return c.json(await hub.change(change.data));
    } catch (err) {
      return invalid(c, err);
    }
  });

  app.post('/ai/key', async (c) => {
    const input = ApiKeyInputSchema.safeParse(await body(c));
    if (!input.success) return invalid(c, 'API 키 형식이 올바르지 않습니다.');
    return c.json(hub.setKey(input.data.provider, input.data.key));
  });

  app.get('/ai/models', async (c) => {
    const provider = ProviderSchema.safeParse(c.req.query('provider'));
    if (!provider.success) return invalid(c, '알 수 없는 AI입니다.');
    return c.json(await hub.models(provider.data, c.req.query('refresh') === '1'));
  });

  app.post('/ai/sign-in', async (c) => {
    const input = CliProviderSchema.safeParse(await body(c));
    if (!input.success) return invalid(c, '알 수 없는 AI입니다.');
    return c.json(await hub.signIn(input.data.provider));
  });

  app.post('/ai/sign-in/stop', (c) => c.json(hub.stopSignIn()));

  app.post('/ai/sign-out', async (c) => {
    const input = CliProviderSchema.safeParse(await body(c));
    if (!input.success) return invalid(c, '알 수 없는 AI입니다.');
    try {
      return c.json(await hub.signOut(input.data.provider));
    } catch (err) {
      return invalid(c, err);
    }
  });

  // The answer as server-sent events (ChatEvent); closing the request stops it.
  app.post('/ai/chat', async (c) => {
    const request = ChatRequestSchema.safeParse(await body(c));
    if (!request.success) return invalid(c, '질문 형식이 올바르지 않습니다.');
    const { id, messages } = request.data;
    return streamSSE(c, async (stream) => {
      const controller = new AbortController();
      stream.onAbort(() => {
        controller.abort();
      });
      // Pieces are written in order, one after another.
      let writing = Promise.resolve();
      const emit = (event: ChatEvent): void => {
        writing = writing.then(() => stream.writeSSE({ data: JSON.stringify(event) }));
      };
      try {
        const { model } = await hub.chat(
          messages,
          (text) => {
            emit({ id, type: 'delta', text });
          },
          controller.signal,
        );
        emit({ id, type: 'done', model });
      } catch (err) {
        emit(
          controller.signal.aborted
            ? { id, type: 'done', model: null }
            : { id, type: 'error', message: message(err) },
        );
      }
      await writing;
    });
  });
}
