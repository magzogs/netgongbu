import { z } from 'zod';
import { CatalogEntrySchema, ScenarioSchema, type Scenario } from '@magvirtualedu/schema';

// Client for apps/server. In development Vite proxies /api to it (see vite.config.ts).

const API = `${import.meta.env.BASE_URL}api`;

export type AiStatus = 'checking' | 'offline' | 'no-key' | 'ready';

const HealthSchema = z.object({ ok: z.boolean(), ai: z.boolean() });

/** Whether the scenario server is reachable and can call Claude. */
export async function fetchAiStatus(): Promise<AiStatus> {
  try {
    const res = await fetch(`${API}/health`);
    if (!res.ok) return 'offline';
    const health = HealthSchema.safeParse(await res.json());
    if (!health.success) return 'offline';
    return health.data.ai ? 'ready' : 'no-key';
  } catch {
    return 'offline';
  }
}

export const AiEntrySchema = CatalogEntrySchema.extend({
  question: z.string(),
  createdAt: z.string(),
});
export type AiEntry = z.infer<typeof AiEntrySchema>;

/** Scenarios generated earlier; empty when the server is not running. */
export async function fetchAiCatalog(): Promise<AiEntry[]> {
  try {
    const res = await fetch(`${API}/catalog`);
    if (!res.ok) return [];
    const parsed = z.object({ scenarios: z.array(AiEntrySchema) }).safeParse(await res.json());
    return parsed.success ? parsed.data.scenarios : [];
  } catch {
    return [];
  }
}

export async function fetchAiScenario(id: string): Promise<unknown> {
  const res = await fetch(`${API}/scenarios/${encodeURIComponent(id)}`);
  if (!res.ok) throw new Error(`AI 시나리오를 불러오지 못했습니다 (HTTP ${String(res.status)}).`);
  return res.json();
}

const IssueSchema = z.object({ where: z.string(), message: z.string() });
const ErrorBodySchema = z.object({
  error: z.string(),
  code: z.string().optional(),
  issues: z.array(IssueSchema).optional(),
});

export class AskError extends Error {
  constructor(
    message: string,
    readonly issues: readonly z.infer<typeof IssueSchema>[] = [],
  ) {
    super(message);
    this.name = 'AskError';
  }
}

const AskResponseSchema = z.object({ entry: AiEntrySchema, scenario: ScenarioSchema });

/** Asks the server to generate a scenario that answers `question` on the given topology. */
export async function askScenario(
  topologyId: string,
  question: string,
): Promise<{ entry: AiEntry; scenario: Scenario }> {
  let res: Response;
  try {
    res = await fetch(`${API}/scenarios`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ topologyId, question }),
    });
  } catch {
    throw new AskError('AI 서버에 연결하지 못했습니다.');
  }
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const error = ErrorBodySchema.safeParse(body);
    throw error.success
      ? new AskError(error.data.error, error.data.issues)
      : new AskError(`AI 서버 오류 (HTTP ${String(res.status)})`);
  }
  return AskResponseSchema.parse(body);
}
