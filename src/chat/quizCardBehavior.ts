import type { QuizCardQuestion } from './quizCardData';

export type QuizCardAdvanceAction = 'disabled' | 'next' | 'complete' | 'completed';

export function runQuizCardAdvanceAction(
  action: QuizCardAdvanceAction,
  callbacks: Readonly<{ onNext: () => void; onComplete: () => void }>,
): void {
  if (action === 'next') callbacks.onNext();
  else if (action === 'complete') callbacks.onComplete();
}

/** Resolve the footer action from controlled answer and completion state. */
export function getQuizCardAdvanceAction(
  question: QuizCardQuestion,
  currentIndex: number,
  questionCount: number,
  selectedChoiceId: string | undefined,
  completed: boolean,
): QuizCardAdvanceAction {
  if (!selectedChoiceId || !question.choices.some(choice => choice.id === selectedChoiceId)) return 'disabled';
  if (currentIndex !== questionCount - 1) return 'next';
  return completed ? 'completed' : 'complete';
}

/** Correctness is intentionally unavailable until the parent marks the quiz complete. */
export function getQuizCardAnswerFeedback(
  question: QuizCardQuestion,
  selectedChoiceId: string | undefined,
  completed: boolean,
): Readonly<{ selectedIsCorrect: boolean; correctChoiceIndex: number }> | null {
  if (!completed || question.correctAnswer === undefined) return null;
  return {
    selectedIsCorrect: selectedChoiceId === undefined ? false : selectedChoiceId === question.correctAnswer,
    correctChoiceIndex: question.choices.findIndex(choice => choice.id === question.correctAnswer),
  };
}
