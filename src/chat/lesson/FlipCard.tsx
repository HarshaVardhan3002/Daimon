import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { motion, type } from '../../design/tokens';
import { usePalette } from '../../design/useTheme';
import { useStrings } from '../../i18n/strings';
import type { LessonCard, CardProgress, CardAction } from '../../learning/deck';
import { CardFrame, ChoiceButton } from './shared';

export function FlipCard({ card, progress, onAction }: { card: Extract<LessonCard, { kind: 'flip' }>; progress: CardProgress; onAction: (action: CardAction) => void; seed: string }) {
  const c = usePalette(); const t = useStrings().lesson; const reduced = useReducedMotion();
  const [frontHeight, setFrontHeight] = useState(0); const [backHeight, setBackHeight] = useState(0);
  const turn = useSharedValue(progress.flipped ? 1 : 0);
  useEffect(() => { turn.value = reduced ? (progress.flipped ? 1 : 0) : withTiming(progress.flipped ? 1 : 0, { duration: 280, easing: motion.standard }); }, [progress.flipped, reduced, turn]);
  const front = useAnimatedStyle(() => ({ opacity: 1 - turn.value, transform: reduced ? [] : [{ perspective: 900 }, { rotateY: `${turn.value * 180}deg` }] }));
  const back = useAnimatedStyle(() => ({ opacity: turn.value, transform: reduced ? [] : [{ perspective: 900 }, { rotateY: `${(turn.value - 1) * 180}deg` }] }));
  const reveal = () => { if (!progress.flipped) onAction({ type: 'flip' }); };
  const gradingReady = !card.confidence || progress.confidence !== undefined;
  const faceHeight = Math.max(132, frontHeight, backHeight);
  const confidenceOptions: Array<{ value: 'guess' | 'think' | 'sure'; label: string }> = [
    { value: 'guess', label: t.guess }, { value: 'think', label: t.thinkSo }, { value: 'sure', label: t.sure },
  ];
  return <CardFrame>
    <View style={{ height: faceHeight }}>
      <Animated.View
        pointerEvents={progress.flipped ? 'none' : 'auto'}
        accessibilityElementsHidden={progress.flipped}
        importantForAccessibility={progress.flipped ? 'no-hide-descendants' : 'auto'}
        onLayout={event => setFrontHeight(event.nativeEvent.layout.height)}
        style={[{ position: 'absolute', top: 0, left: 0, right: 0, justifyContent: 'center', backfaceVisibility: 'hidden' }, front]}
      >
        <ChoiceButton label={card.front} onPress={reveal} accessibilityLabel={`${card.front}. ${t.flipHint}`} />
        <Text style={{ color: c.faint, ...type.helper, textAlign: 'center', marginTop: 10 }}>{t.flipHint}</Text>
      </Animated.View>
      <Animated.View
        pointerEvents={progress.flipped ? 'auto' : 'none'}
        accessibilityElementsHidden={!progress.flipped}
        importantForAccessibility={!progress.flipped ? 'no-hide-descendants' : 'auto'}
        onLayout={event => setBackHeight(event.nativeEvent.layout.height)}
        style={[{ position: 'absolute', top: 0, left: 0, right: 0, justifyContent: 'center', backfaceVisibility: 'hidden' }, back]}
      >
        <Text accessibilityLiveRegion="polite" style={{ color: c.text, ...type.body }}>{card.back}</Text>
      </Animated.View>
    </View>
    {progress.flipped && !progress.answered && card.confidence ? <View>
      <Text style={{ color: c.muted, ...type.label, marginBottom: 8 }}>{t.howSure}</Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>{confidenceOptions.map(item => <View key={item.value} style={{ flex: 1 }}><ChoiceButton label={item.label} onPress={() => onAction({ type: 'confidence', value: item.value })} selected={progress.confidence === item.value} /></View>)}</View>
    </View> : null}
    {progress.flipped && !progress.answered && gradingReady ? <View style={{ flexDirection: 'row', gap: 10 }}>
      <View style={{ flex: 1 }}><ChoiceButton label={t.knewIt} onPress={() => onAction({ type: 'selfGrade', correct: true })} tone="success" /></View>
      <View style={{ flex: 1 }}><ChoiceButton label={t.notYet} onPress={() => onAction({ type: 'selfGrade', correct: false })} tone="danger" /></View>
    </View> : null}
    {progress.answered ? <Text accessibilityLiveRegion="polite" style={{ color: progress.correct ? c.success : c.muted, ...type.helper }}>{progress.correct ? t.correct : t.notQuite}</Text> : null}
  </CardFrame>;
}
