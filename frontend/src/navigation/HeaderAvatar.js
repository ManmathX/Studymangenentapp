import { useNavigation } from '@react-navigation/native';
import { Pressable, StyleSheet, Text } from 'react-native';
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
    <Pressable
      onPress={() => navigation.navigate('Profile')}
      accessibilityRole="button"
      accessibilityLabel="Profile: appearance, privacy and account"
      hitSlop={8}
      style={[styles.avatar, { backgroundColor: colors.tint }]}
    >
      <Text style={styles.initial}>{initialOf(name)}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  avatar: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', marginHorizontal: 12 },
  initial: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
