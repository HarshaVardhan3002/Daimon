import React, { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Image, Platform, Text, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition, ZoomIn, ZoomOut, interpolate, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { font, motion, radius, type } from '../design/tokens';
import { usePalette, useThemeMode } from '../design/useTheme';
import { useStrings } from '../i18n/strings';
import { setDocumentAttachment, setDraft, setImageAttachment, setReasoningMode, useApp } from '../state/appStore';
import { Icon } from '../ui/icons';
import { IconButton } from '../ui/IconButton';
import { PressableScale, haptic } from '../ui/PressableScale';
import { cancelEdit, sendDraft, stopRequest, useChatUi } from './chatController';
import { DictationBar } from './DictationBar';
import { imageNeedsDefault } from './errorText';
import { ReasoningGauge } from './ReasoningGauge';

const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

// Reference geometry (dp, 360-wide viewport): the resting pill is inset 34 and 48 tall; the focused writer is inset
// 12 with the text on its own row above the controls.
const REST_INSET = 34;
const OPEN_INSET = 10;
const ROW = 44;
const CONTROL = 40;

export type ComposerHandle = { focus: () => void; blur: () => void; isFocused: () => boolean };
type Props = {
  plusRef: React.RefObject<View | null>;
  onPlus: () => void;
  onOpenDial: () => void;
  plusOpen: boolean;
  dialOpen: boolean;
  bottomInset: number;
};

export const Composer = memo(forwardRef<ComposerHandle, Props>(function Composer({ plusRef, onPlus, onOpenDial, plusOpen, dialOpen, bottomInset }, ref) {
  const c = usePalette(); const t = useStrings(); const mode = useThemeMode();
  const locale = useApp(state => state.locale);
  const draft = useApp(state => state.draft);
  const image = useApp(state => state.imageAttachment);
  const document = useApp(state => state.documentAttachment);
  const reasoningMode = useApp(state => state.reasoningMode);
  const inChat = useApp(state => state.conversation.length > 0);
  const loading = useChatUi(state => state.requestStatus === 'loading');
  const editing = useChatUi(state => Boolean(state.editingTurnId));
  const inputRef = useRef<TextInput>(null);
  const [focused, setFocused] = useState(false);
  const [dictating, setDictating] = useState(false);
  useImperativeHandle(ref, () => ({ focus: () => inputRef.current?.focus(), blur: () => inputRef.current?.blur(), isFocused: () => inputRef.current?.isFocused() ?? false }), []);

  const hasText = draft.trim().length > 0;
  const canSend = hasText || Boolean(image || document);
  const thinking = reasoningMode !== 'default';
  const expanded = focused || Boolean(image || document) || draft.includes('\n') || editing || dictating;
  const open = useSharedValue(expanded ? 1 : 0);
  useEffect(() => { open.value = withTiming(expanded ? 1 : 0, { duration: motion.local, easing: motion.standard }); }, [expanded, open]);

  // Right-hand controls on the resting pill: gauge (Think harder on), mic, and send/stop when present.
  const rightCount = (thinking ? 1 : 0) + 1 + (canSend || loading ? 1 : 0);
  const restRight = rightCount * (CONTROL + 4) + 8;
  const containerStyle = useAnimatedStyle(() => ({ marginHorizontal: interpolate(open.value, [0, 1], [REST_INSET, OPEN_INSET]) }));
  const inputStyle = useAnimatedStyle(() => ({
    paddingLeft: interpolate(open.value, [0, 1], [52, 16]),
    paddingRight: interpolate(open.value, [0, 1], [restRight, 16]),
    paddingTop: interpolate(open.value, [0, 1], [13, 14]),
    paddingBottom: interpolate(open.value, [0, 1], [13, ROW + 10]),
  }), [restRight]);

  // Editing a sent message opens the keyboard on it, after the long-press menu has closed and dismissed its own.
  useEffect(() => {
    if (!editing) return;
    const timer = setTimeout(() => inputRef.current?.focus(), 260);
    return () => clearTimeout(timer);
  }, [editing]);

  const send = useCallback(() => { if (sendDraft() && !focused) inputRef.current?.blur(); }, [focused]);

  return <View style={{ paddingTop: 6, paddingBottom: bottomInset + 8 }}>
    {editing ? <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(120)} style={{ marginHorizontal: 22, marginBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <Icon name="edit-2" size={15} color={c.accent} />
      <View style={{ flex: 1 }}><Text style={{ ...type.label, fontSize: 14, color: c.text }}>{t.editing}</Text><Text style={{ ...type.helper, fontSize: 12, color: c.muted }}>{t.editingHint}</Text></View>
      <IconButton label={t.cancelEdit} size={32} onPress={cancelEdit}><Icon name="x" size={17} color={c.muted} /></IconButton>
    </Animated.View> : null}
    <Animated.View style={[{ backgroundColor: c.surface, borderRadius: radius.composer, overflow: 'hidden' }, containerStyle]}>
      {image || document ? <Animated.View layout={LinearTransition.duration(200)} style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingTop: 12 }}>
        {image ? <Animated.View entering={ZoomIn.springify().damping(16)} exiting={ZoomOut.duration(140)}>
          <Image source={{ uri: image.uri }} accessibilityLabel={t.imageInDraft} resizeMode="cover" style={{ width: 64, height: 64, borderRadius: 14 }} />
          <PressableScale onPress={() => setImageAttachment(undefined)} disabled={loading} accessibilityRole="button" accessibilityLabel={t.removeImage} hitSlop={10} style={{ position: 'absolute', top: 4, right: 4, width: 22, height: 22, borderRadius: 11, backgroundColor: '#000000B3', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="x" size={13} color="#FFFFFF" />
          </PressableScale>
        </Animated.View> : null}
        {document ? <Animated.View entering={ZoomIn.springify().damping(16)} exiting={ZoomOut.duration(140)} style={{ flexShrink: 1, maxWidth: 260, height: 64, flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 10, paddingRight: 34, borderRadius: 14, backgroundColor: c.raised }}>
          <View style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center' }}><Icon name="file-text" size={19} color={c.onAccent} /></View>
          <View style={{ flexShrink: 1 }}>
            <Text numberOfLines={1} ellipsizeMode="middle" style={{ ...type.label, fontSize: 13, color: c.text }}>{document.name}</Text>
            <Text numberOfLines={1} style={{ ...type.helper, fontSize: 12, color: c.muted }}>{document.mimeType === 'application/pdf' ? 'PDF' : document.mimeType === 'text/markdown' ? 'Markdown' : 'Text'} · {(document.sizeBytes / 1024 / 1024).toFixed(1)} MiB</Text>
          </View>
          <PressableScale onPress={() => setDocumentAttachment(undefined)} disabled={loading} accessibilityRole="button" accessibilityLabel={t.removeFile} hitSlop={10} style={{ position: 'absolute', top: 6, right: 6, width: 22, height: 22, borderRadius: 11, backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="x" size={13} color={c.text} />
          </PressableScale>
        </Animated.View> : null}
      </Animated.View> : null}
      {image && thinking ? <Text accessibilityLiveRegion="polite" style={{ ...type.helper, fontSize: 12, color: c.muted, marginHorizontal: 16, marginTop: 8 }}>{imageNeedsDefault(locale)}</Text> : null}
      {dictating ? <DictationBar onClose={() => setDictating(false)} /> : <>
        {/* iOS appends the placeholder to a text input's label, so there the placeholder alone names it. */}
        <AnimatedTextInput ref={inputRef} value={draft} onChangeText={setDraft} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
          placeholder={inChat ? t.replyPlaceholder : t.composerPlaceholder} placeholderTextColor={c.faint} keyboardAppearance={mode} multiline maxLength={5000}
          accessibilityLabel={Platform.OS === 'ios' ? undefined : t.composerLabel} selectionColor={c.accent} cursorColor={c.accent}
          style={[{ color: c.text, fontFamily: font.regular, fontSize: 16, lineHeight: 22, maxHeight: expanded ? 200 : 48, textAlignVertical: 'top' }, inputStyle]} />
        <View pointerEvents="box-none" style={{ position: 'absolute', left: 4, right: 4, bottom: 4, height: ROW, flexDirection: 'row', alignItems: 'center' }}>
          <IconButton ref={plusRef} label={t.addAttachment} onPress={onPlus} disabled={loading} accessibilityState={{ expanded: plusOpen }} size={CONTROL} style={{ opacity: dialOpen ? 0 : 1 }}>
            <Icon name="plus" size={23} color={c.text} />
          </IconButton>
          <View style={{ flex: 1 }} pointerEvents="none" />
          {thinking ? <Animated.View entering={ZoomIn.springify().damping(15)} exiting={ZoomOut.duration(140)} layout={LinearTransition.springify().damping(20)}>
            <IconButton label={`${t.thinkingDial}: ${t.effortLabel[reasoningMode]}`} onPress={onOpenDial} onLongPress={() => { haptic('selection'); setReasoningMode('default'); }} accessibilityState={{ selected: true }} size={CONTROL}>
              <ReasoningGauge mode={reasoningMode} theme={mode} />
            </IconButton>
          </Animated.View> : null}
          <Animated.View layout={LinearTransition.springify().damping(20)}>
            <IconButton label={t.dictate} onPress={() => { haptic('light'); setDictating(true); }} size={CONTROL}><Icon name="mic" size={20} color={c.text} /></IconButton>
          </Animated.View>
          {loading || canSend ? <Animated.View key={loading ? 'stop' : 'send'} entering={ZoomIn.springify().damping(14).stiffness(260)} exiting={ZoomOut.duration(120)} style={{ marginLeft: 4 }}>
            {loading
              ? <IconButton label={t.stop} variant="inverse" size={36} onPress={stopRequest} haptic="light"><View style={{ width: 12, height: 12, borderRadius: 2.5, backgroundColor: c.canvas }} /></IconButton>
              : <IconButton label={t.send} variant="accent" size={36} onPress={send}><Icon name="arrow-up" size={20} color={c.onAccent} /></IconButton>}
          </Animated.View> : null}
        </View>
      </>}
    </Animated.View>
  </View>;
}));

