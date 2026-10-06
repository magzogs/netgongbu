import { Hono } from 'hono';
import type { AskErrorCode, ScenarioService } from '@magvirtualedu/ai';

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
  model: string;
}

/** HTTP face of the scenario service, for the web viewer (`/api`, proxied by Vite in dev). */
export function createApp({ scenarios, model }: AppDeps): Hono {
  const app = new Hono().basePath('/api');

  app.get('/health', (c) => c.json({ ok: true, ai: scenarios.ready, model }));

  app.get('/catalog', async (c) => c.json({ scenarios: await scenarios.catalog() }));

  app.get('/scenarios/:id', async (c) => {
    const scenario = await scenarios.scenario(c.req.param('id'));
    return scenario ? c.json(scenario) : c.json({ error: '시나리오를 찾을 수 없습니다.' }, 404);
  });

  app.post('/scenarios', async (c) => {
    const result = await scenarios.ask(await c.req.json().catch(() => null));
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

  return app;
}
