import * as SplashScreen from 'expo-splash-screen';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, View } from 'react-native';
import Animated, { Easing, ReduceMotion, runOnJS, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { DaimonMark } from './DaimonMark';

/**
 * Takes over from the native splash on the same frame (same canvas, same mark, same place) from the first commit,
 * holds while the app loads, then fades into the app once `ready` (about a third of a second).
 */
// Native splash mark box: expo-splash-screen draws the 1024 px image 200 pt wide on iOS; the Android drawable is
// 288 dp (864 px at xxhdpi).
export const SPLASH_MARK_SIZE = Platform.OS === 'ios' ? 200 : 288;

export function SplashOverlay({ background, ready }: { background: string; ready: boolean }) {
  const [done, setDone] = useState(false);
  const reduced = useReducedMotion();
  const [laidOut, setLaidOut] = useState(false);
  const started = useRef(false);
  const markScale = useSharedValue(1); const markOpacity = useSharedValue(1); const veil = useSharedValue(1);
  const finish = useCallback(() => setDone(true), []);

  // Hide the native splash only once this identical frame is on screen; whatever hides it first, nothing flashes.
  const onLayout = useCallback(() => { requestAnimationFrame(() => { void SplashScreen.hideAsync().catch(() => undefined); setLaidOut(true); }); }, []);
  const start = useCallback(() => {
    if (started.current) return;
    started.current = true;
    requestAnimationFrame(() => {
      if (reduced) {
        veil.value = withTiming(0, { duration: 200, reduceMotion: ReduceMotion.Never }, ok => { if (ok) runOnJS(finish)(); });
        return;
      }
      // A quiet hand-off: the mark eases back a touch as it fades, then the canvas dissolves into the app.
      const ease = Easing.out(Easing.cubic);
      markScale.value = withTiming(0.96, { duration: 260, easing: ease });
      markOpacity.value = withTiming(0, { duration: 220, easing: ease });
      veil.value = withDelay(120, withTiming(0, { duration: 260, easing: ease }, ok => { if (ok) runOnJS(finish)(); }));
    });
  }, [finish, markOpacity, markScale, reduced, veil]);

  useEffect(() => { if (ready && laidOut) start(); }, [laidOut, ready, start]);

  const veilStyle = useAnimatedStyle(() => ({ opacity: veil.value }));
  const markStyle = useAnimatedStyle(() => ({ opacity: markOpacity.value, transform: [{ scale: markScale.value }] }));
  if (done) return null;
  return <View pointerEvents="none" style={{ position: 'absolute', inset: 0, zIndex: 2000, elevation: 40 }} onLayout={onLayout}>
    <Animated.View style={[{ position: 'absolute', inset: 0, backgroundColor: background }, veilStyle]} />
    <View style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={markStyle}><DaimonMark size={SPLASH_MARK_SIZE} /></Animated.View>
    </View>
  </View>;
}
