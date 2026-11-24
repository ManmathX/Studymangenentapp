import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Button } from '../../components/ui/Button';
import { Chip, ChipGroup } from '../../components/ui/Controls';
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
      lead="We load the chapters for your board’s books."
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
      {classes.data ? (
        <Text style={[styles.note, { color: colors.textSecondary }]}>
          {loaded.length ? `Class ${loaded.join(', ')} ${loaded.length === 1 ? 'is' : 'are'} loaded for this board.` : 'No classes are loaded for this board yet.'}
        </Text>
      ) : null}
    </StepLayout>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  cell: { width: 72, height: 64, alignItems: 'center', justifyContent: 'center' },
  cellNumber: { fontSize: 22, fontWeight: '700' },
  note: { fontSize: 13, paddingHorizontal: 4 },
});
