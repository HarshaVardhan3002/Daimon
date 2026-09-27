import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { cancelAnimation, Easing, FadeIn, FadeInDown, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { DaimonMark } from '../src/brand/DaimonMark';
import { font, motion, type as textType } from '../src/design/tokens';
import { usePalette } from '../src/design/useTheme';
import { useScreenStrings } from '../src/i18n/screens';
import { setLocale, useApp } from '../src/state/appStore';
import { Button } from '../src/ui/Button';
import { PressableScale } from '../src/ui/PressableScale';

export default function WelcomeScreen() {
  const palette = usePalette();
  const t = useScreenStrings();
  const insets = useSafeAreaInsets();
  const locale = useApp(state => state.locale);
  const reducedMotion = useReducedMotion();
  const [typed, setTyped] = useState(reducedMotion ? t.welcome.phrases[0] : '');
  const orbit = useSharedValue(0);
  const starScale = useSharedValue(1);
  const markScale = useSharedValue(reducedMotion ? 1 : 0.9);
  const markStyle = useAnimatedStyle(() => ({ transform: [{ scale: markScale.value }] }));

  useEffect(() => {
    if (reducedMotion) {
      setTyped(t.welcome.phrases[0]);
      return;
    }
    let timer: ReturnType<typeof setTimeout>;
    let index = 0;
    let length = 0;
    let deleting = false;
    const phraseAt = (position: number) => t.welcome.phrases[position % t.welcome.phrases.length] ?? '';
    const tick = () => {
      const phrase = phraseAt(index);
      if (!deleting) {
        length = Math.min(phrase.length, length + 1);
        setTyped(phrase.slice(0, length));
        if (length >= phrase.length) {
          deleting = true;
          timer = setTimeout(tick, 1600);
        } else timer = setTimeout(tick, 38);
      } else {
        length = Math.max(0, length - 2);
        setTyped(phrase.slice(0, length));
        if (length === 0) {
          deleting = false;
          index = (index + 1) % t.welcome.phrases.length;
          timer = setTimeout(tick, 150);
        } else timer = setTimeout(tick, 18);
      }
    };
    timer = setTimeout(tick, 38);
    return () => clearTimeout(timer);
  }, [reducedMotion, t.welcome.phrases]);

  useEffect(() => {
    if (reducedMotion) {
      orbit.value = 0;
      starScale.value = 1;
      markScale.value = 1;
      return;
    }
    orbit.value = withRepeat(withTiming(360, { duration: 14000, easing: Easing.linear }), -1, false);
    starScale.value = withRepeat(withSequence(
      withTiming(1.08, { duration: 1500, easing: motion.standard }),
      withTiming(1, { duration: 1500, easing: motion.standard }),
    ), -1, false);
    markScale.value = withSpring(1, motion.spring);
    return () => {
      cancelAnimation(orbit);
      cancelAnimation(starScale);
      cancelAnimation(markScale);
    };
  }, [markScale, orbit, reducedMotion, starScale]);

  return <View style={{ flex: 1, backgroundColor: palette.canvas, paddingTop: insets.top + 12, paddingBottom: Math.max(insets.bottom, 18) + 12, paddingHorizontal: 28 }}>
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View entering={FadeIn.duration(motion.container).easing(motion.enter)} style={markStyle}>
        <DaimonMark size={112} motion={{ orbit, starScale }} />
      </Animated.View>
      <Animated.View entering={FadeInDown.delay(70).duration(motion.container).easing(motion.enter)} style={{ marginTop: 38, justifyContent: 'flex-start', alignSelf: 'stretch', position: 'relative' }}>
        <Text accessible={false} importantForAccessibility="no-hide-descendants" style={{ ...textType.display, fontSize: 30, lineHeight: 36, fontFamily: font.semibold, color: palette.text, textAlign: 'center', opacity: 0 }}>
          {t.welcome.phrases.reduce((longest, phrase) => phrase.length > longest.length ? phrase : longest, '')}●
        </Text>
        <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 0 }}>
          <Text accessibilityRole="header" style={{ ...textType.display, fontSize: 30, lineHeight: 36, fontFamily: font.semibold, color: palette.text, textAlign: 'center' }}>
            {typed}<Text style={{ color: palette.text }}>●</Text>
          </Text>
        </View>
      </Animated.View>
    </View>
    <Animated.View entering={FadeInDown.delay(140).duration(motion.container).easing(motion.enter).withInitialValues({ opacity: 0, transform: [{ translateY: 12 }] })} style={{ gap: 18 }}>
      <Button label={t.welcome.signIn} onPress={() => router.push('/sign-in')} />
      <View accessibilityRole="radiogroup" accessibilityLabel={t.welcome.language} style={{ alignSelf: 'center', flexDirection: 'row', borderRadius: 999, padding: 3, backgroundColor: palette.surface }}>
        <PressableScale accessibilityRole="radio" accessibilityState={{ checked: locale === 'en' }} accessibilityLabel={t.common.english} onPress={() => setLocale('en')} scaleTo={0.98}
          style={{ minHeight: 44, minWidth: 94, paddingHorizontal: 14, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: locale === 'en' ? palette.selected : undefined }}>
          <Text style={{ ...textType.label, color: locale === 'en' ? palette.text : palette.muted }}>{t.common.english}</Text>
        </PressableScale>
        <PressableScale accessibilityRole="radio" accessibilityState={{ checked: locale === 'de' }} accessibilityLabel={t.common.german} onPress={() => setLocale('de')} scaleTo={0.98}
          style={{ minHeight: 44, minWidth: 94, paddingHorizontal: 14, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: locale === 'de' ? palette.selected : undefined }}>
          <Text style={{ ...textType.label, color: locale === 'de' ? palette.text : palette.muted }}>{t.common.german}</Text>
        </PressableScale>
      </View>
      <Text style={{ ...textType.helper, color: palette.muted, textAlign: 'center', maxWidth: 320, alignSelf: 'center' }}>{t.welcome.helper}</Text>
    </Animated.View>
  </View>;
}
