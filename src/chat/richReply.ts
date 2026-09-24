import * as FileSystem from 'expo-file-system/legacy';
import type { RichReply } from './modelClient';
import type { QuizCardQuestion } from './quizCardData';
import { validateQuizCardData } from './quizCardData';

export type PersistedRichContent =
  | { type: 'quiz'; questions: readonly QuizCardQuestion[]; answers: Record<string, string>; currentIndex: number; completed: boolean }
  | { type: 'generated_image'; uri: string; mimeType: 'image/png'; width: number; height: number; alt: string };

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

/** Write the returned base64 exactly once into persistent app storage. */
export async function persistRichReply(reply: RichReply, turnId: string): Promise<PersistedRichContent> {
  if (reply.type === 'quiz') return { type: 'quiz', questions: reply.questions, answers: {}, currentIndex: 0, completed: false };
  if (!FileSystem.documentDirectory) throw new Error('Persistent app storage is unavailable.');
  const byteLength = Math.floor(reply.base64.length * 3 / 4) - (reply.base64.endsWith('==') ? 2 : reply.base64.endsWith('=') ? 1 : 0);
  if (reply.mimeType !== 'image/png' || byteLength < 24 || byteLength > MAX_IMAGE_BYTES) throw new Error('Generated image is outside the supported size limit.');
  const safeId = turnId.replace(/[^a-zA-Z0-9_-]/g, '_');
  const uri = `${FileSystem.documentDirectory}generated-${safeId}.png`;
  await FileSystem.writeAsStringAsync(uri, reply.base64, { encoding: FileSystem.EncodingType.Base64 });
  return { type: 'generated_image', uri, mimeType: reply.mimeType, width: reply.width, height: reply.height, alt: reply.alt };
}

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

/** Decode optional rich data independently so a bad add-on cannot hide an older text chat. */
export function decodePersistedRichContent(value: unknown): PersistedRichContent | undefined {
  if (!record(value)) return undefined;
  const documentDirectory = FileSystem.documentDirectory;
  const imageFilename = typeof value.uri === 'string' && documentDirectory && value.uri.startsWith(documentDirectory) ? value.uri.slice(documentDirectory.length) : '';
  if (value.type === 'generated_image' && typeof value.uri === 'string' && /^generated-[a-zA-Z0-9_-]+\.png$/.test(imageFilename) && value.mimeType === 'image/png' && Number.isInteger(value.width) && Number.isInteger(value.height) && (value.width as number) > 0 && (value.width as number) <= 4096 && (value.height as number) > 0 && (value.height as number) <= 4096 && typeof value.alt === 'string' && value.alt.length > 0 && value.alt.length <= 500) {
    return { type: 'generated_image', uri: value.uri, mimeType: 'image/png', width: value.width as number, height: value.height as number, alt: value.alt };
  }
  if (value.type === 'quiz' && Array.isArray(value.questions) && value.questions.length > 0 && value.questions.length <= 20 && record(value.answers) && Number.isInteger(value.currentIndex) && (value.currentIndex as number) >= 0 && (value.currentIndex as number) < value.questions.length && typeof value.completed === 'boolean') {
    const checked = validateQuizCardData({ questions: value.questions });
    if (!checked.ok || checked.data.questions.some(question => !question.correctAnswer)) return undefined;
    const questions = checked.data.questions;
    const validAnswers: Record<string, string> = {};
    for (const [questionId, choiceId] of Object.entries(value.answers)) {
      const question = questions.find(item => item.id === questionId);
      if (question && typeof choiceId === 'string' && question.choices.some(choice => choice.id === choiceId)) validAnswers[questionId] = choiceId;
    }
    return { type: 'quiz', questions, answers: validAnswers, currentIndex: value.currentIndex as number, completed: value.completed };
  }
  return undefined;
}
