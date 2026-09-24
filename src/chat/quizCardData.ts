/** Data accepted by the generic chat quiz card. Keep this separate from learning artifacts. */
export type QuizCardChoice = Readonly<{
  id: string;
  text: string;
}>;

export type QuizCardQuestion = Readonly<{
  id: string;
  prompt: string;
  choices: readonly [QuizCardChoice, QuizCardChoice, QuizCardChoice, QuizCardChoice];
  /** If supplied, selecting an answer reveals whether it is correct. */
  correctAnswer?: string;
  /** Optional source-provided explanation shown from the lightbulb control. */
  explanation?: string;
}>;

const validatedQuizCardData: unique symbol = Symbol('validatedQuizCardData');

export type ValidatedQuizCardData = Readonly<{
  questions: readonly QuizCardQuestion[];
  readonly [validatedQuizCardData]: true;
}>;

export type QuizCardDataError =
  | 'not_object'
  | 'invalid_questions'
  | 'too_many_questions'
  | 'invalid_question'
  | 'duplicate_question_id'
  | 'duplicate_choice_id'
  | 'invalid_correct_answer';

export type QuizCardDataValidation =
  | Readonly<{ ok: true; data: ValidatedQuizCardData }>
  | Readonly<{ ok: false; error: QuizCardDataError }>;

const MAX_QUESTIONS = 20;
const MAX_ID_LENGTH = 80;
const MAX_PROMPT_LENGTH = 1_200;
const MAX_CHOICE_LENGTH = 400;
const MAX_EXPLANATION_LENGTH = 1_600;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isBoundedString(value: unknown, maxLength: number): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maxLength;
}

/**
 * Validate untrusted quiz JSON before rendering. Questions are limited to 20,
 * each has exactly four uniquely identified choices, and text fields are bounded.
 */
export function validateQuizCardData(value: unknown): QuizCardDataValidation {
  if (!isRecord(value)) return { ok: false, error: 'not_object' };
  if (!Array.isArray(value.questions) || value.questions.length === 0) {
    return { ok: false, error: 'invalid_questions' };
  }
  if (value.questions.length > MAX_QUESTIONS) return { ok: false, error: 'too_many_questions' };

  const questionIds = new Set<string>();
  const questions: QuizCardQuestion[] = [];

  for (const rawQuestion of value.questions) {
    if (!isRecord(rawQuestion) ||
      !isBoundedString(rawQuestion.id, MAX_ID_LENGTH) ||
      !isBoundedString(rawQuestion.prompt, MAX_PROMPT_LENGTH) ||
      !Array.isArray(rawQuestion.choices) || rawQuestion.choices.length !== 4) {
      return { ok: false, error: 'invalid_question' };
    }
    if (questionIds.has(rawQuestion.id)) return { ok: false, error: 'duplicate_question_id' };
    questionIds.add(rawQuestion.id);

    const choices: QuizCardChoice[] = [];
    const choiceIds = new Set<string>();
    for (const rawChoice of rawQuestion.choices) {
      if (!isRecord(rawChoice) ||
        !isBoundedString(rawChoice.id, MAX_ID_LENGTH) ||
        !isBoundedString(rawChoice.text, MAX_CHOICE_LENGTH)) {
        return { ok: false, error: 'invalid_question' };
      }
      if (choiceIds.has(rawChoice.id)) return { ok: false, error: 'duplicate_choice_id' };
      choiceIds.add(rawChoice.id);
      choices.push({ id: rawChoice.id, text: rawChoice.text });
    }

    const correctAnswer = rawQuestion.correctAnswer;
    if (correctAnswer !== undefined && (typeof correctAnswer !== 'string' || !choiceIds.has(correctAnswer))) {
      return { ok: false, error: 'invalid_correct_answer' };
    }
    const explanation = rawQuestion.explanation;
    if (explanation !== undefined && !isBoundedString(explanation, MAX_EXPLANATION_LENGTH)) {
      return { ok: false, error: 'invalid_question' };
    }

    questions.push({
      id: rawQuestion.id,
      prompt: rawQuestion.prompt,
      choices: choices as [QuizCardChoice, QuizCardChoice, QuizCardChoice, QuizCardChoice],
      ...(correctAnswer === undefined ? {} : { correctAnswer }),
      ...(explanation === undefined ? {} : { explanation }),
    });
  }

  return { ok: true, data: { questions, [validatedQuizCardData]: true } };
}
