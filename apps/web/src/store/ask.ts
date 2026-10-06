import type { StateCreator } from 'zustand';
import type { ValidationIssue } from '@magvirtualedu/schema';
import { AskError, type AiStatus } from '../data/aiApi';
import { backend } from '../data/backend';
import type { ViewerState } from './viewer';

export type AskState =
  | { kind: 'idle' }
  | { kind: 'pending'; question: string; startedAt: number }
  | { kind: 'error'; question: string; message: string; issues: readonly ValidationIssue[] };

export interface AskSlice {
  aiStatus: AiStatus;
  ask: AskState;
  askOpen: boolean;
  checkAi: () => Promise<void>;
  setAskOpen: (open: boolean) => void;
  /** Generates a scenario for `question` on the current topology and opens it. */
  submitQuestion: (question: string) => Promise<void>;
}

export const createAskSlice: StateCreator<ViewerState, [], [], AskSlice> = (set, get) => ({
  aiStatus: 'checking',
  ask: { kind: 'idle' },
  askOpen: false,

  async checkAi() {
    set({ aiStatus: await backend.aiStatus() });
  },

  setAskOpen(askOpen) {
    set({ askOpen });
  },

  async submitQuestion(question) {
    const topologyId = get().world?.topology.id;
    if (!topologyId || get().ask.kind === 'pending') return;
    set({ ask: { kind: 'pending', question, startedAt: Date.now() } });
    try {
      const { entry } = await backend.ask(topologyId, question);
      set((s) => ({
        catalog: [{ ...entry, source: 'ai' as const }, ...s.catalog],
        ask: { kind: 'idle' },
        askOpen: false,
      }));
      await get().open(entry.id);
    } catch (err) {
      set({
        ask: {
          kind: 'error',
          question,
          message: err instanceof Error ? err.message : String(err),
          issues: err instanceof AskError ? err.issues : [],
        },
      });
    }
  },
});
