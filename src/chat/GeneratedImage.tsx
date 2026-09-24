import { Feather } from '@expo/vector-icons';
import * as ImageManipulator from 'expo-image-manipulator';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import React, { useState } from 'react';
import { Alert, Image, Modal, Pressable, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { PersistedRichContent } from './richReply';

type ImageReply = Extract<PersistedRichContent, { type: 'generated_image' }>;

export function GeneratedImage({ image, palette, locale, showNotice }: {
  image: ImageReply;
  palette: { canvas: string; text: string; muted: string; raised: string };
  locale: 'en' | 'de';
  showNotice: (message: string) => void;
}) {
  const [viewerOpen, setViewerOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [resizePickerOpen, setResizePickerOpen] = useState(false);
  const { width, height } = useWindowDimensions();
  const cardSize = Math.min(width - 32, 280);
  const shareLabel = locale === 'de' ? 'Bild teilen' : 'Share image';
  const downloadLabel = locale === 'de' ? 'Bild herunterladen' : 'Download image';
  const resizeLabel = locale === 'de' ? 'Größe ändern' : 'Resize';
  const closeLabel = locale === 'de' ? 'Schließen' : 'Close';

  const share = async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is unavailable.');
      await Sharing.shareAsync(image.uri, { mimeType: 'image/png', UTI: 'public.png', dialogTitle: shareLabel });
    } catch {
      showNotice(locale === 'de' ? 'Bild konnte nicht geteilt werden' : 'Could not share image');
    } finally { setBusy(false); }
  };

  const save = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const permission = await MediaLibrary.requestPermissionsAsync(true, ['photo']);
      if (!permission.granted) {
        showNotice(locale === 'de' ? 'Zugriff auf Fotos wurde nicht erlaubt' : 'Photo access was not granted');
        return;
      }
      await MediaLibrary.createAssetAsync(image.uri);
      showNotice(locale === 'de' ? 'In Fotos gespeichert' : 'Saved to Photos');
    } catch {
      showNotice(locale === 'de' ? 'Bild konnte nicht gespeichert werden' : 'Could not save image');
    } finally { setBusy(false); }
  };

  const resizeAndShare = async (scale: number) => {
    if (busy) return;
    setResizePickerOpen(false);
    setBusy(true);
    try {
      const resizedImage = await ImageManipulator.manipulateAsync(image.uri, [
        { resize: { width: Math.max(1, Math.round(image.width * scale)) } },
      ], { format: ImageManipulator.SaveFormat.PNG, compress: 1 });
      if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is unavailable.');
      await Sharing.shareAsync(resizedImage.uri, {
        mimeType: 'image/png',
        UTI: 'public.png',
        dialogTitle: locale === 'de' ? 'Verkleinertes Bild teilen' : 'Share resized image',
      });
    } catch {
      showNotice(locale === 'de' ? 'Bild konnte nicht verkleinert werden' : 'Could not resize image');
    } finally { setBusy(false); }
  };

  const showImageInfo = () => {
    Alert.alert(
      locale === 'de' ? 'Bildinformationen' : 'Image information',
      `${image.width} × ${image.height} · PNG`,
      [{ text: locale === 'de' ? 'Fertig' : 'Done' }],
    );
  };

  const iconButtonStyle = {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#292929',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  };

  return <>
    <View style={{ width: cardSize, height: cardSize, maxWidth: '100%', alignSelf: 'flex-start', marginHorizontal: -20, marginTop: 8, marginBottom: 13, overflow: 'hidden', borderRadius: 20, backgroundColor: palette.raised }}>
      <Pressable onPress={() => setViewerOpen(true)} accessibilityRole="button" accessibilityLabel={image.alt} style={{ width: '100%', height: '100%' }}>
        <Image source={{ uri: image.uri }} accessibilityLabel={image.alt} resizeMode="cover" style={{ width: '100%', height: '100%' }} />
      </Pressable>
      <Pressable onPress={() => void share()} accessibilityRole="button" accessibilityLabel={shareLabel} accessibilityState={{ disabled: busy }} disabled={busy} hitSlop={5} style={({ pressed }) => ({ position: 'absolute', right: 7, bottom: 7, width: 54, height: 54, borderRadius: 27, backgroundColor: '#181818B8', alignItems: 'center', justifyContent: 'center', opacity: pressed || busy ? 0.68 : 1 })}>
        <Feather name="share-2" size={21} color="#FFFFFF" />
      </Pressable>
    </View>

    <Modal visible={viewerOpen} animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={() => setViewerOpen(false)}>
      <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: '#000000' }}>
        <View style={{ minHeight: 62, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16 }}>
          <Pressable onPress={() => setViewerOpen(false)} accessibilityRole="button" accessibilityLabel={closeLabel} style={iconButtonStyle}><Feather name="x" size={23} color="#FFFFFF" /></Pressable>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Pressable onPress={showImageInfo} accessibilityRole="button" accessibilityLabel={locale === 'de' ? 'Bildinformationen' : 'Image information'} style={iconButtonStyle}><Feather name="more-vertical" size={22} color="#FFFFFF" /></Pressable>
            <Pressable onPress={() => void save()} accessibilityRole="button" accessibilityLabel={downloadLabel} accessibilityState={{ disabled: busy }} disabled={busy} style={({ pressed }) => ({ ...iconButtonStyle, opacity: pressed || busy ? 0.65 : 1 })}><Feather name="download" size={21} color="#FFFFFF" /></Pressable>
            <Pressable onPress={() => void share()} accessibilityRole="button" accessibilityLabel={shareLabel} accessibilityState={{ disabled: busy }} disabled={busy} style={({ pressed }) => ({ minWidth: 110, height: 48, paddingHorizontal: 18, borderRadius: 24, backgroundColor: '#FFFFFF', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: pressed || busy ? 0.75 : 1 })}>
              <Feather name="share-2" size={18} color="#111111" />
              <Text style={{ color: '#111111', fontSize: 16, fontWeight: '600' }}>{locale === 'de' ? 'Teilen' : 'Share'}</Text>
            </Pressable>
          </View>
        </View>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <Image source={{ uri: image.uri }} accessibilityLabel={image.alt} resizeMode="contain" style={{ width, height: Math.min(width * image.height / image.width, height * 0.68), maxWidth: 800 }} />
        </View>
        <View style={{ minHeight: 104, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 8 }}>
          <Pressable onPress={() => setResizePickerOpen(true)} accessibilityRole="button" accessibilityLabel={resizeLabel} accessibilityState={{ disabled: busy }} disabled={busy} style={{ width: 80, alignItems: 'center', gap: 8, paddingVertical: 8, opacity: busy ? 0.55 : 1 }}>
            <View style={{ ...iconButtonStyle, width: 56, height: 56, borderRadius: 28 }}><Feather name="maximize" size={21} color="#FFFFFF" /></View>
            <Text style={{ color: '#FFFFFF', fontSize: 14 }}>{resizeLabel}</Text>
          </Pressable>
        </View>
        {resizePickerOpen ? <View style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 2, backgroundColor: '#000000B8', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 }}>
          <View accessibilityViewIsModal style={{ width: '100%', maxWidth: 340, borderRadius: 24, backgroundColor: '#242424', padding: 20, gap: 10 }}>
            <Text accessibilityRole="header" style={{ color: '#FFFFFF', fontSize: 19, fontWeight: '600', marginBottom: 4 }}>{locale === 'de' ? 'Exportgröße wählen' : 'Choose export size'}</Text>
            {([['Large · 90%', 0.9], ['Medium · 75%', 0.75], ['Small · 50%', 0.5]] as const).map(([label, scale]) => <Pressable key={scale} onPress={() => void resizeAndShare(scale)} accessibilityRole="button" accessibilityLabel={`${label} · ${Math.round(image.width * scale)} × ${Math.round(image.height * scale)}`} style={({ pressed }) => ({ minHeight: 48, borderRadius: 14, backgroundColor: pressed ? '#444444' : '#333333', justifyContent: 'center', paddingHorizontal: 16 })}>
              <Text style={{ color: '#FFFFFF', fontSize: 16 }}>{locale === 'de' ? label.replace('Large', 'Groß').replace('Medium', 'Mittel').replace('Small', 'Klein') : label} · {Math.round(image.width * scale)} × {Math.round(image.height * scale)} px</Text>
            </Pressable>)}
            <Pressable onPress={() => setResizePickerOpen(false)} accessibilityRole="button" accessibilityLabel={locale === 'de' ? 'Abbrechen' : 'Cancel'} style={{ minHeight: 44, justifyContent: 'center', alignItems: 'center', marginTop: 2 }}>
              <Text style={{ color: '#FFFFFF', fontSize: 16 }}>{locale === 'de' ? 'Abbrechen' : 'Cancel'}</Text>
            </Pressable>
          </View>
        </View> : null}
      </SafeAreaView>
    </Modal>
  </>;
}
