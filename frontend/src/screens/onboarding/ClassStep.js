import { StyleSheet, Text, View } from 'react-native';
import { Button } from '../../components/ui/Button';
import { Chip, ChipGroup } from '../../components/ui/Controls';
import { PressableScale } from '../../components/ui/Motion';
import { ErrorState, LoadingState } from '../../components/ui/States';
import { useResource } from '../../hooks/useResource';
import { resources } from '../../services/resources';
import { useOnboardingStore } from '../../store/onboardingStore';
import { useTheme } from '../../theme/ThemeProvider';
import { FieldHeading, StepLayout } from './StepLayout';

export function ClassStep({ navigation }) {
  const { colors, radius } = useTheme();
  const board = useOnboardingStore((state) => state.draft.board);
  const cls = useOnboardingStore((state) => state.draft.cls);
  const setBoard = useOnboardingStore((state) => state.setBoard);
  const setClass = useOnboardingStore((state) => state.setClass);
  const boards = useResource(resources.syllabusBoards);
  const classes = useResource(resources.syllabusClasses(board));
  const national = (boards.data ?? []).filter((item) => item.kind === 'national');
  const state = (boards.data ?? []).filter((item) => item.kind === 'state');
  const loaded = (classes.data ?? []).filter((item) => item.available).map((item) => item.cls);

  const boardChip = (item) => <Chip key={item.code} label={item.name} selected={board === item.code} onPress={() => setBoard(item.code, item.name)} testID={`board-${item.code}`} />;

  return (
    <StepLayout
      step={1}
      title="Board and class"
      lead="Tap your board, then your class. We load the chapters from your school books."
      footer={<Button title="Continue" variant="primary" block disabled={!cls} onPress={() => navigation.navigate('SubjectsStep')} testID="class-continue" />}
    >
      <FieldHeading>Board</FieldHeading>
      {boards.isLoading ? <LoadingState /> : null}
      {boards.error ? <ErrorState error={boards.error} onRetry={boards.refresh} /> : null}
      <ChipGroup label="Board">{national.map(boardChip)}</ChipGroup>
      {state.length ? (
        <>
          <Text style={[styles.note, { color: colors.textSecondary }]}>State boards</Text>
          <ChipGroup label="State board">{state.map(boardChip)}</ChipGroup>
        </>
      ) : null}
      <FieldHeading>Class</FieldHeading>
      {classes.isLoading ? <LoadingState /> : null}
      {classes.error ? <ErrorState error={classes.error} onRetry={classes.refresh} /> : null}
      <View style={styles.grid}>
        {(classes.data ?? []).map((item) => {
          const selected = cls === item.cls;
          return (
            <PressableScale
              key={item.cls}
              scaleTo={0.9}
              onPress={() => setClass(item.cls)}
              disabled={!item.available}
              accessibilityRole="radio"
              accessibilityState={{ selected, disabled: !item.available }}
              accessibilityLabel={`Class ${item.cls}${item.available ? '' : ', coming soon'}`}
              testID={`class-${item.cls}`}
              style={[
                styles.cell,
                {
                  borderRadius: radius.md,
                  backgroundColor: selected ? colors.tint : colors.card,
                  borderColor: selected ? colors.tint : colors.separator,
                  opacity: item.available ? 1 : 0.4,
                },
                selected && { boxShadow: `0px 4px 12px ${colors.tint}55` },
              ]}
            >
              <Text style={[styles.cellLabel, { color: selected ? 'rgba(255,255,255,0.85)' : colors.textTertiary }]}>CLASS</Text>
              <Text style={[styles.cellNumber, { color: selected ? '#fff' : colors.text }]}>{item.cls}</Text>
              {!item.available ? <Text style={{ color: colors.textSecondary, fontSize: 11 }}>Soon</Text> : null}
            </PressableScale>
          );
        })}
      </View>
      {classes.data ? (
        <Text style={[styles.note, { color: colors.textSecondary }]}>
          {loaded.length ? `Class ${loaded.join(', ')} ${loaded.length === 1 ? 'is' : 'are'} loaded for this board.` : 'No classes are loaded for this board yet.'}
        </Text>
      ) : null}
    </StepLayout>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  cell: { width: 70, height: 62, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  cellLabel: { fontSize: 9, fontWeight: '800', letterSpacing: 0.6 },
  cellNumber: { fontSize: 22, fontWeight: '900' },
  note: { fontSize: 12.5, paddingHorizontal: 2 },
});
