import type Anthropic from '@anthropic-ai/sdk';
import {
  draftToScenario,
  ScenarioDraftSchema,
  ScenarioSchema,
  validateScenario,
  type DraftMeta,
  type Scenario,
  type Topology,
  type ValidationIssue,
  tr,
} from '@netgongbu/schema';
import type { ZodError } from 'zod';
import { correctionMessage, questionMessage, systemPrompt } from './prompt';

export interface ModelReply {
  content: Anthropic.Beta.BetaContentBlock[];
  stopReason: Anthropic.Beta.BetaStopReason | null;
  /** Model that wrote the answer (differs from the requested one after a fallback). */
  model: string;
}

/** One call to the language model; the Claude implementation lives in claude.ts. */
export interface ScenarioModel {
  reply: (
    system: Anthropic.Beta.BetaTextBlockParam[],
    messages: Anthropic.Beta.BetaMessageParam[],
  ) => Promise<ModelReply>;
}

export type GenerationErrorCode = 'refused' | 'truncated' | 'invalid';

export class GenerationError extends Error {
  constructor(
    message: string,
    readonly code: GenerationErrorCode,
    readonly issues: readonly ValidationIssue[] = [],
  ) {
    super(message);
    this.name = 'GenerationError';
  }
}

export interface GenerateRequest {
  topology: Topology;
  example: Scenario | undefined;
  question: string;
  id: string;
  model: ScenarioModel;
  maxAttempts: number;
}

export interface GenerateResult {
  scenario: Scenario;
  /** 1 when the first answer was playable. */
  attempts: number;
  model: string;
}

type Checked = { scenario: Scenario } | { problems: readonly ValidationIssue[] | string };

function zodIssues(error: ZodError): ValidationIssue[] {
  return error.issues.map((i) => ({
    where: i.path.length > 0 ? i.path.join('.') : 'scenario',
    message: i.message,
  }));
}

function answerText(content: readonly Anthropic.Beta.BetaContentBlock[]): string {
  return content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('');
}

/** Parses an answer and checks that the viewer can play it on this topology. */
export function checkAnswer(
  content: readonly Anthropic.Beta.BetaContentBlock[],
  topology: Topology,
  meta: DraftMeta,
): Checked {
  let json: unknown;
  try {
    json = JSON.parse(answerText(content));
  } catch {
    return { problems: 'The answer was not valid JSON in the scenario format.' };
  }
  const draft = ScenarioDraftSchema.safeParse(json);
  if (!draft.success) return { problems: zodIssues(draft.error) };
  if (draft.data.beats.length === 0) return { problems: 'The scenario has no beats.' };

  const parsed = ScenarioSchema.safeParse(draftToScenario(draft.data, meta));
  if (!parsed.success) return { problems: zodIssues(parsed.error) };
  const issues = validateScenario(topology, parsed.data);
  return issues.length > 0 ? { problems: issues } : { scenario: parsed.data };
}

/**
 * Asks the model for a scenario and, while the answer cannot be played, sends the problems back
 * and asks again (append-only conversation, up to maxAttempts answers).
 */
export async function generateScenario(req: GenerateRequest): Promise<GenerateResult> {
  const system = systemPrompt(req.topology, req.example);
  const meta: DraftMeta = { id: req.id, topologyId: req.topology.id, question: req.question };
  const messages: Anthropic.Beta.BetaMessageParam[] = [
    { role: 'user', content: questionMessage(req.question) },
  ];
  let lastProblems: readonly ValidationIssue[] = [];

  for (let attempt = 1; attempt <= req.maxAttempts; attempt++) {
    const reply = await req.model.reply(system, messages);
    if (reply.stopReason === 'refusal') {
      throw new GenerationError(
        tr('AI가 이 질문에 대한 답변을 거절했습니다.', 'The AI declined to answer this question.'),
        'refused',
      );
    }
    if (reply.stopReason === 'max_tokens') {
      throw new GenerationError(
        tr(
          '답변이 너무 길어서 중간에 끊겼습니다. 질문 범위를 좁혀 주세요.',
          'The answer was too long and got cut off. Try a narrower question.',
        ),
        'truncated',
      );
    }
    const checked = checkAnswer(reply.content, req.topology, meta);
    if ('scenario' in checked)
      return { scenario: checked.scenario, attempts: attempt, model: reply.model };

    lastProblems =
      typeof checked.problems === 'string'
        ? [{ where: 'scenario', message: checked.problems }]
        : checked.problems;
    messages.push(
      { role: 'assistant', content: reply.content },
      { role: 'user', content: correctionMessage(checked.problems) },
    );
  }
  throw new GenerationError(
    tr(
      `AI가 ${req.maxAttempts}번 시도했지만 재생할 수 있는 시나리오를 만들지 못했습니다.`,
      `The AI tried ${req.maxAttempts} times but could not produce a playable scenario.`,
    ),
    'invalid',
    lastProblems,
  );
}
