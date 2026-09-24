import { Paths } from 'expo-file-system';
import * as LegacyFileSystem from 'expo-file-system/legacy';
import { decodeDocumentAttachment as decodeOwnedDocumentAttachment, isAppOwnedDocumentUri, MAX_DOCUMENT_BYTES, supportedDocumentMimeType, type DocumentAttachment, type DocumentMimeType } from './documentAttachmentRules';

export { MAX_DOCUMENT_BYTES, supportedDocumentMimeType, type DocumentAttachment, type DocumentMimeType } from './documentAttachmentRules';

export class DocumentAttachmentError extends Error {
  readonly code: 'DOCUMENT_TOO_LARGE' | 'DOCUMENT_INVALID';
  constructor(message: string, code: 'DOCUMENT_TOO_LARGE' | 'DOCUMENT_INVALID' = 'DOCUMENT_INVALID') {
    super(message);
    this.name = 'DocumentAttachmentError';
    this.code = code;
  }
}

export function decodeDocumentAttachment(value: unknown): DocumentAttachment | undefined {
  return decodeOwnedDocumentAttachment(value, Paths.document?.uri);
}

/** Copy a picked document into app-owned storage so it survives picker cache cleanup and restart. */
export async function persistDocumentAttachment(sourceUri: string, name: string, mimeType: string | null | undefined, sizeBytes?: number | null): Promise<DocumentAttachment> {
  const supportedMime = supportedDocumentMimeType(mimeType, name);
  if (!sourceUri || !supportedMime) throw new Error('Choose a PDF, TXT, or Markdown file.');
  const sourceInfo = await LegacyFileSystem.getInfoAsync(sourceUri);
  const sourceSize = sizeBytes ?? (sourceInfo.exists ? sourceInfo.size : undefined);
  if (!sourceInfo.exists || !sourceSize || sourceSize < 1 || sourceSize > MAX_DOCUMENT_BYTES || sourceInfo.size > MAX_DOCUMENT_BYTES) {
    throw new Error(sourceSize && sourceSize > MAX_DOCUMENT_BYTES ? 'This file is larger than 8 MiB.' : 'The selected file could not be read.');
  }
  const documentUri = Paths.document?.uri;
  if (!documentUri) throw new Error('App storage is unavailable.');
  const extension = supportedMime === 'application/pdf' ? 'pdf' : supportedMime === 'text/plain' ? 'txt' : 'md';
  const directory = `${documentUri.replace(/\/$/, '')}/document-attachments`;
  await LegacyFileSystem.makeDirectoryAsync(directory, { intermediates: true });
  const targetUri = `${directory}/document-${Date.now()}-${Math.random().toString(36).slice(2, 9)}.${extension}`;
  await LegacyFileSystem.copyAsync({ from: sourceUri, to: targetUri });
  const targetInfo = await LegacyFileSystem.getInfoAsync(targetUri);
  const targetSize = targetInfo.exists ? targetInfo.size : 0;
  if (!targetInfo.exists || targetSize < 1 || targetSize > MAX_DOCUMENT_BYTES) {
    await LegacyFileSystem.deleteAsync(targetUri, { idempotent: true }).catch(() => undefined);
    throw new Error(targetSize > MAX_DOCUMENT_BYTES ? 'This file is larger than 8 MiB.' : 'The selected file could not be saved.');
  }
  return { uri: targetUri, mimeType: supportedMime as DocumentMimeType, sizeBytes: targetSize, name: name.trim().slice(0, 255) || `document.${extension}` };
}

/** Read an app-owned attachment only when sending; never persist its base64 payload. */
export async function documentAttachmentPayload(attachment: Pick<DocumentAttachment, 'uri' | 'mimeType' | 'name' | 'sizeBytes'>): Promise<{ name: string; mimeType: DocumentMimeType; data: string }> {
  if (!isAppOwnedDocumentUri(attachment.uri, Paths.document?.uri)
    || supportedDocumentMimeType(attachment.mimeType, attachment.name) !== attachment.mimeType) {
    throw new DocumentAttachmentError('The attached file is outside app storage. Attach it again to retry.');
  }
  const info = await LegacyFileSystem.getInfoAsync(attachment.uri);
  if (!info.exists || info.size < 1 || info.size > MAX_DOCUMENT_BYTES || info.size !== attachment.sizeBytes) {
    throw new DocumentAttachmentError(info.exists && info.size > MAX_DOCUMENT_BYTES
      ? 'This file is larger than 8 MiB.'
      : 'The attached file is missing or has changed. Attach it again to retry.', info.exists && info.size > MAX_DOCUMENT_BYTES ? 'DOCUMENT_TOO_LARGE' : 'DOCUMENT_INVALID');
  }
  const data = await LegacyFileSystem.readAsStringAsync(attachment.uri, { encoding: LegacyFileSystem.EncodingType.Base64 });
  return { name: attachment.name, mimeType: attachment.mimeType, data };
}
