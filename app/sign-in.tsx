import React, { useCallback, useRef, useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { font, motion, type as textType } from '../src/design/tokens';
import { usePalette } from '../src/design/useTheme';
import { useScreenStrings } from '../src/i18n/screens';
import { signIn, SignInError } from '../src/state/accountStore';
import { Button } from '../src/ui/Button';
import { IconButton } from '../src/ui/IconButton';
import { Icon } from '../src/ui/icons';
import { haptic } from '../src/ui/PressableScale';
import { TextField } from '../src/ui/TextField';

export default function SignInScreen() {
  const palette = usePalette();
  const t = useScreenStrings();
  const insets = useSafeAreaInsets();
  const passwordRef = useRef<TextInput>(null);
  const [participantId, setParticipantId] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [idError, setIdError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [busy, setBusy] = useState(false);
  const [idShake, setIdShake] = useState(0);
  const [passwordShake, setPasswordShake] = useState(0);

  const submit = useCallback(async () => {
    if (busy || !participantId.trim() || !password) return;
    setBusy(true);
    setIdError('');
    setPasswordError('');
    try {
      await signIn(participantId, password);
      haptic('success');
    } catch (error) {
      haptic('warning');
      if (error instanceof SignInError && error.code === 'invalid_id') {
        setIdError(t.signIn.invalidId);
        setIdShake(value => value + 1);
      } else if (error instanceof SignInError && error.code === 'invalid_password') {
        setPasswordError(t.signIn.invalidPassword);
        setPasswordShake(value => value + 1);
      } else {
        setPasswordError(t.signIn.failed);
        setPasswordShake(value => value + 1);
      }
    } finally {
      setBusy(false);
    }
  }, [busy, participantId, password, t.signIn.failed, t.signIn.invalidId, t.signIn.invalidPassword]);

  return <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: palette.canvas }}>
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ flexGrow: 1, paddingTop: insets.top + 10, paddingHorizontal: 24, paddingBottom: 20 }}
    >
      <Animated.View entering={FadeInDown.duration(motion.container).easing(motion.enter)}>
        <IconButton size={44} label={t.common.back} onPress={() => router.back()}>
          <Icon name="arrow-left" color={palette.text} />
        </IconButton>
        <Text accessibilityRole="header" style={{ ...textType.display, fontSize: 30, lineHeight: 38, color: palette.text, marginTop: 28 }}>{t.signIn.title}</Text>
        <Text style={{ ...textType.body, color: palette.muted, marginTop: 8, maxWidth: 420 }}>{t.signIn.subtitle}</Text>
      </Animated.View>

      <View style={{ marginTop: 32, gap: 18 }}>
        <TextField
          label={t.signIn.participantId}
          value={participantId}
          onChangeText={value => { setParticipantId(value); if (idError) setIdError(''); }}
          editable={!busy}
          error={idError}
          shakeKey={idShake}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="username"
          textContentType="username"
          returnKeyType="next"
          onSubmitEditing={() => passwordRef.current?.focus()}
          accessibilityLabel={t.signIn.participantId}
        />
        <TextField
          ref={passwordRef}
          label={t.signIn.password}
          value={password}
          onChangeText={value => { setPassword(value); if (passwordError) setPasswordError(''); }}
          editable={!busy}
          error={passwordError}
          shakeKey={passwordShake}
          secureTextEntry={!showPassword}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="current-password"
          textContentType="password"
          returnKeyType="go"
          onSubmitEditing={() => void submit()}
          accessibilityLabel={t.signIn.password}
          trailing={<IconButton size={44} label={showPassword ? t.signIn.hidePassword : t.signIn.showPassword} disabled={busy} onPress={() => setShowPassword(value => !value)}>
            <Icon name={showPassword ? 'eye-off' : 'eye'} color={palette.muted} />
          </IconButton>}
        />
      </View>

      <View style={{ flex: 1, justifyContent: 'flex-end', paddingTop: 28 }}>
        <Button label={busy ? t.signIn.loading : t.signIn.continue} onPress={() => void submit()} disabled={!participantId.trim() || !password} loading={busy} />
      </View>
    </ScrollView>

    <View style={{ alignItems: 'center', paddingHorizontal: 16, paddingTop: 8, paddingBottom: Math.max(insets.bottom, 8), backgroundColor: palette.canvas }}>
        <View accessibilityRole="text" style={{ minHeight: 38, maxWidth: '100%', borderRadius: 999, borderWidth: 1, borderColor: palette.line, paddingHorizontal: 13, paddingVertical: 7, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Icon name="info" size={15} color={palette.muted} />
          <Text style={{ ...textType.helper, fontFamily: font.medium, color: palette.muted, flexShrink: 1 }}>{t.signIn.development}</Text>
        </View>
    </View>
  </KeyboardAvoidingView>;
}
