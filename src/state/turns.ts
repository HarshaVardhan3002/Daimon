import type { Turn } from './AppState';

/** Update a turn in either the active conversation or an archived chat. */
export function updateTurnList(turns: Turn[], id: string, update: (turn: Turn) => Turn): Turn[] {
  let changed = false;
  const next = turns.map(turn => {
    if (turn.id !== id) return turn;
    changed = true;
    return update(turn);
  });
  return changed ? next : turns;
}

/** Interrupted requests must remain retryable after the app restores its state. */
export function normalizeRestoredTurn(turn: Turn): Turn {
  const liveProgress = turn.liveProgress ? {
    ...turn.liveProgress,
    blocks: Object.fromEntries(Object.entries(turn.liveProgress.blocks).map(([key, block]) => [key, block.quiz?.grading === 'pending'
      ? { ...block, quiz: { ...block.quiz, grading: 'error' as const, grade: undefined } }
      : block])),
  } : undefined;
  return { ...turn, status: turn.status === 'streaming' ? 'stopped' : turn.status, ...(liveProgress ? { liveProgress } : {}) };
}
