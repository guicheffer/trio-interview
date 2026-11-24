export interface ModelOption {
  key: string;
  label: string;
  id: string;
  group: 'Claude';
  badge: string;
  color: string;
  /** Context window in tokens, used for the usage ring in the chat */
  contextWindow: number;
}

export const MODELS = [
  { key: 'opus', label: 'Opus 5.5 (latest)', id: 'claude-opus-5-5', group: 'Claude', badge: 'O', color: 'bg-green-500', contextWindow: 1000000 },
  { key: 'sonnet', label: 'Sonnet 5.5 (latest)', id: 'claude-sonnet-5-5', group: 'Claude', badge: 'S', color: 'bg-purple-500', contextWindow: 1000000 },
  { key: 'haiku', label: 'Haiku 4.5 (fastest)', id: 'claude-haiku-4-5', group: 'Claude', badge: 'H', color: 'bg-blue-500', contextWindow: 200000 },
] as const satisfies readonly ModelOption[];

export type ModelKey = (typeof MODELS)[number]['key'];

export const MODEL_KEYS = MODELS.map(m => m.key) as [ModelKey, ...ModelKey[]];
export const DEFAULT_MODEL: ModelKey = 'sonnet'
export const PLAN_MODEL: ModelKey = 'opus';

export function getModelOption(key: string): ModelOption {
  return MODELS.find(m => m.key === key) ?? MODELS[0];
}

/** What a conversation is meant to be able to use in total, across every context window it goes through */
export const CONVERSATION_TOKEN_BUDGET = 20_000_000;

/** Share of a model's context window at which the conversation is summarized before the next message */
export const AUTO_COMPACT_AT = 0.7;

export function needsCompaction(contextTokens: number | null | undefined, contextWindow: number): boolean {
  return !!contextTokens && contextTokens >= contextWindow * AUTO_COMPACT_AT;
}
