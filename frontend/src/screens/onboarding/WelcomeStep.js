import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Field';
import { Icon } from '../../components/ui/Icon';
import { useAsyncAction } from '../../hooks/useAsyncAction';
import { profileActions } from '../../services/actions';
import { useAuthStore } from '../../store/authStore';
import { useOnboardingStore } from '../../store/onboardingStore';
import { useTheme } from '../../theme/ThemeProvider';
import { checkName, MAX_NAME_LENGTH } from '../../utils/validation';
import { FieldHeading, StepLayout } from './StepLayout';

export function WelcomeStep({ navigation }) {
  const { colors } = useTheme();
  const googleName = useAuthStore((state) => state.user?.name);
  const logout = useAuthStore((state) => state.logout);
  const draftName = useOnboardingStore((state) => state.draft.name);
  const update = useOnboardingStore((state) => state.update);
  // Until the student types, the name Google gave us is filled in for them.
  const name = draftName ?? googleName ?? '';
  const [error, setError] = useState(null);

  const confirmName = () => {
    const checked = checkName(name);
    setError(checked.error ?? null);
    if (checked.name) update({ name: checked.name });
    return checked.name;
  };
  const demo = useAsyncAction(async () => {
    const confirmed = confirmName();
    if (confirmed) await profileActions.loadDemo(confirmed);
  });

  return (
    <StepLayout
      title={`Hi ${name.trim() || 'there'}.\nLet’s build your plan.`}
      lead="Pick your board and class and every chapter is ready for you. You decide when to study each one."
      footer={
        <>
          <Button
            title="Get started"
            variant="primary"
            block
            onPress={() => {
              if (confirmName()) navigation.navigate('ClassStep');
            }}
            testID="onboarding-start"
          />
          <Button title="Skip and use the demo student" variant="ghost" onPress={demo.execute} loading={demo.pending} testID="onboarding-demo" />
          <Button title="Sign out" variant="ghost" size="sm" onPress={logout} />
        </>
      }
    >
      <FieldHeading>Your name</FieldHeading>
      <Input
        value={name}
        onChangeText={(text) => {
          setError(null);
          update({ name: text });
        }}
        placeholder="What should we call you?"
        maxLength={MAX_NAME_LENGTH}
        autoCapitalize="words"
        autoComplete="name"
        textContentType="name"
        returnKeyType="done"
        accessibilityLabel="Your name"
        error={error}
        testID="field-name"
      />
      <Text style={{ color: colors.textSecondary, fontSize: 13, paddingHorizontal: 4 }}>This is how the planner greets you. You can change it later in Profile.</Text>
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
