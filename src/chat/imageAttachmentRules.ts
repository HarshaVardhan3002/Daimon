export const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
export const MAX_IMAGE_DIMENSION = 2048;

export type ImageAttachment = {
  uri: string;
  mimeType: 'image/jpeg' | 'image/png';
  width: number;
  height: number;
  name: string;
};

export function isSupportedImage(mimeType: string | null | undefined, name: string): mimeType is 'image/jpeg' | 'image/png' {
  const normalized = mimeType?.toLocaleLowerCase().split(';')[0];
  if (normalized) return normalized === 'image/jpeg' || normalized === 'image/png';
  const extension = name.split('.').pop()?.toLocaleLowerCase() ?? '';
  return extension === 'jpg' || extension === 'jpeg' || extension === 'png';
}

export function isAppOwnedImageUri(uri: string, documentUri: string | null | undefined): boolean {
  if (!documentUri) return false;
  const directory = `${documentUri.replace(/\/$/, '')}/image-attachments/`;
  return uri.startsWith(directory) && /^image-\d+-[a-z0-9]+\.jpg$/.test(uri.slice(directory.length));
}

export function decodeImageAttachment(value: unknown, documentUri: string | null | undefined): ImageAttachment | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Stored image attachment is invalid.');
  const item = value as Record<string, unknown>;
  if (typeof item.uri !== 'string' || !isAppOwnedImageUri(item.uri, documentUri) || item.mimeType !== 'image/jpeg'
    || !Number.isInteger(item.width) || (item.width as number) < 1 || (item.width as number) > MAX_IMAGE_DIMENSION
    || !Number.isInteger(item.height) || (item.height as number) < 1 || (item.height as number) > MAX_IMAGE_DIMENSION
    || typeof item.name !== 'string' || item.name.length > 255) throw new Error('Stored image attachment is invalid.');
  return { uri: item.uri, mimeType: item.mimeType, width: item.width as number, height: item.height as number, name: item.name };
}
