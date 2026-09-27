import React from 'react';
import { Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withSpring, withTiming, useReducedMotion } from 'react-native-reanimated';
import { motion, type } from '../../design/tokens';
import { usePalette } from '../../design/useTheme';
import { useStrings } from '../../i18n/strings';
import type { LessonCard, CardProgress, CardAction } from '../../learning/deck';
import { haptic } from '../../ui/PressableScale';
import { CardFrame, ChoiceButton } from './shared';

export function SwipeCard({ card, progress, onAction }: { card: Extract<LessonCard, { kind: 'swipe' }>; progress: CardProgress; onAction: (action: CardAction) => void; seed: string }) {
  const c = usePalette(); const t = useStrings().lesson; const x = useSharedValue(0); const rotation = useSharedValue(0); const cardWidth = useSharedValue(0); const committed = useSharedValue(false); const reduced = useReducedMotion();
  const answer = (value: boolean) => { if (progress.answered) return; onAction({ type: 'swipe', value }); x.value = reduced ? 0 : withTiming(0, { duration: motion.quick, easing: motion.standard }); rotation.value = reduced ? 0 : withTiming(0, { duration: motion.quick, easing: motion.standard }); };
  const pan = Gesture.Pan().enabled(!progress.answered).activeOffsetX([-10, 10]).failOffsetY([-12, 12]).onBegin(() => { committed.value = false; }).onStart(() => {
    runOnJS(haptic)('light');
  }).onUpdate(event => {
    if (!reduced) {
      x.value = event.translationX;
      rotation.value = Math.max(-8, Math.min(8, event.translationX / 18));
    }
  }).onEnd(event => {
    const shouldCommit = Math.abs(event.translationX) > cardWidth.value * 0.3 || Math.abs(event.velocityX) > 700;
    if (shouldCommit) {
      const direction = Math.abs(event.translationX) > cardWidth.value * 0.3 ? event.translationX : event.velocityX;
      committed.value = true;
      if (!reduced) x.value = withTiming(0, { duration: motion.quick, easing: motion.standard });
      rotation.value = reduced ? 0 : withTiming(0, { duration: motion.quick, easing: motion.standard });
      runOnJS(answer)(direction > 0);
    } else {
      x.value = reduced ? 0 : withSpring(0, motion.settle); rotation.value = reduced ? 0 : withSpring(0, motion.settle);
    }
  }).onFinalize(() => {
    if (!committed.value) {
      x.value = reduced ? 0 : withSpring(0, motion.settle);
      rotation.value = reduced ? 0 : withSpring(0, motion.settle);
    }
  });
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }, { rotate: `${rotation.value}deg` }] }));
  return <GestureDetector gesture={pan}><Animated.View onLayout={event => { cardWidth.value = event.nativeEvent.layout.width; }} style={animatedStyle}>
    <CardFrame>
      <Text style={{ color: c.text, ...type.bodyMedium }}>{card.statement}</Text>
      {!progress.answered ? <View style={{ flexDirection: 'row', gap: 10, marginTop: 18 }}>
        <View style={{ flex: 1 }}><ChoiceButton label={t.false} onPress={() => answer(false)} /></View>
        <View style={{ flex: 1 }}><ChoiceButton label={t.true} onPress={() => answer(true)} /></View>
      </View> : <Text accessibilityLiveRegion="polite" style={{ color: progress.correct ? c.success : c.danger, ...type.helper, marginTop: 14 }}>{progress.correct ? t.correct : t.notQuite} — {card.why}</Text>}
    </CardFrame>
  </Animated.View></GestureDetector>;
}
