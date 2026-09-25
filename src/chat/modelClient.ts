import { validateQuizCardData, type QuizCardQuestion } from './quizCardData';
import type { ReasoningEffort } from './reasoningEffort';

export type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
  /** Request-only user image. Never include this field in persisted state. */
  image?: string;
  /** Request-only PDF or UTF-8 text file. Never include this field in persisted state. */
  document?: { name: string; mimeType: 'application/pdf' | 'text/plain' | 'text/markdown'; data: string };
};

export type DocumentReadInfo = { pagesRead: number | null; pagesTotal: number | null; characters: number; truncated: boolean };

export type ChatCompletion = {
  message: { role: 'assistant'; content: string; rich?: RichReply };
  model: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  } | null;
  finishReason: string | null;
  documentInfo?: DocumentReadInfo;
};

export type RichReply =
  | { type: 'quiz'; questions: readonly QuizCardQuestion[] }
  | { type: 'generated_image'; mimeType: 'image/png'; base64: string; width: number; height: number; alt: string };

export type ChatCompletionErrorBody = {
  error: { code: string; message: string; retryable?: boolean };
};

const DEFAULT_PROXY_URL = 'http://127.0.0.1:18765';
const MAX_MESSAGES = 24;
const MAX_MESSAGE_CHARS = 6_000;
const MAX_TOTAL_CHARS = 12_000;
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
const MAX_IMAGE_DIMENSION = 4096;
const MAX_DOCUMENT_BYTES = 8 * 1024 * 1024;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function validateRichReply(value: unknown): RichReply {
  if (!isRecord(value) || typeof value.type !== 'string') throw new Error('Rich response type is invalid.');
  if (value.type === 'quiz') {
    const result = validateQuizCardData(value);
    if (!result.ok || result.data.questions.some(question => !question.correctAnswer)) throw new Error('Quiz response is invalid.');
    return { type: 'quiz', questions: result.data.questions };
  }
  if (value.type === 'generated_image') {
    if (value.mimeType !== 'image/png' || typeof value.base64 !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value.base64)) throw new Error('Generated image encoding is invalid.');
    const estimatedBytes = Math.floor(value.base64.length * 3 / 4) - (value.base64.endsWith('==') ? 2 : value.base64.endsWith('=') ? 1 : 0);
    if (estimatedBytes < 24 || estimatedBytes > MAX_IMAGE_BYTES) throw new Error('Generated image size is invalid.');
    if (!Number.isInteger(value.width) || !Number.isInteger(value.height) || (value.width as number) < 1 || (value.height as number) < 1 || (value.width as number) > MAX_IMAGE_DIMENSION || (value.height as number) > MAX_IMAGE_DIMENSION) throw new Error('Generated image dimensions are invalid.');
    if (typeof value.alt !== 'string' || !value.alt.trim() || value.alt.length > 500) throw new Error('Generated image description is invalid.');
    if (!value.base64.startsWith('iVBORw0KGgo')) throw new Error('Generated image is not a PNG.');
    // Decode only the first 24 base64 bytes using the PNG header's base64 prefix.
    const decodedHeader = decodePngHeader(value.base64);
    if (decodedHeader.width !== value.width || decodedHeader.height !== value.height) throw new Error('Generated image dimensions do not match its PNG data.');
    return { type: 'generated_image', mimeType: 'image/png', base64: value.base64, width: value.width as number, height: value.height as number, alt: value.alt };
  }
  throw new Error('Rich response type is unsupported.');
}

function decodePngHeader(base64: string): { width: number; height: number } {
  // The first 24 bytes fit in the first 32 base64 characters. Decode via a small, portable lookup.
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const bytes: number[] = [];
  for (let index = 0; index < 32; index += 4) {
    const chunk = base64.slice(index, index + 4);
    const a = alphabet.indexOf(chunk[0]); const b = alphabet.indexOf(chunk[1]);
    const c = chunk[2] === '=' ? 0 : alphabet.indexOf(chunk[2]); const d = chunk[3] === '=' ? 0 : alphabet.indexOf(chunk[3]);
    if (a < 0 || b < 0 || c < 0 || d < 0) throw new Error('Generated image header is invalid.');
    bytes.push((a << 2) | (b >> 4), ((b & 15) << 4) | (c >> 2), ((c & 3) << 6) | d);
  }
  if (bytes[12] !== 73 || bytes[13] !== 72 || bytes[14] !== 68 || bytes[15] !== 82) throw new Error('Generated image header is invalid.');
  const read32 = (offset: number) => bytes[offset] * 0x1000000 + (bytes[offset + 1] << 16) + (bytes[offset + 2] << 8) + bytes[offset + 3];
  return { width: read32(16), height: read32(20) };
}

export class ChatClientError extends Error {
  readonly code: string;
  readonly status: number;
  readonly retryable: boolean;

  constructor(message: string, code: string, status: number, retryable = false) {
    super(message);
    this.name = 'ChatClientError';
    this.code = code;
    this.status = status;
    this.retryable = retryable;
  }
}

function validateMessages(messages: readonly ChatMessage[]): ChatMessage[] {
  if (!Array.isArray(messages) || messages.length < 1 || messages.length > MAX_MESSAGES) {
    throw new Error(`messages must contain between 1 and ${MAX_MESSAGES} entries.`);
  }
  let totalChars = 0;
  let hasUserMessage = false;
  let documentCount = 0;
  const normalized = messages.map((message, index) => {
    if (!message || typeof message !== 'object' || (message.role !== 'user' && message.role !== 'assistant')) {
      throw new Error(`messages[${index}].role must be user or assistant.`);
    }
    if (typeof message.content !== 'string' || !message.content.trim()) {
      throw new Error(`messages[${index}].content must be non-empty text.`);
    }
    const content = message.content.trim();
    if (content.length > MAX_MESSAGE_CHARS) throw new Error(`messages[${index}].content is too long.`);
    totalChars += content.length;
    if (totalChars > MAX_TOTAL_CHARS) throw new Error('Conversation text is too long.');
    if (message.role === 'user') hasUserMessage = true;
    let image: string | undefined;
    if (message.image !== undefined) {
      if (message.role !== 'user' || index !== messages.length - 1 || typeof message.image !== 'string') throw new Error('Only the latest user message can contain an image.');
      const match = /^data:(image\/(?:png|jpeg));base64,((?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?)$/.exec(message.image);
      if (!match) throw new Error('Image must be a PNG or JPEG data URI.');
      const encoded = match[2];
      const imageBytes = Math.floor(encoded.length * 3 / 4) - (encoded.endsWith('==') ? 2 : encoded.endsWith('=') ? 1 : 0);
      if (imageBytes < 1 || imageBytes > MAX_IMAGE_BYTES) throw new Error('Image exceeds the supported 3 MiB limit.');
      image = message.image;
    }
    let document: ChatMessage['document'];
    if (message.document !== undefined) {
      documentCount += 1;
      if (message.role !== 'user' || index !== messages.length - 1 || documentCount > 1 || image) throw new Error('Only one image or document on the latest user message is supported.');
      const file = message.document;
      if (!file || typeof file !== 'object' || typeof file.name !== 'string' || !file.name.trim() || file.name.length > 255 || /[\u0000-\u001f\u007f]/.test(file.name)
        || !['application/pdf', 'text/plain', 'text/markdown'].includes(file.mimeType) || typeof file.data !== 'string') throw new Error('Document metadata is invalid.');
      const extension = file.name.split('.').pop()?.toLowerCase();
      const expectedMime = extension === 'pdf' ? 'application/pdf' : extension === 'txt' ? 'text/plain' : extension === 'md' ? 'text/markdown' : undefined;
      if (file.mimeType !== expectedMime) throw new Error('Document MIME type does not match its file name.');
      const data = file.data;
      if (!data.length || data.length > Math.ceil(MAX_DOCUMENT_BYTES / 3) * 4 || data.length % 4 !== 0
        || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(data)) throw new Error('Document data must be canonical base64 within the 8 MiB limit.');
      const documentBytes = Math.floor(data.length * 3 / 4) - (data.endsWith('==') ? 2 : data.endsWith('=') ? 1 : 0);
      if (documentBytes < 1 || documentBytes > MAX_DOCUMENT_BYTES) throw new Error('Document exceeds the supported 8 MiB limit.');
      document = { name: file.name.trim(), mimeType: file.mimeType, data };
    }
    return { role: message.role, content, ...(image ? { image } : {}), ...(document ? { document } : {}) };
  });
  if (!hasUserMessage) throw new Error('Conversation must include at least one user message.');
  return normalized;
}

function validateCompletion(value: unknown): ChatCompletion {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Response must be an object.');
  const raw = value as Record<string, unknown>;
  const message = raw.message as Record<string, unknown> | null;
  if (!message || message.role !== 'assistant' || typeof message.content !== 'string' || message.content.length > 40_000) {
    throw new Error('Assistant message is invalid.');
  }
  if (typeof raw.model !== 'string' || !raw.model.trim() || raw.model.length > 100) throw new Error('Model ID is invalid.');
  let usage: ChatCompletion['usage'] = null;
  if (raw.usage !== null) {
    if (!raw.usage || typeof raw.usage !== 'object' || Array.isArray(raw.usage)) throw new Error('Token usage is invalid.');
    const candidate = raw.usage as Record<string, unknown>;
    const values = [candidate.promptTokens, candidate.completionTokens, candidate.totalTokens];
    if (!values.every(value => Number.isInteger(value) && (value as number) >= 0)) throw new Error('Token usage is invalid.');
    usage = {
      promptTokens: candidate.promptTokens as number,
      completionTokens: candidate.completionTokens as number,
      totalTokens: candidate.totalTokens as number,
    };
  }
  if (raw.finishReason !== null && typeof raw.finishReason !== 'string') throw new Error('Finish reason is invalid.');
  let documentInfo: DocumentReadInfo | undefined;
  if (raw.documentInfo !== undefined) {
    if (!isRecord(raw.documentInfo) || !Number.isInteger(raw.documentInfo.characters) || (raw.documentInfo.characters as number) < 1
      || typeof raw.documentInfo.truncated !== 'boolean'
      || (raw.documentInfo.pagesRead !== null && (!Number.isInteger(raw.documentInfo.pagesRead) || (raw.documentInfo.pagesRead as number) < 1))
      || (raw.documentInfo.pagesTotal !== null && (!Number.isInteger(raw.documentInfo.pagesTotal) || (raw.documentInfo.pagesTotal as number) < 1))) throw new Error('Document read metadata is invalid.');
    documentInfo = { pagesRead: raw.documentInfo.pagesRead as number | null, pagesTotal: raw.documentInfo.pagesTotal as number | null, characters: raw.documentInfo.characters as number, truncated: raw.documentInfo.truncated };
  }
  const rich = message.rich === undefined ? undefined : validateRichReply(message.rich);
  if (!message.content.trim() && !rich) throw new Error('Assistant message is empty.');
  return {
    message: { role: 'assistant', content: message.content, ...(rich ? { rich } : {}) },
    model: raw.model,
    usage,
    finishReason: raw.finishReason as string | null,
    ...(documentInfo ? { documentInfo } : {}),
  };
}

/** Sends bounded conversation history to the local proxy for a complete, non-streaming answer. */
export async function sendChatCompletion(
  messages: readonly ChatMessage[],
  options: { baseUrl?: string; signal?: AbortSignal; reasoningEffort?: ReasoningEffort } = {},
): Promise<ChatCompletion> {
  const safeMessages = validateMessages(messages);
  if (options.reasoningEffort !== undefined && !['low', 'medium', 'high'].includes(options.reasoningEffort)) {
    throw new ChatClientError('The selected reasoning effort is invalid.', 'INVALID_REASONING_EFFORT', 400);
  }
  if (options.reasoningEffort && safeMessages.some(message => message.image)) {
    throw new ChatClientError('Image requests use the standard vision model. Choose Default before sending an image.', 'REASONING_IMAGE_UNSUPPORTED', 422);
  }
  const baseUrl = (options.baseUrl || DEFAULT_PROXY_URL).replace(/\/+$/, '');
  let response: Response;
  try {
    response = await fetch(`${baseUrl}/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ messages: safeMessages, ...(options.reasoningEffort ? { reasoningEffort: options.reasoningEffort } : {}) }),
      signal: options.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error;
    throw new ChatClientError('Could not reach the local chat proxy.', 'PROXY_UNREACHABLE', 0, true);
  }
  let body: unknown;
  try { body = await response.json(); }
  catch { throw new ChatClientError('The local chat proxy returned invalid JSON.', 'INVALID_PROXY_RESPONSE', response.status); }
  if (!response.ok) {
    const error = body as ChatCompletionErrorBody;
    throw new ChatClientError(
      error?.error?.message || `Chat request failed (HTTP ${response.status}).`,
      error?.error?.code || 'CHAT_REQUEST_FAILED',
      response.status,
      error?.error?.retryable || false,
    );
  }
  try { return validateCompletion(body); }
  catch {
    throw new ChatClientError('The chat proxy response did not match the supported contract.', 'INVALID_CHAT_RESPONSE', response.status);
  }
}
