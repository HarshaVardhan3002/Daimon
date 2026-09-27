import React from 'react';
import { View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

/** assets/daimon-mark.svg, drawn natively. It is the same drawing as the native splash image. */
export function DaimonMark({ size }: { size: number }) {
  return <View style={{ width: size, height: size }} accessible={false} importantForAccessibility="no-hide-descendants">
    <Svg width={size} height={size} viewBox="0 0 1024 1024" fill="none">
      <Path d="M716 756 A318 318 0 1 1 671 237" stroke="#A67DF3" strokeWidth={22} strokeLinecap="round" />
      <Circle cx={671} cy={237} r={12} fill="#F4E9CF" />
      <Circle cx={716} cy={756} r={10} fill="#A67DF3" />
      <Circle cx={512} cy={512} r={204} stroke="#7652B7" strokeWidth={14} />
      <Path d="M512 414 542 482 610 512 542 542 512 610 482 542 414 512 482 482Z" fill="#F4E9CF" />
      <Circle cx={512} cy={512} r={19} fill="#A67DF3" />
    </Svg>
  </View>;
}
