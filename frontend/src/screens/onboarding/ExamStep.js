import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ExamBadge } from '../../components/domain/ExamBadge';
import { Button } from '../../components/ui/Button';
import { Chip, ChipGroup } from '../../components/ui/Controls';
import { Input } from '../../components/ui/Field';
import { Icon } from '../../components/ui/Icon';
import { Card, Divider } from '../../components/ui/Layout';
import { PressableScale } from '../../components/ui/Motion';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/States';
import { useResource } from '../../hooks/useResource';
import { resources } from '../../services/resources';
import { examChosen, useOnboardingStore } from '../../store/onboardingStore';
import { useTheme } from '../../theme/ThemeProvider';
import { searchExams } from '../../utils/exam';
import { FieldHeading, StepLayout } from './StepLayout';

/**
 * Step 1: the board or exam the student is preparing for, from the list the server publishes
 * (school boards, engineering and medical entrance, government exams, olympiads…), then the
 * class or stage if the exam has them. Nothing here is built into the app.
 */
export function ExamStep({ navigation }) {
  const draft = useOnboardingStore((state) => state.draft);
  const setExam = useOnboardingStore((state) => state.setExam);
  const setLevel = useOnboardingStore((state) => state.setLevel);
  const catalog = useResource(resources.examCatalog);
  const categories = useResource(resources.examCategories);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState(null);
  const [browsing, setBrowsing] = useState(!draft.board);

  // Only exams and levels students can set up with now (the server already leaves the rest out).
  const exams = useMemo(
    () => (catalog.data ?? []).filter((exam) => exam.available !== false).map((exam) => ({ ...exam, levels: exam.levels.filter((level) => level.available !== false) })),
    [catalog.data],
  );
  const selected = exams.find((exam) => exam.code === draft.board) ?? null;
  const showList = browsing || !selected;
  const shown = useMemo(() => searchExams(exams, query, category), [exams, query, category]);
  const groups = useMemo(() => {
    const byCategory = new Map();
    for (const exam of shown) {
      if (!byCategory.has(exam.category)) byCategory.set(exam.category, { name: exam.categoryName, exams: [] });
      byCategory.get(exam.category).exams.push(exam);
    }
    return [...byCategory.entries()];
  }, [shown]);
  const level = selected?.levels.find((item) => item.key === draft.level?.key);
  const ready = Boolean(selected && examChosen(draft) && (!selected.levels.length || level));

  const pick = (exam) => {
    setExam(exam);
    setBrowsing(false);
    // One level only: pick it for the student.
    if (exam.levels.length === 1) setLevel(exam.levels[0]);
  };

  return (
    <StepLayout
      step={1}
      title="Your exam"
      lead="Pick your school board, or the exam you’re preparing for. We load its syllabus for you."
      footer={<Button title="Continue" variant="primary" block disabled={!ready} onPress={() => navigation.navigate('SubjectsStep')} testID="exam-continue" />}
    >
      {showList ? (
        <>
          <Input value={query} onChangeText={setQuery} placeholder="Search: CBSE, JEE, NEET, state board…" autoCorrect={false} autoCapitalize="none" returnKeyType="search" accessibilityLabel="Search exams" testID="exam-search" />
          {(categories.data ?? []).some((item) => item.exams) ? (
            <ChipGroup label="Category">
              <Chip label="All" selected={!category} onPress={() => setCategory(null)} testID="category-all" />
              {categories.data
                .filter((item) => item.exams)
                .map((item) => (
                  <Chip key={item.code} label={item.name} selected={category === item.code} onPress={() => setCategory(category === item.code ? null : item.code)} testID={`category-${item.code}`} />
                ))}
            </ChipGroup>
          ) : null}
          {catalog.isLoading ? <LoadingState label="Loading exams" /> : null}
          {catalog.error ? <ErrorState error={catalog.error} onRetry={catalog.refresh} /> : null}
          {catalog.data && !shown.length ? <EmptyState icon="search" message={query.trim() ? `No exam matches “${query.trim()}”. Try a shorter name, or pick a category.` : 'No exams in this category yet.'} /> : null}
          {groups.map(([code, group]) => (
            <View key={code} style={styles.group}>
              <FieldHeading>{group.name}</FieldHeading>
              <Card flush>
                {group.exams.map((exam, index) => (
                  <View key={exam.code}>
                    {index ? <Divider inset={66} /> : null}
                    <ExamRow exam={exam} selected={exam.code === draft.board} onPress={() => pick(exam)} />
                  </View>
                ))}
              </Card>
            </View>
          ))}
          {selected ? <Button title={`Keep ${selected.shortName}`} variant="ghost" onPress={() => setBrowsing(false)} /> : null}
        </>
      ) : (
        <>
          <SelectedExam exam={selected} onChange={() => setBrowsing(true)} />
          {selected.levels.length ? <LevelPicker exam={selected} value={draft.level?.key} onChange={setLevel} /> : null}
        </>
      )}
    </StepLayout>
  );
}

function ExamRow({ exam, selected, onPress }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={exam.name}
      testID={`exam-${exam.code}`}
      style={({ pressed }) => [styles.row, { backgroundColor: pressed ? colors.fill : 'transparent' }]}
    >
      <ExamBadge exam={exam} size={40} />
      <View style={styles.flex}>
        <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
          {exam.name}
        </Text>
        {exam.description ? (
          <Text style={{ color: colors.textSecondary, fontSize: 12.5 }} numberOfLines={2}>
            {exam.description}
          </Text>
        ) : null}
      </View>
      {selected ? <Icon name="check" size={18} color={colors.tint} strokeWidth={3} /> : <Icon name="chevron" size={14} color={colors.textTertiary} />}
    </Pressable>
  );
}

function SelectedExam({ exam, onChange }) {
  const { colors } = useTheme();
  const facts = [exam.conductingBody, exam.academicYear ? `Syllabus ${exam.academicYear}` : null].filter(Boolean);
  return (
    <Card style={styles.selected} testID="selected-exam">
      <ExamBadge exam={exam} size={52} />
      <View style={styles.flex}>
        <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '700' }}>{exam.categoryName.toUpperCase()}</Text>
        <Text style={{ color: colors.text, fontSize: 19, fontWeight: '800' }}>{exam.name}</Text>
        {facts.length ? <Text style={{ color: colors.textSecondary, fontSize: 12.5 }}>{facts.join(' · ')}</Text> : null}
      </View>
      <Button title="Change" size="sm" variant="ghost" onPress={onChange} testID="exam-change" />
    </Card>
  );
}

/** Classes as a grid of numbers; other levels (stages, papers) as chips. */
function LevelPicker({ exam, value, onChange }) {
  const { colors, radius } = useTheme();
  const classes = exam.levels.every((level) => level.grade);
  return (
    <>
      <FieldHeading>{exam.levelLabel}</FieldHeading>
      {classes ? (
        <View style={styles.grid}>
          {exam.levels.map((level) => {
            const selected = value === level.key;
            return (
              <PressableScale
                key={level.key}
                scaleTo={0.9}
                onPress={() => onChange(level)}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                accessibilityLabel={level.name}
                testID={`level-${level.key}`}
                style={[
                  styles.cell,
                  {
                    borderRadius: radius.md,
                    backgroundColor: selected ? colors.tint : colors.card,
                    borderColor: selected ? colors.tint : colors.separator,
                  },
                  selected && { boxShadow: `0px 4px 12px ${colors.tint}55` },
                ]}
              >
                <Text style={[styles.cellLabel, { color: selected ? 'rgba(255,255,255,0.85)' : colors.textTertiary }]}>CLASS</Text>
                <Text style={[styles.cellNumber, { color: selected ? '#fff' : colors.text }]}>{level.grade}</Text>
              </PressableScale>
            );
          })}
        </View>
      ) : (
        <ChipGroup label={exam.levelLabel}>
          {exam.levels.map((level) => (
            <Chip key={level.key} label={level.name} selected={value === level.key} onPress={() => onChange(level)} testID={`level-${level.key}`} />
          ))}
        </ChipGroup>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, gap: 2 },
  group: { gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 14, minHeight: 60 },
  name: { fontSize: 16, fontWeight: '700' },
  selected: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  cell: { width: 70, height: 62, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  cellLabel: { fontSize: 9, fontWeight: '800', letterSpacing: 0.6 },
  cellNumber: { fontSize: 22, fontWeight: '900' },
  note: { fontSize: 12.5, paddingHorizontal: 2 },
});
