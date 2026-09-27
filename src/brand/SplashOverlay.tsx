import * as SplashScreen from 'expo-splash-screen';
import React, { useCallback, useRef, useState } from 'react';
import { Platform, View } from 'react-native';
import Animated, { Easing, ReduceMotion, runOnJS, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { DaimonMark } from './DaimonMark';

/**
 * Takes over from the native splash on the same frame (same canvas, same mark, same place), then spins the orbit
 * once and zooms through into the app. About half a second; with reduced motion it only fades.
 */
// Native splash mark box: expo-splash-screen draws the 1024 px image 200 pt wide on iOS; the Android drawable is
// 288 dp (864 px at xxhdpi).
export const SPLASH_MARK_SIZE = Platform.OS === 'ios' ? 200 : 288;

export function SplashOverlay({ background }: { background: string }) {
  const [done, setDone] = useState(false);
  const reduced = useReducedMotion();
  const started = useRef(false);
  const orbit = useSharedValue(0); const star = useSharedValue(0); const ring = useSharedValue(1); const starScale = useSharedValue(1);
  const markScale = useSharedValue(1); const markOpacity = useSharedValue(1); const veil = useSharedValue(1);
  const finish = useCallback(() => setDone(true), []);

  const start = useCallback(() => {
    if (started.current) return;
    started.current = true;
    // Hide the native splash only once this identical frame is on screen.
    requestAnimationFrame(() => {
      void SplashScreen.hideAsync().catch(() => undefined);
      if (reduced) {
        veil.value = withTiming(0, { duration: 200, reduceMotion: ReduceMotion.Never }, ok => { if (ok) runOnJS(finish)(); });
        return;
      }
      const spin = Easing.bezier(0.6, 0, 0.2, 1);
      orbit.value = withTiming(360, { duration: 560, easing: spin });
      star.value = withTiming(-90, { duration: 520, easing: spin });
      starScale.value = withSequence(withTiming(1.28, { duration: 200, easing: Easing.out(Easing.quad) }), withSpring(1, { damping: 12, stiffness: 240 }));
      ring.value = withSequence(withTiming(1.1, { duration: 220 }), withTiming(0.96, { duration: 200 }));
      markScale.value = withDelay(260, withTiming(1.9, { duration: 340, easing: Easing.in(Easing.cubic) }));
      markOpacity.value = withDelay(300, withTiming(0, { duration: 260 }));
      veil.value = withDelay(320, withTiming(0, { duration: 300, easing: Easing.out(Easing.quad) }, ok => { if (ok) runOnJS(finish)(); }));
    });
  }, [finish, markOpacity, markScale, orbit, reduced, ring, star, starScale, veil]);

  const veilStyle = useAnimatedStyle(() => ({ opacity: veil.value }));
  const markStyle = useAnimatedStyle(() => ({ opacity: markOpacity.value, transform: [{ scale: markScale.value }] }));
  if (done) return null;
  return <View pointerEvents="none" style={{ position: 'absolute', inset: 0, zIndex: 2000, elevation: 40 }} onLayout={start}>
    <Animated.View style={[{ position: 'absolute', inset: 0, backgroundColor: background }, veilStyle]} />
    <View style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={markStyle}><DaimonMark size={SPLASH_MARK_SIZE} motion={{ orbit, star, ring, starScale }} /></Animated.View>
    </View>
  </View>;
}
