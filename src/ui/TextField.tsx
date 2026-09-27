import React, { forwardRef, useEffect, useState } from 'react';
import { Text, TextInput, View, type TextInputProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import { font, motion, radius, type as textType } from '../design/tokens';
import { usePalette } from '../design/useTheme';
import { Icon } from './icons';

type Props = Omit<TextInputProps, 'placeholder'> & {
  label: string;
  error?: string;
  trailing?: React.ReactNode;
  shakeKey?: number;
  containerStyle?: StyleProp<ViewStyle>;
};

export const TextField = forwardRef<TextInput, Props>(function TextField({ label, error, trailing, shakeKey = 0, containerStyle, value, defaultValue, onFocus, onBlur, multiline, ...inputProps }, ref) {
  const palette = usePalette();
  const [focused, setFocused] = useState(false);
  const [internalValue, setInternalValue] = useState(typeof defaultValue === 'string' ? defaultValue : '');
  const currentValue = typeof value === 'string' ? value : internalValue;
  const raised = focused || currentValue.length > 0;
  const float = useSharedValue(raised ? 1 : 0);
  const shake = useSharedValue(0);

  useEffect(() => { float.value = withTiming(raised ? 1 : 0, { duration: motion.quick, easing: motion.standard }); }, [float, raised]);
  useEffect(() => {
    if (shakeKey > 0) shake.value = withSequence(
      withTiming(-4, { duration: 35 }), withTiming(4, { duration: 55 }),
      withTiming(-3, { duration: 50 }), withTiming(0, { duration: 60 }),
    );
  }, [shake, shakeKey]);
  const labelStyle = useAnimatedStyle(() => ({
    top: 18 - float.value * 12,
    fontSize: 15 - float.value * 3,
    lineHeight: 20 - float.value * 4,
    color: focused ? palette.accent : raised ? palette.muted : palette.faint,
  }), [focused, palette.accent, palette.faint, palette.muted]);
  const fieldStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shake.value }] }));

  return <View style={containerStyle}>
    <Animated.View style={[{ minHeight: multiline ? 120 : 56, borderWidth: 1, borderColor: focused ? palette.accent : error ? palette.danger : palette.line, borderRadius: radius.row + 2, backgroundColor: palette.canvas, flexDirection: 'row', alignItems: multiline ? 'flex-start' : 'center', paddingHorizontal: 16 }, fieldStyle]}>
      <Animated.Text pointerEvents="none" style={[{ position: 'absolute', left: 16, zIndex: 1, fontFamily: font.medium }, labelStyle]}>{label}</Animated.Text>
      <TextInput
        {...inputProps}
        ref={ref}
        value={value}
        defaultValue={defaultValue}
        multiline={multiline}
        onChangeText={text => { setInternalValue(text); inputProps.onChangeText?.(text); }}
        onFocus={event => { setFocused(true); onFocus?.(event); }}
        onBlur={event => { setFocused(false); onBlur?.(event); }}
        accessibilityLabel={inputProps.accessibilityLabel ?? label}
        placeholder={undefined}
        placeholderTextColor={palette.faint}
        selectionColor={palette.accent}
        cursorColor={palette.accent}
        style={[{ flex: 1, color: palette.text, fontFamily: font.regular, fontSize: 16, lineHeight: 23, paddingHorizontal: 0, paddingTop: raised ? 20 : 12, paddingBottom: multiline ? 12 : 10, minHeight: multiline ? 118 : 54, textAlignVertical: multiline ? 'top' : 'center' }, inputProps.style]}
      />
      {trailing ? <View style={{ marginLeft: 6, alignSelf: multiline ? 'flex-start' : 'center', marginTop: multiline ? 7 : 0 }}>{trailing}</View> : null}
    </Animated.View>
    {error ? <View accessibilityLiveRegion="polite" style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 }}>
      <Icon name="alert-circle" size={14} color={palette.danger} />
      <Text style={{ ...textType.helper, color: palette.danger, flex: 1 }}>{error}</Text>
    </View> : null}
  </View>;
});
