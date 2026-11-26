import { useNavigation } from '@react-navigation/native';
import { StyleSheet, Text, View } from 'react-native';
import { Gradient } from '../components/ui/Gradient';
import { PressableScale } from '../components/ui/Motion';
import { ThemeToggle } from '../components/ui/ThemeToggle';
import { useAuthStore } from '../store/authStore';
import { useResourceStore } from '../store/resourceStore';
import { useTheme } from '../theme/ThemeProvider';
import { initialOf } from '../utils/format';

export function HeaderAvatar() {
  const navigation = useNavigation();
  // The name the student chose for their plan; their Google name until the profile loads.
  const planName = useResourceStore((state) => state.entries.profile?.data?.name);
  const accountName = useAuthStore((state) => state.user?.name);
  const name = planName ?? accountName;
  const { colors } = useTheme();
  return (
    <View style={styles.row}>
      <ThemeToggle />
      <PressableScale
        onPress={() => navigation.navigate('Profile')}
        accessibilityRole="button"
        accessibilityLabel="Profile: privacy and account"
        hitSlop={8}
        scaleTo={0.88}
        style={styles.avatar}
      >
        <Gradient colors={colors.hero} />
        <Text style={styles.initial}>{initialOf(name)}</Text>
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 4, marginRight: 14 },
  avatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  initial: { color: '#fff', fontWeight: '800', fontSize: 16 },
});
