import React, { useEffect } from 'react';
import { Text, View } from 'react-native';
import Animated, { Easing, FadeIn, cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withTiming, type SharedValue } from 'react-native-reanimated';
import { type } from '../design/tokens';
import { usePalette } from '../design/useTheme';
import { useStrings } from '../i18n/strings';
import { Icon } from '../ui/icons';
import { IconButton } from '../ui/IconButton';
import { toast } from '../ui/overlays';

const BARS = 22;

function Bar({ index, clock, color }: { index: number; clock: SharedValue<number>; color: string }) {
  const style = useAnimatedStyle(() => {
    const phase = clock.value * Math.PI * 2;
    const level = 0.25 + 0.75 * Math.abs(Math.sin(phase * 1.3 + index * 0.55) * Math.cos(phase * 0.7 + index * 0.21));
    return { height: 4 + level * 18 };
  });
  return <Animated.View style={[{ width: 3, borderRadius: 1.5, backgroundColor: color }, style]} />;
}

/**
 * The reference's recording bar: cancel, a live waveform, stop. The speech engine is not chosen yet (on-device
 * versus transcription on the study servers), so this is a labelled preview that never pretends to transcribe.
 */
export function DictationBar({ onClose }: { onClose: () => void }) {
  const c = usePalette(); const t = useStrings();
  const clock = useSharedValue(0);
  useEffect(() => {
    clock.value = withRepeat(withTiming(1, { duration: 2400, easing: Easing.linear }), -1);
    return () => cancelAnimation(clock);
  }, [clock]);
  const close = () => { onClose(); toast(t.dictationUnavailable); };
  return <Animated.View entering={FadeIn.duration(180)} style={{ height: 58, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6, gap: 6 }}>
    <IconButton label={t.cancelDictation} onPress={onClose} size={40}><Icon name="x" size={20} color={c.text} /></IconButton>
    <View style={{ flex: 1, alignItems: 'center', gap: 3 }}>
      <View accessible={false} style={{ height: 24, flexDirection: 'row', alignItems: 'center', gap: 3 }}>
        {Array.from({ length: BARS }, (_, index) => <Bar key={index} index={index} clock={clock} color={c.muted} />)}
      </View>
      <Text numberOfLines={1} style={{ ...type.helper, fontSize: 11, lineHeight: 14, color: c.faint }}>{t.dictationPreview}</Text>
    </View>
    <IconButton label={t.stopDictation} onPress={close} variant="inverse" size={36}><View style={{ width: 12, height: 12, borderRadius: 2.5, backgroundColor: c.canvas }} /></IconButton>
  </Animated.View>;
}
