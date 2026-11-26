import { Image, StyleSheet, View } from 'react-native';
import { Appear } from '../../components/ui/Motion';
import { useTheme } from '../../theme/ThemeProvider';

const SHOTS = {
  today: require('../../assets/landing/today.jpg'),
  plan: require('../../assets/landing/plan.jpg'),
  habits: require('../../assets/landing/habits.jpg'),
};

function Phone({ source, width, style }) {
  const { scheme } = useTheme();
  return (
    <View style={[styles.phone, { width, height: width * 2, borderColor: scheme === 'dark' ? '#2C2C33' : '#1B1C2E' }, style]}>
      <Image source={source} style={styles.shot} resizeMode="cover" />
    </View>
  );
}

/**
 * Real screens from the app, small: Today in front, Plan and Focus tilted behind it. Decorative,
 * so hidden from screen readers.
 */
export function ScreensCollage() {
  return (
    <View style={styles.wrap} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Appear delay={240} distance={16} style={[styles.side, styles.left]}>
        <Phone source={SHOTS.plan} width={104} style={styles.tiltLeft} />
      </Appear>
      <Appear delay={300} distance={16} style={[styles.side, styles.right]}>
        <Phone source={SHOTS.habits} width={104} style={styles.tiltRight} />
      </Appear>
      <Appear delay={150} distance={20}>
        <Phone source={SHOTS.today} width={128} style={styles.front} />
      </Appear>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { height: 272, alignItems: 'center', justifyContent: 'center', marginVertical: 8 },
  phone: { borderRadius: 20, borderWidth: 4, overflow: 'hidden', backgroundColor: '#F3F4FA' },
  shot: { width: '100%', height: '100%' },
  side: { position: 'absolute', top: 30 },
  left: { left: '50%', marginLeft: -150 },
  right: { right: '50%', marginRight: -150 },
  tiltLeft: { transform: [{ rotate: '-7deg' }], opacity: 0.95 },
  tiltRight: { transform: [{ rotate: '7deg' }], opacity: 0.95 },
  front: { boxShadow: '0px 14px 30px rgba(20,24,60,0.22)' },
});
