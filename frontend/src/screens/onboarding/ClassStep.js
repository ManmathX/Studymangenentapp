import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Button } from '../../components/ui/Button';
import { SegmentedControl } from '../../components/ui/Controls';
import { ErrorState, LoadingState } from '../../components/ui/States';
import { useResource } from '../../hooks/useResource';
import { resources } from '../../services/resources';
import { useOnboardingStore } from '../../store/onboardingStore';
import { useTheme } from '../../theme/ThemeProvider';
import { FieldHeading, StepLayout } from './StepLayout';

export function ClassStep({ navigation }) {
  const { colors, radius } = useTheme();
  const classes = useResource(resources.syllabusClasses);
  const cls = useOnboardingStore((state) => state.draft.cls);
  const setClass = useOnboardingStore((state) => state.setClass);

  return (
    <StepLayout
      step={1}
      title="Board and class"
      lead="We load the chapters from your NCERT books."
      footer={<Button title="Continue" variant="primary" block disabled={!cls} onPress={() => navigation.navigate('SubjectsStep')} testID="class-continue" />}
    >
      <FieldHeading>Board</FieldHeading>
      <SegmentedControl
        label="Board"
        value="CBSE"
        onChange={() => {}}
        options={[
          { value: 'CBSE', label: 'CBSE' },
          { value: 'ICSE', label: 'ICSE', disabled: true },
          { value: 'STATE', label: 'State board', disabled: true },
        ]}
      />
      <Text style={{ color: colors.textSecondary, fontSize: 13, paddingHorizontal: 4 }}>ICSE and state boards come later.</Text>
      <FieldHeading>Class</FieldHeading>
      {classes.isLoading ? <LoadingState /> : null}
      {classes.error ? <ErrorState error={classes.error} onRetry={classes.refresh} /> : null}
      <View style={styles.grid}>
        {(classes.data ?? []).map((item) => {
          const selected = cls === item.cls;
          return (
            <Pressable
              key={item.cls}
              onPress={() => setClass(item.cls)}
              disabled={!item.available}
              accessibilityRole="radio"
              accessibilityState={{ selected, disabled: !item.available }}
              accessibilityLabel={`Class ${item.cls}${item.available ? '' : ', coming soon'}`}
              testID={`class-${item.cls}`}
              style={[styles.cell, { borderRadius: radius.md, backgroundColor: selected ? colors.tint : colors.card, opacity: item.available ? 1 : 0.4 }]}
            >
              <Text style={[styles.cellNumber, { color: selected ? '#fff' : colors.text }]}>{item.cls}</Text>
              {!item.available ? <Text style={{ color: colors.textSecondary, fontSize: 11 }}>Soon</Text> : null}
            </Pressable>
          );
        })}
      </View>
      <Text style={{ color: colors.textSecondary, fontSize: 13, paddingHorizontal: 4 }}>Class 9 and 10 are loaded today.</Text>
    </StepLayout>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  cell: { width: 72, height: 64, alignItems: 'center', justifyContent: 'center' },
  cellNumber: { fontSize: 22, fontWeight: '700' },
});
