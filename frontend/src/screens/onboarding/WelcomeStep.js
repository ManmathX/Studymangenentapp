import { StyleSheet, Text, View } from 'react-native';
import { Button } from '../../components/ui/Button';
import { Icon } from '../../components/ui/Icon';
import { useAsyncAction } from '../../hooks/useAsyncAction';
import { profileActions } from '../../services/actions';
import { useAuthStore } from '../../store/authStore';
import { useTheme } from '../../theme/ThemeProvider';
import { StepLayout } from './StepLayout';

export function WelcomeStep({ navigation }) {
  const { colors } = useTheme();
  const name = useAuthStore((state) => state.user?.name);
  const logout = useAuthStore((state) => state.logout);
  const demo = useAsyncAction(() => profileActions.loadDemo());

  return (
    <StepLayout
      title={`Hi ${name ?? 'there'}.\nLet’s build your plan.`}
      lead="Pick your board and class and every chapter is ready for you. You decide when to study each one."
      footer={
        <>
          <Button title="Get started" variant="primary" block onPress={() => navigation.navigate('ClassStep')} testID="onboarding-start" />
          <Button title="Skip and use the demo student" variant="ghost" onPress={demo.execute} loading={demo.pending} testID="onboarding-demo" />
          <Button title="Sign out" variant="ghost" size="sm" onPress={logout} />
        </>
      }
    >
      <View style={[styles.hero, { backgroundColor: colors.card }]}>
        <View style={[styles.icon, { backgroundColor: colors.tint }]}>
          <Icon name="plan" size={30} color="#fff" strokeWidth={2.5} />
        </View>
        <Text style={{ color: colors.textSecondary, fontSize: 15, lineHeight: 21, flex: 1 }}>
          Five quick steps: class, subjects, what’s been taught, upcoming tests, and your school day.
        </Text>
      </View>
    </StepLayout>
  );
}

const styles = StyleSheet.create({
  hero: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderRadius: 16, marginTop: 12 },
  icon: { width: 56, height: 56, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
});
