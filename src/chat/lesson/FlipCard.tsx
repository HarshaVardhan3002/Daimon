import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, type SharedValue } from 'react-native-reanimated';
import { type } from '../../design/tokens';
import { usePalette } from '../../design/useTheme';
import { useStrings } from '../../i18n/strings';
import type { LessonCard, CardProgress, CardAction } from '../../learning/deck';
import { CardFrame, ChoiceButton } from './shared';

/**
 * A flashcard face. Tapping turns the whole card over (the deck animates `turn`); grading is the deck's swipe:
 * right for "knew it", left for "not yet".
 */
export function FlipCard({ card, progress, onAction, turn }: { card: Extract<LessonCard, { kind: 'flip' }>; progress: CardProgress; onAction: (action: CardAction) => void; seed: string; turn?: SharedValue<number> }) {
  const c = usePalette(); const t = useStrings().lesson;
  const [frontHeight, setFrontHeight] = useState(0); const [backHeight, setBackHeight] = useState(0);
  const still = useSharedValue(progress.flipped ? 1 : 0);
  const side = turn ?? still;
  // The card turns edge-on at the midpoint, so the faces swap there instead of cross-fading.
  const front = useAnimatedStyle(() => ({ opacity: side.value < 0.5 ? 1 : 0 }));
  const back = useAnimatedStyle(() => ({ opacity: side.value < 0.5 ? 0 : 1 }));
  const confidenceOptions: Array<{ value: 'guess' | 'think' | 'sure'; label: string }> = [
    { value: 'guess', label: t.guess }, { value: 'think', label: t.thinkSo }, { value: 'sure', label: t.sure },
  ];
  return <CardFrame>
    <Pressable
      onPress={() => { if (!progress.flipped) onAction({ type: 'flip' }); }}
      disabled={progress.flipped}
      accessibilityRole="button"
      accessibilityLabel={progress.flipped ? card.back : `${card.front}. ${t.flipHint}`}
      accessibilityState={{ expanded: Boolean(progress.flipped) }}
    >
      <View style={{ height: Math.max(120, frontHeight, backHeight) }}>
        <Animated.View importantForAccessibility="no-hide-descendants" onLayout={event => setFrontHeight(event.nativeEvent.layout.height)} style={[{ position: 'absolute', top: 0, left: 0, right: 0, gap: 14 }, front]}>
          <Text style={{ color: c.text, ...type.title, textAlign: 'center' }}>{card.front}</Text>
          <Text style={{ color: c.faint, ...type.helper, textAlign: 'center' }}>{t.flipHint}</Text>
        </Animated.View>
        <Animated.View importantForAccessibility="no-hide-descendants" onLayout={event => setBackHeight(event.nativeEvent.layout.height)} style={[{ position: 'absolute', top: 0, left: 0, right: 0 }, back]}>
          <Text style={{ color: c.text, ...type.body, fontSize: 17, lineHeight: 26, textAlign: 'center' }}>{card.back}</Text>
        </Animated.View>
      </View>
    </Pressable>
    {progress.flipped && !progress.answered && card.confidence ? <View style={{ marginTop: 8 }}>
      <Text style={{ color: c.muted, ...type.label, marginBottom: 8, textAlign: 'center' }}>{t.howSure}</Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>{confidenceOptions.map(item => <View key={item.value} style={{ flex: 1 }}><ChoiceButton label={item.label} onPress={() => onAction({ type: 'confidence', value: item.value })} selected={progress.confidence === item.value} /></View>)}</View>
    </View> : null}
    {progress.answered ? <Text accessibilityLiveRegion="polite" style={{ color: progress.correct ? c.success : c.muted, ...type.helper, textAlign: 'center', marginTop: 8 }}>{progress.correct ? t.knewIt : t.notYet}</Text> : null}
  </CardFrame>;
}
