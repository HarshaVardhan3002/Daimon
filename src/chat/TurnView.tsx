import * as Linking from 'expo-linking';
import React, { memo, useCallback, useRef, useState } from 'react';
import { Image, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeInUp, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { previewSources, previewThinking } from '../dev/fixtures';
import { motion, radius, type } from '../design/tokens';
import { usePalette } from '../design/useTheme';
import { formatWhen } from '../i18n/format';
import { useStrings, type Strings } from '../i18n/strings';
import { useAccount } from '../state/accountStore';
import { branchFromTurn, updateTurnById, useApp } from '../state/appStore';
import { getLegacyActivityText } from '../state/chatHistory';
import { turnTime, type AnswerSource, type Turn } from '../state/types';
import { Icon, CopyCheck, SwapIcon } from '../ui/icons';
import { IconButton } from '../ui/IconButton';
import { PulseDot, ShimmerText } from '../ui/feedback';
import { openMenuFrom, openSheet, toast } from '../ui/overlays';
import { PressableScale, haptic } from '../ui/PressableScale';
import { beginEdit, canRegenerate, copyText, freshAnswers, isBusy, regenerateTurn, retryableRequestFor, retryRequest, shareText, toggleReadAloud, useChatUi } from './chatController';
import { errorText } from './errorText';
import { GeneratedImage } from './GeneratedImage';
import { QuizCard } from './QuizCard';
import { validateQuizCardData } from './quizCardData';
import { ReadableMessage } from './ReadableMessage';

const GUTTER = 20;

function effortName(t: Strings, effort: Turn['reasoningEffort']): string {
  return effort === 'low' ? t.effortLabel.instant : effort === 'medium' ? t.effortLabel.medium : effort === 'high' ? t.effortLabel.high : t.effortLabel.default;
}

// ------------------------------------------------------------------------------------------------------------------

function UserBubble({ prompt, background, color }: { prompt: string; background: string; color: string }) {
  return <View style={{ backgroundColor: background, borderRadius: radius.bubble + 2, paddingHorizontal: 16, paddingVertical: 10 }}>
    <Text style={{ ...type.body, color }}>{prompt}</Text>
  </View>;
}

function UserMessage({ turn, fresh }: { turn: Turn; fresh: boolean }) {
  const c = usePalette(); const t = useStrings();
  const locale = useApp(state => state.locale);
  const bubbleRef = useRef<View>(null);
  const squeeze = useSharedValue(1);
  const bubbleStyle = useAnimatedStyle(() => ({ transform: [{ scale: squeeze.value }] }));
  const openActions = useCallback(() => {
    haptic('medium');
    squeeze.value = withSequence(withTiming(0.96, { duration: 90 }), withSpring(1, motion.bouncy));
    const when = turnTime(turn);
    openMenuFrom(bubbleRef.current, {
      header: when ? formatWhen(when, locale) : undefined, align: 'right',
      lift: <UserBubble prompt={turn.prompt} background={c.user} color={c.userText} />,
      items: [
        { key: 'copy', label: t.copy, icon: 'copy', onPress: () => { void copyText(turn.prompt).then(ok => { if (ok) toast(t.copied); }); } },
        { key: 'select', label: t.selectText, icon: 'type', onPress: () => openSheet({ title: t.selectText, render: () => <Text selectable style={{ ...type.body, color: c.text, paddingHorizontal: 22, paddingBottom: 16 }}>{turn.prompt}</Text> }) },
        { key: 'edit', label: t.editMessage, icon: 'edit-2', disabled: isBusy() || turn.status === 'streaming', onPress: () => beginEdit(turn) },
        { key: 'share', label: t.sharePrompt, icon: 'share-2', onPress: () => void shareText(turn.prompt) },
      ],
    });
  }, [c.text, c.user, c.userText, locale, squeeze, t, turn]);
  return <Animated.View entering={fresh ? FadeInDown.duration(260).withInitialValues({ opacity: 0, transform: [{ translateY: 18 }] }) : undefined} style={{ alignItems: 'flex-end', paddingHorizontal: GUTTER, paddingTop: 12, gap: 6 }}>
    {turn.imageAttachment ? <Image source={{ uri: turn.imageAttachment.uri }} accessibilityLabel={t.attachedImage} resizeMode="cover" style={{ width: 196, height: 148, borderRadius: 18 }} /> : null}
    {turn.documentAttachment ? <View accessible accessibilityLabel={turn.documentAttachment.name} style={{ maxWidth: '84%', flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 18, backgroundColor: c.surface }}>
      <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center' }}><Icon name="file-text" size={18} color={c.onAccent} /></View>
      <Text numberOfLines={1} ellipsizeMode="middle" style={{ ...type.label, fontSize: 14, color: c.text, flexShrink: 1 }}>{turn.documentAttachment.name}</Text>
    </View> : null}
    <PressableScale ref={bubbleRef} onLongPress={openActions} delayLongPress={320} scaleTo={1} accessibilityRole="text" accessibilityLabel={`${t.yourMessage}: ${turn.prompt}`} accessibilityActions={[{ name: 'longpress', label: t.more }]} onAccessibilityAction={openActions} style={{ maxWidth: '84%' }}>
      <Animated.View style={bubbleStyle}><UserBubble prompt={turn.prompt} background={c.user} color={c.userText} /></Animated.View>
    </PressableScale>
  </Animated.View>;
}

// ------------------------------------------------------------------------------------------------------------------

function SourcesPill({ sources, preview }: { sources: AnswerSource[]; preview: boolean }) {
  const c = usePalette(); const t = useStrings();
  const open = () => openSheet({ title: t.sources, render: () => <SourcesList sources={sources} preview={preview} /> });
  return <PressableScale onPress={open} highlight={c.raised} accessibilityRole="button" accessibilityLabel={`${t.sources}, ${sources.length}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, height: 36, paddingLeft: 6, paddingRight: 12, borderRadius: 18, marginLeft: 4 }}>
    <View style={{ flexDirection: 'row' }}>
      {sources.slice(0, 3).map((source, index) => <View key={source.id} style={{ width: 22, height: 22, borderRadius: 11, marginLeft: index ? -7 : 0, backgroundColor: c.raised, borderWidth: 2, borderColor: c.canvas, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={source.kind === 'chat' ? 'message-circle' : source.kind === 'file' ? 'file' : 'globe'} size={11} color={c.text} />
      </View>)}
    </View>
    <Text style={{ ...type.label, fontSize: 14, color: c.muted }}>{preview ? `${t.sources} · Preview` : t.sources}</Text>
  </PressableScale>;
}

function SourcesList({ sources, preview }: { sources: AnswerSource[]; preview: boolean }) {
  const c = usePalette(); const t = useStrings();
  const cited = sources.filter(source => source.cited !== false);
  const more = sources.filter(source => source.cited === false);
  const row = (source: AnswerSource) => <PressableScale key={source.id} disabled={!source.url} onPress={() => source.url && void Linking.openURL(source.url)} highlight={c.raised} scaleTo={0.99} accessibilityRole={source.url ? 'link' : 'text'} style={{ paddingHorizontal: 22, paddingVertical: 12, gap: 3 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
      <Icon name={source.kind === 'chat' ? 'message-circle' : source.kind === 'file' ? 'file' : 'globe'} size={13} color={c.muted} />
      <Text style={{ ...type.helper, color: c.muted }}>{source.domain ?? (source.kind === 'chat' ? t.chat : '')}</Text>
    </View>
    <Text style={{ ...type.body, color: c.text }}>{source.title}</Text>
  </PressableScale>;
  return <View>
    {preview ? <Text style={{ ...type.helper, color: c.muted, paddingHorizontal: 22, paddingBottom: 8 }}>Preview fixtures — sample data, not from this answer.</Text> : null}
    {cited.map(row)}
    {more.length ? <Text style={{ ...type.caption, color: c.muted, paddingHorizontal: 22, paddingTop: 14, paddingBottom: 4 }}>{t.moreSources}</Text> : null}
    {more.map(row)}
  </View>;
}

function ThoughtRow({ turn, preview }: { turn: Turn; preview: boolean }) {
  const c = usePalette(); const t = useStrings();
  const seconds = Math.max(1, Math.round((turn.elapsedMs ?? 0) / 1000));
  const label = t.thoughtFor(seconds);
  const content = <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 32 }}>
    <Text style={{ ...type.labelRegular, color: c.muted }}>{label}</Text>
    {preview ? <Icon name="chevron-right" size={16} color={c.muted} /> : null}
  </View>;
  if (!preview) return <View accessible accessibilityLabel={label} style={{ marginBottom: 6 }}>{content}</View>;
  return <PressableScale onPress={() => openSheet({ title: label, render: () => <View style={{ paddingHorizontal: 22, gap: 10, paddingBottom: 12 }}>
    <Text style={{ ...type.helper, color: c.muted }}>Preview fixtures — sample reasoning, not from this answer.</Text>
    <Text style={{ ...type.body, color: c.text }}>{previewThinking}</Text>
  </View> })} accessibilityRole="button" accessibilityLabel={label} scaleTo={0.98} style={{ alignSelf: 'flex-start', marginBottom: 6 }}>{content}</PressableScale>;
}

function AnswerActions({ turn, answer }: { turn: Turn; answer: string }) {
  const c = usePalette(); const t = useStrings();
  const locale = useApp(state => state.locale);
  const speaking = useChatUi(state => state.speakingTurnId === turn.id);
  const [copied, setCopied] = useState(false);
  const moreRef = useRef<View>(null);
  const copy = async () => { if (await copyText(answer)) { setCopied(true); setTimeout(() => setCopied(false), 1500); } };
  const more = () => {
    const sent = turnTime(turn);
    const answeredAt = sent && turn.elapsedMs ? sent + turn.elapsedMs : sent;
    const model = turn.reasoningEffort ? t.thinkingModel(effortName(t, turn.reasoningEffort)) : t.defaultModel;
    openMenuFrom(moreRef.current, {
      header: answeredAt ? formatWhen(answeredAt, locale) : undefined, align: 'left',
      items: [
        { key: 'branch', label: t.branch, icon: 'git-branch', onPress: () => { if (branchFromTurn(turn.id)) toast(t.branched); } },
        { kind: 'divider', key: 'd1' },
        { kind: 'note', key: 'model', label: t.usedModel(model) },
        ...(canRegenerate(turn) ? [{ key: 'regenerate', label: t.regenerate, icon: 'rotate-cw' as const, onPress: () => regenerateTurn(turn) }] : []),
      ],
    });
  };
  return <Animated.View entering={FadeIn.delay(120).duration(240)} style={{ flexDirection: 'row', alignItems: 'center', marginLeft: -9, marginTop: 2 }}>
    <IconButton label={copied ? t.copied : t.copy} onPress={() => void copy()} size={36}><CopyCheck done={copied} size={18} color={c.muted} /></IconButton>
    <IconButton label={speaking ? t.stopReading : t.readAloud} accessibilityState={{ selected: speaking }} onPress={() => void toggleReadAloud(turn, answer)} size={36}>
      <SwapIcon active={speaking} rotate={0} size={19} from={<Icon name="volume-2" size={19} color={c.muted} />} to={<Icon name="square" size={15} color={c.text} />} />
    </IconButton>
    <IconButton label={t.share} onPress={() => void shareText(answer)} size={36}><Icon name="share-2" size={17} color={c.muted} /></IconButton>
    <IconButton ref={moreRef} label={t.more} onPress={more} size={36}><Icon name="more-vertical" size={18} color={c.muted} /></IconButton>
  </Animated.View>;
}

function StatusLine({ thinking }: { thinking: boolean }) {
  const c = usePalette(); const t = useStrings();
  return <Animated.View entering={FadeIn.delay(80).duration(200)} accessibilityLiveRegion="polite" accessibilityLabel={thinking ? t.thinking : t.working} style={{ minHeight: 30, justifyContent: 'center' }}>
    {thinking ? <ShimmerText style={{ ...type.labelRegular, color: c.text }}>{t.thinking}</ShimmerText> : <PulseDot />}
  </Animated.View>;
}

function AssistantMessage({ turn }: { turn: Turn }) {
  const c = usePalette(); const t = useStrings();
  const busy = useChatUi(state => state.requestStatus === 'loading');
  const preview = useAccount(state => state.dev.previewFixtures);
  const legacySample = turn.id.startsWith('sample-') && !turn.liveActivity;
  const answer = legacySample ? (turn.locale === 'de' ? 'Diese gespeicherte Lernaktivität stammt aus einer früheren Version.' : 'This saved study activity comes from an earlier version.') : turn.answer.trim() || getLegacyActivityText(turn);
  const rich = legacySample ? undefined : turn.rich;
  const validatedQuiz = rich?.type === 'quiz' ? validateQuizCardData({ questions: rich.questions }) : undefined;
  const saveQuiz = (update: (quiz: Extract<NonNullable<Turn['rich']>, { type: 'quiz' }>) => Extract<NonNullable<Turn['rich']>, { type: 'quiz' }>) => updateTurnById(turn.id, current => current.rich?.type === 'quiz' ? { ...current, rich: update(current.rich) } : current);
  const reveal = freshAnswers.has(turn.id);
  const sources = turn.sources ?? (preview && turn.status === 'complete' && answer ? previewSources : undefined);

  if (turn.status === 'streaming') return <View style={{ paddingHorizontal: GUTTER, paddingTop: 18, paddingBottom: 24 }}><StatusLine thinking={Boolean(turn.reasoningEffort)} /></View>;
  if (turn.status === 'stopped' || turn.status === 'failed') {
    const retryable = retryableRequestFor(turn.id);
    const message = turn.requestError ? errorText(turn.locale, turn.requestError) : turn.status === 'stopped' ? t.responseStopped : t.responseFailed;
    return <Animated.View entering={FadeInUp.duration(220)} style={{ marginHorizontal: GUTTER, marginTop: 12, marginBottom: 20, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <Icon name={turn.status === 'stopped' ? 'pause-circle' : 'alert-circle'} size={17} color={turn.status === 'stopped' ? c.muted : c.danger} />
      <Text style={{ ...type.helper, flex: 1, color: c.muted }}>{message}{!turn.requestError?.startsWith('document_') && !retryable && turn.status === 'failed' ? t.retryUnavailable : ''}</Text>
      {retryable ? <PressableScale disabled={busy} onPress={() => retryRequest(turn.id)} highlight={c.raised} accessibilityRole="button" accessibilityLabel={t.retry} style={{ minHeight: 40, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1, borderColor: c.line, flexDirection: 'row', alignItems: 'center', gap: 6, opacity: busy ? 0.45 : 1 }}>
        <Icon name="rotate-cw" size={14} color={c.text} /><Text style={{ ...type.label, fontSize: 14, color: c.text }}>{t.retry}</Text>
      </PressableScale> : null}
    </Animated.View>;
  }
  if (!answer && !rich) return null;
  return <View style={{ paddingHorizontal: GUTTER, paddingTop: 18, paddingBottom: 20 }}>
    {turn.reasoningEffort && turn.elapsedMs ? <ThoughtRow turn={turn} preview={preview} /> : null}
    {turn.documentInfo?.truncated ? <View accessibilityLiveRegion="polite" style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 12, paddingHorizontal: 12, paddingVertical: 10, borderRadius: radius.row, backgroundColor: c.surface }}>
      <Icon name="info" size={15} color={c.accent} />
      <Text style={{ ...type.helper, flex: 1, color: c.muted }}>{turn.documentInfo.pagesRead && turn.documentInfo.pagesTotal
        ? (turn.locale === 'de' ? `Es wurde nur ein Teil der Datei gelesen: ${turn.documentInfo.characters} Zeichen; ${turn.documentInfo.pagesRead} von ${turn.documentInfo.pagesTotal} Seiten.` : `Only part of this file was read: ${turn.documentInfo.characters} characters; ${turn.documentInfo.pagesRead} of ${turn.documentInfo.pagesTotal} pages.`)
        : (turn.locale === 'de' ? 'Es wurden nur die ersten 24.000 Zeichen der Datei gelesen.' : 'Only the first 24,000 characters of this file were read.')}</Text>
    </View> : null}
    {answer ? <View accessibilityLabel={t.assistantLabel}><ReadableMessage text={answer} palette={c} reveal={reveal} /></View> : null}
    {rich?.type === 'generated_image' ? <GeneratedImage image={rich} palette={c} locale={turn.locale} showNotice={toast} /> : null}
    {rich?.type === 'quiz' && validatedQuiz?.ok ? <QuizCard data={validatedQuiz.data} currentIndex={rich.currentIndex} answers={rich.answers} completed={rich.completed} onAnswerChange={(questionId, choiceId) => saveQuiz(quiz => ({ ...quiz, answers: { ...quiz.answers, [questionId]: choiceId } }))} onIndexChange={currentIndex => saveQuiz(quiz => ({ ...quiz, currentIndex }))} onComplete={() => saveQuiz(quiz => ({ ...quiz, completed: true }))} palette={{ text: c.text, muted: c.muted, surface: c.canvas, line: c.line, accent: c.accent, correct: c.success, incorrect: c.danger }} /> : null}
    {answer ? <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' }}>
      <AnswerActions turn={turn} answer={answer} />
      {sources?.length ? <SourcesPill sources={sources} preview={!turn.sources} /> : null}
    </View> : null}
  </View>;
}

/** One exchange: the person's message, then Daimon's answer or its progress/error state. */
export const TurnView = memo(function TurnView({ turn, fresh }: { turn: Turn; fresh: boolean }) {
  return <View>
    <UserMessage turn={turn} fresh={fresh} />
    <AssistantMessage turn={turn} />
  </View>;
}, (previous, next) => previous.turn === next.turn && previous.fresh === next.fresh);

