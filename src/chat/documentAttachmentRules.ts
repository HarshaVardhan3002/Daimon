export const MAX_DOCUMENT_BYTES = 8 * 1024 * 1024;
export const MAX_DOCUMENT_NAME_LENGTH = 255;

export type DocumentMimeType = 'application/pdf' | 'text/plain' | 'text/markdown';
export type DocumentAttachment = {
  uri: string;
  mimeType: DocumentMimeType;
  sizeBytes: number;
  name: string;
};

export function supportedDocumentMimeType(mimeType: string | null | undefined, name: string): DocumentMimeType | undefined {
  const extension = name.split('.').pop()?.toLocaleLowerCase() ?? '';
  const normalized = mimeType?.toLocaleLowerCase().split(';')[0];
  if (extension === 'pdf' && (!normalized || normalized === 'application/pdf' || normalized === 'application/octet-stream')) return 'application/pdf';
  if (extension === 'txt' && (!normalized || normalized === 'text/plain' || normalized === 'application/octet-stream')) return 'text/plain';
  if (extension === 'md' && (!normalized || normalized === 'text/markdown' || normalized === 'text/plain' || normalized === 'application/octet-stream')) return 'text/markdown';
  return undefined;
}

export function isAppOwnedDocumentUri(uri: string, documentUri: string | null | undefined): boolean {
  if (!documentUri) return false;
  const directory = `${documentUri.replace(/\/$/, '')}/document-attachments/`;
  return uri.startsWith(directory) && /^document-\d+-[a-z0-9]+\.(?:pdf|txt|md)$/.test(uri.slice(directory.length));
}

export function decodeDocumentAttachment(value: unknown, documentUri: string | null | undefined): DocumentAttachment | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Stored document attachment is invalid.');
  const item = value as Record<string, unknown>;
  const supportedMime = item.mimeType === 'application/pdf' || item.mimeType === 'text/plain' || item.mimeType === 'text/markdown';
  if (typeof item.uri !== 'string' || !isAppOwnedDocumentUri(item.uri, documentUri) || !supportedMime
    || !Number.isInteger(item.sizeBytes) || (item.sizeBytes as number) < 1 || (item.sizeBytes as number) > MAX_DOCUMENT_BYTES
    || typeof item.name !== 'string' || !item.name.trim() || item.name.length > MAX_DOCUMENT_NAME_LENGTH
    || supportedDocumentMimeType(item.mimeType as string, item.name) !== item.mimeType) throw new Error('Stored document attachment is invalid.');
  return { uri: item.uri, mimeType: item.mimeType as DocumentMimeType, sizeBytes: item.sizeBytes as number, name: item.name };
}
