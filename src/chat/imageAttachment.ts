import * as ImageManipulator from 'expo-image-manipulator';
import { Paths } from 'expo-file-system';
import * as LegacyFileSystem from 'expo-file-system/legacy';
import { decodeImageAttachment as decodeOwnedImageAttachment, isAppOwnedImageUri, MAX_IMAGE_BYTES, MAX_IMAGE_DIMENSION, type ImageAttachment } from './imageAttachmentRules';
export { isSupportedImage, type ImageAttachment } from './imageAttachmentRules';
export { MAX_IMAGE_BYTES, MAX_IMAGE_DIMENSION } from './imageAttachmentRules';

export function decodeImageAttachment(value: unknown): ImageAttachment | undefined {
  return decodeOwnedImageAttachment(value, Paths.document?.uri);
}

/** Normalize picker output to a small JPEG in app-owned storage for history and retry. */
export async function persistImageAttachment(sourceUri: string, name: string, width: number, height: number): Promise<ImageAttachment> {
  if (!sourceUri || !Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) {
    throw new Error('The selected image could not be read.');
  }
  const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(width, height));
  let resizeScale = scale;
  const qualities = [0.84, 0.72, 0.6, 0.48, 0.36];
  let result: ImageManipulator.ImageResult | undefined;

  for (let attempt = 0; attempt < qualities.length; attempt++) {
    result = await ImageManipulator.manipulateAsync(
      sourceUri,
      [{ resize: { width: Math.max(1, Math.round(width * resizeScale)), height: Math.max(1, Math.round(height * resizeScale)) } }],
      { compress: qualities[attempt], format: ImageManipulator.SaveFormat.JPEG },
    );
    const info = await LegacyFileSystem.getInfoAsync(result.uri);
    if (info.exists && info.size <= MAX_IMAGE_BYTES) break;
    resizeScale *= 0.82;
    if (attempt === qualities.length - 1) throw new Error('This image is too large to attach. Choose a smaller image.');
  }

  if (!result) throw new Error('The selected image could not be prepared.');
  const documentUri = Paths.document?.uri;
  if (!documentUri) throw new Error('App storage is unavailable.');
  const directory = `${documentUri.replace(/\/$/, '')}/image-attachments`;
  await LegacyFileSystem.makeDirectoryAsync(directory, { intermediates: true });
  const targetUri = `${directory}/image-${Date.now()}-${Math.random().toString(36).slice(2, 9)}.jpg`;
  await LegacyFileSystem.copyAsync({ from: result.uri, to: targetUri });
  const info = await LegacyFileSystem.getInfoAsync(targetUri);
  if (!info.exists || info.size > MAX_IMAGE_BYTES) {
    await LegacyFileSystem.deleteAsync(targetUri, { idempotent: true }).catch(() => undefined);
    throw new Error('This image is too large to attach. Choose a smaller image.');
  }
  return { uri: targetUri, mimeType: 'image/jpeg', width: result.width, height: result.height, name: (name || 'image.jpg').slice(0, 255) };
}

/** Read only at request time; callers persist the URI, never the base64 payload. */
export async function imageAttachmentDataUri(attachment: Pick<ImageAttachment, 'uri' | 'mimeType'>): Promise<string> {
  if (!isAppOwnedImageUri(attachment.uri, Paths.document?.uri) || attachment.mimeType !== 'image/jpeg') {
    throw new Error('The attached image is outside app storage. Attach it again to retry.');
  }
  const info = await LegacyFileSystem.getInfoAsync(attachment.uri);
  if (!info.exists || info.size < 1 || info.size > MAX_IMAGE_BYTES) {
    throw new Error('The attached image is missing or too large. Attach it again to retry.');
  }
  const base64 = await LegacyFileSystem.readAsStringAsync(attachment.uri, { encoding: LegacyFileSystem.EncodingType.Base64 });
  return `data:${attachment.mimeType};base64,${base64}`;
}
