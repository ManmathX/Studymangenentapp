import { memo, useId } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

/**
 * A diagonal colour gradient that fills its parent, drawn with react-native-svg so it needs no
 * extra native module. `colors` runs top-left to bottom-right. `bubbles` adds soft decorative circles.
 */
export const Gradient = memo(function Gradient({ colors, bubbles = false }) {
  const id = `grad${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg width="100%" height="100%" aria-hidden>
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            {colors.map((color, index) => (
              <Stop key={`${color}${index}`} offset={colors.length === 1 ? 0 : index / (colors.length - 1)} stopColor={color} />
            ))}
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill={`url(#${id})`} />
        {bubbles ? (
          <>
            <Circle cx="92%" cy="8%" r="70" fill="#FFFFFF" fillOpacity={0.1} />
            <Circle cx="78%" cy="105%" r="46" fill="#FFFFFF" fillOpacity={0.08} />
            <Circle cx="4%" cy="96%" r="26" fill="#FFFFFF" fillOpacity={0.07} />
          </>
        ) : null}
      </Svg>
    </View>
  );
});
