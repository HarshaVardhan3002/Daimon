export type ReasoningMode = 'default' | 'instant' | 'medium' | 'high';
export type ReasoningEffort = 'low' | 'medium' | 'high';

export function reasoningEffortForMode(mode: ReasoningMode): ReasoningEffort | undefined {
  if (mode === 'instant') return 'low';
  if (mode === 'medium' || mode === 'high') return mode;
  return undefined;
}

export function isReasoningMode(value: unknown): value is ReasoningMode {
  return value === 'default' || value === 'instant' || value === 'medium' || value === 'high';
}
