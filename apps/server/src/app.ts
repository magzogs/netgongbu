import Anthropic from '@anthropic-ai/sdk';
import { Hono, type Context } from 'hono';
import { z } from 'zod';
import type { ServerConfig } from './config';
import { generateScenario, GenerationError, type ScenarioModel } from './generate';
import { newScenarioId, type ScenarioStore } from './store';
import type { TopologyLibrary } from './topologies';

export interface AppDeps {
  topologies: TopologyLibrary;
  store: ScenarioStore;
  /** null when the server has no Anthropic credentials. */
  model: ScenarioModel | null;
  config: Pick<ServerConfig, 'model' | 'maxAttempts' | 'maxQuestionLength'>;
  newId?: () => string;
  log?: (message: string) => void;
}

function apiError(c: Context, status: 400 | 404 | 422 | 429 | 502 | 503, body: object): Response {
  return c.json(body, status);
}

/** Maps a failed Claude call to a response the viewer can show. */
function claudeFailure(c: Context, err: unknown): Response | undefined {
  if (
    err instanceof Anthropic.AuthenticationError ||
    err instanceof Anthropic.PermissionDeniedError
  ) {
    return apiError(c, 503, {
      code: 'no-credentials',
      error: 'AI 서버의 API 키가 올바르지 않습니다.',
    });
  }
  if (err instanceof Anthropic.RateLimitError) {
    return apiError(c, 429, {
      code: 'rate-limited',
      error: '요청이 많습니다. 잠시 후 다시 시도해 주세요.',
    });
  }
  if (err instanceof Anthropic.APIError) {
    return apiError(c, 502, {
      code: 'api-error',
      error: `Claude API 오류 (${String(err.status)})`,
    });
  }
  return undefined;
}

export function createApp(deps: AppDeps): Hono {
  const { topologies, store, model, config } = deps;
  const newId = deps.newId ?? (() => newScenarioId());
  const log = deps.log ?? (() => undefined);
  const AskSchema = z.object({
    topologyId: z.string(),
    question: z.string().trim().min(3).max(config.maxQuestionLength),
  });

  const app = new Hono().basePath('/api');

  app.get('/health', (c) => c.json({ ok: true, ai: model !== null, model: config.model }));

  app.get('/catalog', async (c) => c.json({ scenarios: await store.list() }));

  app.get('/scenarios/:id', async (c) => {
    const scenario = await store.get(c.req.param('id'));
    return scenario
      ? c.json(scenario)
      : apiError(c, 404, { error: '시나리오를 찾을 수 없습니다.' });
  });

  app.post('/scenarios', async (c) => {
    const body = AskSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) {
      return apiError(c, 400, {
        code: 'bad-request',
        error: `질문은 3자 이상 ${String(config.maxQuestionLength)}자 이하로 입력해 주세요.`,
      });
    }
    if (!model) {
      return apiError(c, 503, {
        code: 'no-credentials',
        error: 'AI 서버에 ANTHROPIC_API_KEY가 설정되어 있지 않습니다.',
      });
    }
    const topology = await topologies.get(body.data.topologyId);
    if (!topology) return apiError(c, 404, { error: '토폴로지를 찾을 수 없습니다.' });

    const started = Date.now();
    try {
      const result = await generateScenario({
        topology,
        example: await topologies.exampleFor(topology.id),
        question: body.data.question,
        id: newId(),
        model,
        maxAttempts: config.maxAttempts,
      });
      const entry = await store.save(result.scenario, result.model);
      log(
        `generated ${entry.id} on ${topology.id} in ${String(Date.now() - started)} ms, ` +
          `${String(result.attempts)} attempt(s), ${result.model}`,
      );
      return c.json({ entry, scenario: result.scenario, attempts: result.attempts }, 201);
    } catch (err) {
      if (err instanceof GenerationError) {
        log(`generation failed (${err.code}): ${err.message}`);
        return apiError(c, 422, { code: err.code, error: err.message, issues: err.issues });
      }
      const failure = claudeFailure(c, err);
      if (failure) {
        log(`Claude API error: ${err instanceof Error ? err.message : String(err)}`);
        return failure;
      }
      throw err;
    }
  });

  return app;
}
