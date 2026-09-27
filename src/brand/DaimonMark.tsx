import React from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedProps, type SharedValue } from 'react-native-reanimated';
import Svg, { Circle, Path } from 'react-native-svg';

/**
 * assets/daimon-mark.svg with its three parts (orbit arc, ring, star) animatable on the UI thread. The geometry is
 * recomputed inside the SVG rather than rotating views: rotated SVG views drop parts of the arc on Android.
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

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const C = 512;
const ORBIT_R = 318;
// Arc ends in the source drawing: (716, 756) sweeping clockwise the long way round (past the bottom and left) to (671, 237).
const ARC_START = Math.atan2(756 - C, 716 - C);
const ARC_END = Math.atan2(237 - C, 671 - C);
// Star outline as polar points around the centre: four tips at 98 and four waists at ~42.4.
const STAR = [[98, -90], [42.4, -45], [98, 0], [42.4, 45], [98, 90], [42.4, 135], [98, 180], [42.4, 225]] as const;

const polar = (radius: number, radians: number) => {
  'worklet';
  return { x: C + radius * Math.cos(radians), y: C + radius * Math.sin(radians) };
};

export function DaimonMark({ size, motion }: { size: number; motion?: MarkMotion }) {
  const arcProps = useAnimatedProps(() => {
    const turn = ((motion?.orbit?.value ?? 0) * Math.PI) / 180;
    const a = polar(ORBIT_R, ARC_START + turn); const b = polar(ORBIT_R, ARC_END + turn);
    return { d: `M${a.x} ${a.y} A${ORBIT_R} ${ORBIT_R} 0 1 1 ${b.x} ${b.y}` };
  });
  const startDot = useAnimatedProps(() => { const p = polar(ORBIT_R, ARC_START + ((motion?.orbit?.value ?? 0) * Math.PI) / 180); return { cx: p.x, cy: p.y }; });
  const endDot = useAnimatedProps(() => { const p = polar(ORBIT_R, ARC_END + ((motion?.orbit?.value ?? 0) * Math.PI) / 180); return { cx: p.x, cy: p.y }; });
  const ringProps = useAnimatedProps(() => ({ r: 204 * (motion?.ring?.value ?? 1) }));
  const starProps = useAnimatedProps(() => {
    const turn = ((motion?.star?.value ?? 0) * Math.PI) / 180;
    const scale = motion?.starScale?.value ?? 1;
    let d = '';
    for (let i = 0; i < STAR.length; i++) {
      const p = polar(STAR[i][0] * scale, (STAR[i][1] * Math.PI) / 180 + turn);
      d += `${i ? 'L' : 'M'}${p.x} ${p.y}`;
    }
    return { d: `${d}Z` };
  });
  const coreProps = useAnimatedProps(() => ({ r: 19 * (motion?.starScale?.value ?? 1) }));
  return <View style={{ width: size, height: size }} accessible={false} importantForAccessibility="no-hide-descendants">
    <Svg width={size} height={size} viewBox="0 0 1024 1024" fill="none">
      <AnimatedPath animatedProps={arcProps} stroke="#A67DF3" strokeWidth={22} strokeLinecap="round" />
      <AnimatedCircle animatedProps={endDot} r={12} fill="#F4E9CF" />
      <AnimatedCircle animatedProps={startDot} r={10} fill="#A67DF3" />
      <AnimatedCircle animatedProps={ringProps} cx={C} cy={C} stroke="#7652B7" strokeWidth={14} />
      <AnimatedPath animatedProps={starProps} fill="#F4E9CF" />
      <AnimatedCircle animatedProps={coreProps} cx={C} cy={C} fill="#A67DF3" />
    </Svg>
  </View>;
}
