import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Field';
import { Card } from '../../components/ui/Layout';
import { useAsyncAction } from '../../hooks/useAsyncAction';
import { profileActions } from '../../services/actions';
import { useAuthStore } from '../../store/authStore';
import { useOnboardingStore } from '../../store/onboardingStore';
import { useTheme } from '../../theme/ThemeProvider';
import { checkName, MAX_NAME_LENGTH } from '../../utils/validation';
import { FieldHeading, StepLayout } from './StepLayout';

const SETUP_STEPS = ['Your board and class', 'Your subjects', 'Chapters already taught', 'Upcoming tests', 'Your school day'];

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
      lead="Answer a few quick questions and your plan is ready. You can change anything later."
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
          <Button title="Just look around (demo student)" variant="ghost" onPress={demo.execute} loading={demo.pending} testID="onboarding-demo" />
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
      <Text style={{ color: colors.textSecondary, fontSize: 12.5, paddingHorizontal: 2 }}>This is how the planner greets you. You can change it later in Profile.</Text>
      <Card style={styles.steps}>
        <View style={styles.stepsHead}>
          <Text style={[styles.stepsTitle, { color: colors.text }]}>What we’ll ask</Text>
          <Text style={[styles.stepsTime, { color: colors.textSecondary }]}>about 2 min</Text>
        </View>
        {SETUP_STEPS.map((label, index) => (
          <View key={label} style={styles.stepRow}>
            <View style={styles.stepRail}>
              <View style={[styles.stepNumber, { borderColor: index ? colors.fillStrong : colors.tint, backgroundColor: index ? 'transparent' : colors.tint }]}>
                <Text style={[styles.stepNumberText, { color: index ? colors.textSecondary : colors.onTint }]}>{index + 1}</Text>
              </View>
              {index < SETUP_STEPS.length - 1 ? <View style={[styles.line, { backgroundColor: colors.separator }]} /> : null}
            </View>
            <Text style={[styles.stepText, { color: index ? colors.textSecondary : colors.text, fontWeight: index ? '500' : '700' }]}>{label}</Text>
          </View>
        ))}
      </Card>
    </StepLayout>
  );
}

const styles = StyleSheet.create({
  steps: { marginTop: 6, paddingBottom: 10 },
  stepsHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 },
  stepsTitle: { fontSize: 15, fontWeight: '800' },
  stepsTime: { fontSize: 12, fontWeight: '600' },
  stepRow: { flexDirection: 'row', gap: 12, minHeight: 34 },
  stepRail: { alignItems: 'center', width: 24 },
  stepNumber: { width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  stepNumberText: { fontSize: 12, fontWeight: '800' },
  line: { width: 1.5, flex: 1, marginVertical: 2 },
  stepText: { fontSize: 14.5, paddingTop: 2 },
});
