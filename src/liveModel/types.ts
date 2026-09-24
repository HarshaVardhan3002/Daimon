export type LiveModelLocale = 'en' | 'de';

export type LiveModelSourceKind = 'bundled_sample' | 'user_source';

export type LiveModelRequest = {
  /** Learner's requested activity or learning question. */
  prompt: string;
  /** Optional text that can ground the generated activity. */
  sourceText?: string;
  /** Required alongside sourceText so sample fixtures are never mislabeled as uploads. */
  sourceKind?: LiveModelSourceKind;
  locale?: LiveModelLocale;
};

export type ExplanationBlock = {
  type: 'explanation';
  heading: string;
  body: string;
};

export type QuizBlock = {
  type: 'quiz';
  /** Opaque server-side grading handle. Never contains the answer key. */
  quizId: string;
  question: string;
  options: readonly string[];
};

export type LiveModelGradeRequest = {
  quizId: string;
  /** Zero-based index into the quiz options. */
  selectedIndex: number;
};

export type LiveModelQuizGrade = {
  quizId: string;
  correct: boolean;
  rationale: string;
};

export type FlashcardDeckBlock = {
  type: 'flashcard_deck';
  cards: readonly { front: string; back: string }[];
};

export type LiveModelBlock = ExplanationBlock | QuizBlock | FlashcardDeckBlock;

export type LiveModelProvenanceKind =
  | 'generated_from_bundled_sample'
  | 'generated_from_user_source'
  | 'generated_open_question';

export type LiveModelActivity = {
  version: 1;
  provenance: {
    kind: LiveModelProvenanceKind;
    label: string;
  };
  title: string;
  blocks: readonly LiveModelBlock[];
};

export type LiveModelErrorCode =
  | 'INVALID_REQUEST'
  | 'REQUEST_TOO_LARGE'
  | 'NOT_FOUND'
  | 'RATE_LIMITED'
  | 'MODEL_UNAVAILABLE'
  | 'MODEL_REQUEST_FAILED'
  | 'MODEL_TIMEOUT'
  | 'QUIZ_NOT_FOUND'
  | 'QUIZ_ALREADY_GRADED'
  | 'ORIGIN_DENIED'
  | 'INVALID_MODEL_RESPONSE'
  | 'INVALID_MODEL_JSON'
  | 'UNSUPPORTED_MODEL_RESPONSE';

export type LiveModelError = {
  error: { code: LiveModelErrorCode | string; message: string; retryable?: boolean };
};
