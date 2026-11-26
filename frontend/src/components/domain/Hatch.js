import { memo, useId } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Defs, Line, Pattern, Rect } from 'react-native-svg';
import { useTheme } from '../../theme/ThemeProvider';

/** Soft light-grey diagonal stripes that fill their parent; marks "in progress". */
export const Hatch = memo(function Hatch({ gap = 6 }) {
  const { colors } = useTheme();
  const id = `hatch${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg width="100%" height="100%" aria-hidden>
        <Defs>
          <Pattern id={id} width={gap} height={gap} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <Line x1="0" y1="0" x2="0" y2={gap} stroke={colors.fillStrong} strokeWidth={gap / 2} strokeOpacity={0.9} />
          </Pattern>
        </Defs>
        <Rect width="100%" height="100%" fill={colors.card} fillOpacity={0.85} />
        <Rect width="100%" height="100%" fill={`url(#${id})`} />
      </Svg>
    </View>
  );
});
