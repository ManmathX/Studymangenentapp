import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { DayPicker } from '../../components/domain/DayPicker';
import { Datesheet } from '../../components/domain/Datesheet';
import { Button } from '../../components/ui/Button';
import { Card, IconTile, Muted, Screen, Section, Stack } from '../../components/ui/Layout';
import { PressableScale, ProgressBar } from '../../components/ui/Motion';
import { AsyncBoundary, Banner } from '../../components/ui/States';
import { useAsyncAction } from '../../hooks/useAsyncAction';
import { useResource } from '../../hooks/useResource';
import { examActions, taskActions } from '../../services/actions';
import { resources } from '../../services/resources';
import { useSubjectInfo } from '../../store/subjectStore';
import { useTheme } from '../../theme/ThemeProvider';
import { capitalize, dayName, duration, shortDate } from '../../utils/format';
import { Timeline } from './Timeline';

export function PlanScreen({ navigation, route }) {
  const strip = useResource(resources.planStrip);
  const today = strip.data?.[0]?.date;
  const [selected, setSelected] = useState(null);

  // Other screens open a day with { date, at }. `at` makes every request distinct, so asking
  // for the same day twice still jumps back to it after the student picked another day.
  const request = route.params;
  const [handledAt, setHandledAt] = useState(null);
  if (request?.at && request.at !== handledAt) {
    setHandledAt(request.at);
    setSelected(request.date ?? null);
  }

  const date = selected ?? today;
  return (
    <Screen refreshing={strip.isRefreshing} onRefresh={strip.refresh} testID="plan-screen">
      <AsyncBoundary resource={strip}>
        {(days) => (
          <>
            <Strip days={days} value={date} onChange={setSelected} />
            {date ? <DayPlan key={date} date={date} navigation={navigation} /> : null}
            <PlanTools navigation={navigation} />
            <DatesheetSection navigation={navigation} />
          </>
        )}
      </AsyncBoundary>
    </Screen>
  );
}

function Strip({ days, value, onChange }) {
  const markers = useMemo(() => Object.fromEntries(days.map((day) => [day.date, { exam: day.hasExam, over: day.overloaded, suggested: day.hasSuggested }])), [days]);
  const keys = useMemo(() => days.map((day) => day.date), [days]);
  return <DayPicker days={keys} value={value} onChange={onChange} today={keys[0]} markers={markers} legend />;
}

function DayPlan({ date, navigation }) {
  const day = useResource(resources.planDay(date));
  return <AsyncBoundary resource={day}>{(data) => <DayDetails data={data} navigation={navigation} />}</AsyncBoundary>;
}

function DayDetails({ data }) {
  const { colors } = useTheme();
  const isToday = data.date === data.today;
  const fix = useAsyncAction(() => taskActions.moveTo({ id: data.moveSuggestion.taskId }, data.moveSuggestion.toDate, data.today));
  const ratio = Math.min(1, data.plannedMins / Math.max(1, data.limitMins));
  const title = data.moveSuggestion?.title ?? '';
  return (
    <Stack>
      <Card>
        <View style={styles.dayHead}>
          <Text style={[styles.dayTitle, { color: colors.text }]}>
            {isToday ? 'Today' : capitalize(dayName(data.date, data.today))}, {shortDate(data.date)}
          </Text>
          <Text style={[styles.dayLoad, { color: data.overloaded ? colors.danger : colors.textSecondary }]}>
            {duration(data.plannedMins)} of {duration(data.limitMins)}
          </Text>
        </View>
        <View accessibilityLabel={`${Math.round(ratio * 100)} percent of the daily limit planned`}>
          <ProgressBar progress={ratio} color={data.overloaded ? colors.danger : colors.success} track={colors.fill} height={8} style={styles.load} />
        </View>
        {data.tuitionDay ? <Muted small style={styles.note}>Tuition day, so the limit is 30 min lower.</Muted> : null}
      </Card>
      {data.overloaded ? (
        <Banner title="This day is too heavy" body={`${duration(data.plannedMins - data.limitMins)} over your limit. Long days now mean tired days later.`}>
          {data.moveSuggestion ? (
            <View style={styles.buttons}>
              <Button
                title={`Move “${title.length > 30 ? `${title.slice(0, 28)}…` : title}” to ${dayName(data.moveSuggestion.toDate, data.today)}`}
                size="sm"
                variant="primary"
                onPress={fix.execute}
                loading={fix.pending}
              />
            </View>
          ) : null}
        </Banner>
      ) : null}
      <Timeline data={data} />
      {data.overflow.length ? <Banner title="Doesn’t fit before 22:00" body={data.overflow.map((task) => task.title).join(', ')} /> : null}
    </Stack>
  );
}

/** Three big "add" tiles: a chapter from the syllabus, homework, or a test. */
function PlanTools({ navigation }) {
  const { colors } = useTheme();
  return (
    <Section title="Add to your plan" icon="plus" bare>
      <View style={styles.tools}>
        <ToolTile icon="book" color="#06B6D4" label="Chapter" hint="from syllabus" onPress={() => navigation.navigate('Syllabus')} testID="open-syllabus" />
        <ToolTile icon="homework" color={colors.tint} label="Homework" hint="due soon" onPress={() => navigation.navigate('NewHomework')} />
        <ToolTile icon="trophy" color={colors.warning} label="Exam" hint="test or olympiad" onPress={() => navigation.navigate('NewDatesheet', { kind: 'other' })} testID="add-exam" />
      </View>
    </Section>
  );
}

function ToolTile({ icon, color, label, hint, onPress, testID }) {
  const { colors, radius } = useTheme();
  return (
    <PressableScale
      onPress={onPress}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={`Add ${label.toLowerCase()} ${hint}`}
      style={[styles.tool, { backgroundColor: colors.card, borderRadius: radius.lg, boxShadow: colors.shadow }]}
    >
      <IconTile name={icon} color={color} size={36} />
      <Text style={[styles.toolLabel, { color: colors.text }]}>{label}</Text>
      <Text style={[styles.toolHint, { color: colors.textSecondary }]} numberOfLines={1}>
        {hint}
      </Text>
    </PressableScale>
  );
}

/** Every exam in one place: unit tests, half-yearly & final, and other exams, each with its syllabus. */
function DatesheetSection({ navigation }) {
  const { colors } = useTheme();
  const exams = useResource(resources.exams);
  const subjectOf = useSubjectInfo();
  const remove = useAsyncAction(examActions.remove);
  const removeGroup = useAsyncAction(examActions.removeGroup);
  const busy = remove.pending || removeGroup.pending;
  const edit = (exam) => navigation.navigate('EditExam', { exam: { id: exam.id, subject: exam.subject, name: exam.name, date: exam.date, weight: exam.weight, chapterKeys: exam.chapterKeys } });
  return (
    <Section title="Datesheet" icon="today" iconColor={colors.danger} bare footer="Tap a paper to see its syllabus. Use the pencil to change its date or chapters.">
      <AsyncBoundary resource={exams}>
        {(list) => (
          <Datesheet
            exams={list}
            subjectOf={subjectOf}
            onAdd={(kind) => navigation.navigate('NewDatesheet', { kind })}
            onEdit={edit}
            onRemove={remove.execute}
            onRemoveGroup={(group) => (group.exams.length > 1 ? removeGroup.execute(group) : remove.execute(group.exams[0]))}
            busy={busy}
          />
        )}
      </AsyncBoundary>
    </Section>
  );
}

const styles = StyleSheet.create({
  dayHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' },
  dayTitle: { fontSize: 16.5, fontWeight: '800' },
  dayLoad: { fontSize: 12.5, fontWeight: '700' },
  load: { marginTop: 8 },
  note: { marginTop: 6 },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  tools: { flexDirection: 'row', gap: 8 },
  tool: { flex: 1, alignItems: 'center', paddingVertical: 12, paddingHorizontal: 6, gap: 4 },
  toolLabel: { fontSize: 14, fontWeight: '800' },
  toolHint: { fontSize: 11 },
});
