import React from 'react';
import { Text, View } from 'react-native';
import { usePalette } from '../../src/design/useTheme';

/** Placeholder route; replaced by the real screen. */
export default function Placeholder() {
  const c = usePalette();
  return <View style={{ flex: 1, backgroundColor: c.canvas, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: c.text }}>settings/personalization</Text></View>;
}
