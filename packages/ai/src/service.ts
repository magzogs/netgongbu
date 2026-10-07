import Anthropic from '@anthropic-ai/sdk';
import { AiError } from '@magvirtualedu/llm/node';
import { z } from 'zod';
import type { Scenario, ValidationIssue } from '@magvirtualedu/schema';
import { generateScenario, GenerationError, type ScenarioModel } from './generate';
import { newScenarioId, type ScenarioStore, type StoredEntry } from './store';
import type { TopologyLibrary } from './topologies';

export type AskErrorCode =
  | 'bad-request'
  | 'not-found'
  | 'no-credentials'
  | 'refused'
  | 'truncated'
  | 'invalid'
  | 'rate-limited'
  | 'api-error';

export type AskResult =
  | { ok: true; entry: StoredEntry; scenario: Scenario; attempts: number }
  | { ok: false; code: AskErrorCode; error: string; issues: readonly ValidationIssue[] };

export interface ScenarioServiceDeps {
  topologies: TopologyLibrary;
  store: ScenarioStore;
  /** The model to ask, or null while no credentials are configured. */
  model: () => ScenarioModel | null;
  maxAttempts: number;
  maxQuestionLength: number;
  /** Shown when there is no model: what is missing, and where to set it. */
  noCredentialsMessage: string | (() => string);
  newId?: () => string;
  log?: (message: string) => void;
}

const fail = (
  code: AskErrorCode,
  error: string,
  issues: readonly ValidationIssue[] = [],
): AskResult => ({ ok: false, code, error, issues });

/** Maps a failed model call (Claude API, OpenAI API, a CLI) to a result the viewer can show. */
function modelFailure(err: unknown): AskResult | undefined {
  if (err instanceof AiError) {
    return fail(err.kind === 'auth' ? 'no-credentials' : 'api-error', err.message);
  }
  if (
    err instanceof Anthropic.AuthenticationError ||
    err instanceof Anthropic.PermissionDeniedError
  ) {
    return fail('no-credentials', 'API 키가 올바르지 않습니다.');
  }
  if (err instanceof Anthropic.RateLimitError) {
    return fail('rate-limited', '요청이 많습니다. 잠시 후 다시 시도해 주세요.');
  }
  if (err instanceof Anthropic.APIError) {
    return fail('api-error', `Claude API 오류 (${String(err.status)})`);
  }
  if (err instanceof Error) return fail('api-error', err.message);
  return undefined;
}

/**
 * Generated scenarios: ask the connected AI for one (validated and corrected), list and load them.
 * The HTTP server and the desktop app's IPC both call this.
 */
export class ScenarioService {
  private readonly newId: () => string;
  private readonly log: (message: string) => void;
  private readonly AskSchema: z.ZodType<{ topologyId: string; question: string }>;

  constructor(private readonly deps: ScenarioServiceDeps) {
    this.newId = deps.newId ?? (() => newScenarioId());
    this.log = deps.log ?? (() => undefined);
    this.AskSchema = z.object({
      topologyId: z.string(),
      question: z.string().trim().min(3).max(deps.maxQuestionLength),
    });
  }

  get ready(): boolean {
    return this.deps.model() !== null;
  }

  catalog(): Promise<StoredEntry[]> {
    return this.deps.store.list();
  }

  scenario(id: string): Promise<Scenario | undefined> {
    return this.deps.store.get(id);
  }

  async ask(input: unknown): Promise<AskResult> {
    const body = this.AskSchema.safeParse(input);
    if (!body.success) {
      return fail(
        'bad-request',
        `질문은 3자 이상 ${String(this.deps.maxQuestionLength)}자 이하로 입력해 주세요.`,
      );
    }
    const model = this.deps.model();
    if (!model) {
      const { noCredentialsMessage: why } = this.deps;
      return fail('no-credentials', typeof why === 'string' ? why : why());
    }
    const topology = await this.deps.topologies.get(body.data.topologyId);
    if (!topology) return fail('not-found', '토폴로지를 찾을 수 없습니다.');

    const started = Date.now();
    try {
      const result = await generateScenario({
        topology,
        example: await this.deps.topologies.exampleFor(topology.id),
        question: body.data.question,
        id: this.newId(),
        model,
        maxAttempts: this.deps.maxAttempts,
      });
      const entry = await this.deps.store.save(result.scenario, result.model);
      this.log(
        `generated ${entry.id} on ${topology.id} in ${String(Date.now() - started)} ms, ` +
          `${String(result.attempts)} attempt(s), ${result.model}`,
      );
      return { ok: true, entry, scenario: result.scenario, attempts: result.attempts };
    } catch (err) {
      if (err instanceof GenerationError) {
        this.log(`generation failed (${err.code}): ${err.message}`);
        return fail(err.code, err.message, err.issues);
      }
      const failure = modelFailure(err);
      if (failure) {
        this.log(`model error: ${err instanceof Error ? err.message : String(err)}`);
        return failure;
      }
      throw err;
    }
  }
}
