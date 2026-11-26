import { memo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { StatusDot, SubjectDot } from '../../components/domain/Badges';
import { CoverageBar, WeekBars } from '../../components/domain/Charts';
import { ExamList } from '../../components/domain/ExamList';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Field';
import { Icon } from '../../components/ui/Icon';
import { Card, Divider, Muted, Screen, Section } from '../../components/ui/Layout';
import { CountUp, ProgressBar } from '../../components/ui/Motion';
import { AsyncBoundary, EmptyState } from '../../components/ui/States';
import { useAsyncAction } from '../../hooks/useAsyncAction';
import { useResource } from '../../hooks/useResource';
import { examActions, taskActions } from '../../services/actions';
import { resources } from '../../services/resources';
import { useSubjectInfo } from '../../store/subjectStore';
import { CHAPTER_STATUS_ORDER, chapterStatus } from '../../theme/tokens';
import { useTheme } from '../../theme/ThemeProvider';
import { addDays, dayName, hours } from '../../utils/format';

export function ProgressScreen({ navigation }) {
  const progress = useResource(resources.progress);
  return (
    <Screen refreshing={progress.isRefreshing} onRefresh={progress.refresh} testID="progress-screen">
      <AsyncBoundary resource={progress}>
        {(data) => (
          <>
            <Coverage coverage={data.coverage} />
            <Subjects subjects={data.subjects} navigation={navigation} />
            <StudyHours data={data} />
            <Section title="Test readiness" icon="target" iconColor="#F43F5E" flush>
              <ExamList exams={data.upcomingExams} />
            </Section>
            <Results results={data.results} today={data.today} />
            {data.ageMode === 'simple' ? null : <WeeklyReview slipped={data.slipped} today={data.today} />}
          </>
        )}
      </AsyncBoundary>
    </Screen>
  );
}

function Coverage({ coverage }) {
  const { colors } = useTheme();
  return (
    <Card>
      <View style={styles.coverageHead}>
        <View style={[styles.percentTile, { backgroundColor: colors.successSoft }]}>
          <CountUp value={coverage.percent} suffix="%" style={[styles.percent, { color: colors.successInk }]} />
        </View>
        <View style={styles.flex}>
          <Text style={{ color: colors.text, fontWeight: '800', fontSize: 16 }}>Syllabus covered</Text>
          <Muted small>
            {coverage.covered} of {coverage.total} chapters revised or mastered
          </Muted>
        </View>
      </View>
      <CoverageBar counts={coverage.counts} total={coverage.total} />
      <StatusKey counts={coverage.counts} />
    </Card>
  );
}

/** What each bar colour means, in the order a chapter moves through them, with how many chapters are at each stage. */
function StatusKey({ counts }) {
  const { colors } = useTheme();
  return (
    <View style={styles.key} accessibilityRole="list" accessibilityLabel="Colour key for chapter progress">
      <Text style={[styles.keyTitle, { color: colors.textSecondary }]}>WHAT THE COLOURS MEAN</Text>
      {CHAPTER_STATUS_ORDER.map((status, index) => {
        const info = chapterStatus[status];
        return (
          <View key={status} style={styles.keyRow} accessible accessibilityLabel={`${index}. ${info.label}: ${info.meaning}. ${counts[status] ?? 0} chapters.`}>
            <View style={[styles.swatch, info.color ? { backgroundColor: info.color } : { backgroundColor: colors.fill, borderWidth: 1, borderColor: colors.fillStrong }]} />
            <View style={styles.flex}>
              <Text style={{ color: colors.text, fontWeight: '700', fontSize: 13.5 }}>{info.label}</Text>
              <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{info.meaning}</Text>
            </View>
            <Text style={{ color: colors.text, fontWeight: '800', fontSize: 14 }}>{counts[status] ?? 0}</Text>
          </View>
        );
      })}
      <Muted small>The bars fill left to right in this order. A chapter counts as covered once it is Revised or Mastered.</Muted>
    </View>
  );
}

function Subjects({ subjects: list, navigation }) {
  const [open, setOpen] = useState(list[0]?.subject ?? null);
  return (
    <Section title="Subjects" icon="book" iconColor="#06B6D4" flush footer="Tap a subject to open it, then tap a chapter to update it or plan its steps.">
      {list.map((item, index) => (
        <View key={item.subject}>
          {index ? <Divider /> : null}
          <SubjectRow item={item} expanded={open === item.subject} onToggle={() => setOpen(open === item.subject ? null : item.subject)} />
          {open === item.subject
            ? item.chapters.map((chapter) => (
                <ChapterRow key={chapter.key} chapter={chapter} onPress={() => navigation.navigate('ScheduleChapter', { chapterKey: chapter.key })} />
              ))
            : null}
        </View>
      ))}
    </Section>
  );
}

function SubjectRow({ item, expanded, onToggle }) {
  const { colors } = useTheme();
  const subjectOf = useSubjectInfo();
  return (
    <Pressable onPress={onToggle} accessibilityRole="button" accessibilityState={{ expanded }} style={({ pressed }) => [styles.subjectRow, { backgroundColor: pressed || expanded ? colors.fill : 'transparent' }]}>
      <View style={styles.subjectHead}>
        <SubjectDot subject={item.subject} size={10} />
        <Text style={{ color: colors.text, fontWeight: '800', fontSize: 15 }}>{item.name}</Text>
        <Muted small style={styles.flex}>
          {item.coverage.covered} of {item.coverage.total}
        </Muted>
        <Text style={{ color: subjectOf(item.subject).color, fontWeight: '800' }}>{item.coverage.percent}%</Text>
        <View style={{ transform: [{ rotate: expanded ? '90deg' : '0deg' }] }}>
          <Icon name="chevron" size={16} color={colors.textTertiary} />
        </View>
      </View>
      <CoverageBar counts={item.coverage.counts} total={item.coverage.total} height={6} />
    </Pressable>
  );
}

const ChapterRow = memo(function ChapterRow({ chapter, onPress }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${chapter.name}, ${chapterStatus[chapter.status].label}. Open to update or schedule.`}
      style={({ pressed }) => [styles.chapterRow, { backgroundColor: pressed ? colors.fill : 'transparent' }]}
    >
      <StatusDot status={chapter.status} />
      <Text style={[styles.flex, { color: colors.text }]}>{chapter.name}</Text>
      {chapter.plannedCount ? <Text style={{ color: colors.tint, fontSize: 12, fontWeight: '600' }}>{chapter.plannedCount} planned</Text> : <Muted small>{chapterStatus[chapter.status].label}</Muted>}
      <Icon name="chevron" size={14} color={colors.textTertiary} />
    </Pressable>
  );
});

function StudyHours({ data }) {
  const { colors } = useTheme();
  const ratio = Math.min(1, data.weekMins / Math.max(1, data.weeklyGoalMins));
  return (
    <Section title="Study hours" icon="clock" meta="Last 7 days">
      <Text style={{ color: colors.text, fontSize: 26, fontWeight: '900' }}>
        {hours(data.weekMins)} h <Text style={{ fontSize: 14, fontWeight: '500', color: colors.textSecondary }}>of {hours(data.weeklyGoalMins)} h goal</Text>
      </Text>
      <ProgressBar progress={ratio} color={colors.tint} track={colors.fill} height={8} style={styles.meter} />
      <WeekBars days={data.last7} today={data.today} weeklyGoalMins={data.weeklyGoalMins} />
    </Section>
  );
}

/** Tests that have happened, newest first, with the marks the student entered. */
function Results({ results, today }) {
  const { colors } = useTheme();
  return (
    <Section title="Test results" icon="trophy" iconColor={colors.warning} flush footer={results.length ? 'Add your marks after each test. They stay on this phone.' : undefined}>
      {results.length ? (
        results.map((exam, index) => (
          <View key={exam.id}>
            {index ? <Divider /> : null}
            <ResultRow exam={exam} today={today} />
          </View>
        ))
      ) : (
        <EmptyState icon="trophy" message="Your tests show here once they’re done, so you can add your marks." />
      )}
    </Section>
  );
}

function ResultRow({ exam, today }) {
  const { colors } = useTheme();
  const [editing, setEditing] = useState(false);
  const [score, setScore] = useState(exam.result ? String(exam.result.score) : '');
  const [outOf, setOutOf] = useState(exam.result ? String(exam.result.outOf) : '');
  const save = useAsyncAction(async (result) => {
    const saved = await examActions.setResult(exam, result);
    if (saved) setEditing(false);
  });
  const number = (text) => (text.trim() === '' ? NaN : Number(text.replace(',', '.')));

  return (
    <View style={styles.result}>
      <View style={styles.resultHead}>
        <SubjectDot subject={exam.subject} size={10} />
        <View style={styles.flex}>
          <Text style={{ color: colors.text, fontWeight: '600' }}>{exam.name}</Text>
          <Muted small>{dayName(exam.date, today)}</Muted>
        </View>
        {exam.result && !editing ? (
          <Text style={{ color: exam.result.percent >= 75 ? colors.successInk : exam.result.percent >= 40 ? colors.text : colors.danger, fontWeight: '800' }}>
            {exam.result.score}/{exam.result.outOf} · {exam.result.percent}%
          </Text>
        ) : null}
        {editing ? null : (
          <Button title={exam.result ? 'Edit' : 'Add marks'} size="sm" onPress={() => setEditing(true)} testID={`marks-open-${exam.id}`} />
        )}
      </View>
      {editing ? (
        <View style={styles.marksForm}>
          <View style={styles.marksInputs}>
            <View style={styles.flex}>
              <Input label="Marks" value={score} onChangeText={setScore} keyboardType="decimal-pad" placeholder="32.5" testID="marks-score" />
            </View>
            <View style={styles.flex}>
              <Input label="Out of" value={outOf} onChangeText={setOutOf} keyboardType="decimal-pad" placeholder="40" testID="marks-out-of" />
            </View>
          </View>
          <View style={styles.marksButtons}>
            <Button title="Save" variant="primary" size="sm" onPress={() => save.execute({ score: number(score), outOf: number(outOf) })} loading={save.pending} testID="marks-save" />
            <Button title="Cancel" size="sm" variant="ghost" onPress={() => setEditing(false)} disabled={save.pending} />
            {exam.result ? <Button title="Remove marks" size="sm" variant="ghost" onPress={() => save.execute(null)} disabled={save.pending} /> : null}
          </View>
        </View>
      ) : null}
    </View>
  );
}

function WeeklyReview({ slipped, today }) {
  const move = useAsyncAction((task) => taskActions.moveTo(task, addDays(today, 1), today));
  return (
    <Section title="Weekly review" icon="spark" iconColor="#A855F7" flush footer={slipped.length ? 'What slipped, and where it can go.' : undefined}>
      {slipped.length ? (
        slipped.map((task, index) => (
          <View key={task.id}>
            {index ? <Divider /> : null}
            <View style={styles.slipped}>
              <SubjectDot subject={task.subject} size={10} />
              <View style={styles.flex}>
                <SlippedTitle title={task.title} />
                <Muted small>Slipped {dayName(task.date, today)}</Muted>
              </View>
              <Button title="Tomorrow" size="sm" onPress={() => move.execute(task)} disabled={move.pending} />
            </View>
          </View>
        ))
      ) : (
        <EmptyState icon="check" message="Nothing slipped this week. Great job!" />
      )}
    </Section>
  );
}

function SlippedTitle({ title }) {
  const { colors } = useTheme();
  return <Text style={{ color: colors.text, fontWeight: '600' }}>{title}</Text>;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  coverageHead: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 },
  percentTile: { minWidth: 78, paddingVertical: 8, paddingHorizontal: 8, borderRadius: 14, alignItems: 'center' },
  percent: { fontSize: 28, fontWeight: '900' },
  key: { gap: 8, marginTop: 14 },
  keyTitle: { fontSize: 11, fontWeight: '800', letterSpacing: 0.6 },
  keyRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  swatch: { width: 22, height: 10, borderRadius: 5 },
  subjectRow: { paddingHorizontal: 14, paddingVertical: 11, gap: 7 },
  subjectHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  chapterRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, paddingLeft: 32, paddingRight: 14, minHeight: 42 },
  meter: { marginVertical: 10 },
  slipped: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, paddingHorizontal: 14 },
  result: { paddingVertical: 11, paddingHorizontal: 14, gap: 10 },
  resultHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  marksForm: { gap: 8 },
  marksInputs: { flexDirection: 'row', gap: 8 },
  marksButtons: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
