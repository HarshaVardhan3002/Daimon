import React from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import Svg, { Circle, Path } from 'react-native-svg';

/**
 * assets/daimon-mark.svg split into three layers (orbit arc, ring, star) so each can move on its own.
 * Every value is a SharedValue so the splash and welcome screens can drive them on the UI thread.
 * At rest (all defaults) the drawing is identical to the static mark used by the native splash.
 */
export type MarkMotion = {
  /** Degrees; the orbit arc and its end dots. */
  orbit?: SharedValue<number>;
  /** Degrees; the four-point star. */
  star?: SharedValue<number>;
  ring?: SharedValue<number>;
  starScale?: SharedValue<number>;
};

const VIEW = '0 0 1024 1024';
const layer = { position: 'absolute', left: 0, top: 0, right: 0, bottom: 0 } as const;

export function DaimonMark({ size, motion }: { size: number; motion?: MarkMotion }) {
  const orbitStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${motion?.orbit?.value ?? 0}deg` }] }));
  const ringStyle = useAnimatedStyle(() => ({ transform: [{ scale: motion?.ring?.value ?? 1 }] }));
  const starStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${motion?.star?.value ?? 0}deg` }, { scale: motion?.starScale?.value ?? 1 }] }));
  return <View style={{ width: size, height: size }} accessible={false} importantForAccessibility="no-hide-descendants">
    <Animated.View style={[layer, orbitStyle]}>
      <Svg width={size} height={size} viewBox={VIEW} fill="none">
        <Path d="M716 756 A318 318 0 1 0 671 237" stroke="#A67DF3" strokeWidth={22} strokeLinecap="round" />
        <Circle cx={671} cy={237} r={12} fill="#F4E9CF" />
        <Circle cx={716} cy={756} r={10} fill="#A67DF3" />
      </Svg>
    </Animated.View>
    <Animated.View style={[layer, ringStyle]}>
      <Svg width={size} height={size} viewBox={VIEW} fill="none">
        <Circle cx={512} cy={512} r={204} stroke="#7652B7" strokeWidth={14} />
      </Svg>
    </Animated.View>
    <Animated.View style={[layer, starStyle]}>
      <Svg width={size} height={size} viewBox={VIEW} fill="none">
        <Path d="M512 414 542 482 610 512 542 542 512 610 482 542 414 512 482 482Z" fill="#F4E9CF" />
        <Circle cx={512} cy={512} r={19} fill="#A67DF3" />
      </Svg>
    </Animated.View>
  </View>;
}
