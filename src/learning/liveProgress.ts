import type { LiveModelActivity } from '../liveModel/types';

export type LiveQuizGradeSnapshot = { correct: boolean; rationale: string };
export type LiveQuizInteraction = {
  selectedIndex: number | null;
  grading: 'idle' | 'pending' | 'error' | 'expired' | 'graded';
  grade?: LiveQuizGradeSnapshot;
};
export type LiveDeckInteraction = {
  cardIndex: number;
  flipped: boolean;
  ratings: Record<string, 'known' | 'review_again'>;
};
export type LiveBlockInteraction = { quiz?: LiveQuizInteraction; deck?: LiveDeckInteraction };
export type LiveActivityProgress = { blocks: Record<string, LiveBlockInteraction> };

export function createLiveActivityProgress(activity: LiveModelActivity): LiveActivityProgress {
  const blocks: LiveActivityProgress['blocks'] = {};
  activity.blocks.forEach((block, index) => {
    if (block.type === 'quiz') {
      blocks[String(index)] = { quiz: { selectedIndex: null, grading: 'idle' } };
    } else if (block.type === 'flashcard_deck') {
      blocks[String(index)] = { deck: { cardIndex: 0, flipped: false, ratings: {} } };
    }
  });
  return { blocks };
}
