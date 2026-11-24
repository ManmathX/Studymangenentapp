import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { DayPicker } from '../../components/domain/DayPicker';
import { ExamList } from '../../components/domain/ExamList';
import { Button } from '../../components/ui/Button';
import { Card, Muted, Screen, Section } from '../../components/ui/Layout';
import { AsyncBoundary, Banner } from '../../components/ui/States';
import { useAsyncAction } from '../../hooks/useAsyncAction';
import { useResource } from '../../hooks/useResource';
import { examActions, planActions, taskActions } from '../../services/actions';
import { resources } from '../../services/resources';
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
            {date ? <DayPlan date={date} navigation={navigation} /> : null}
            <PlanTools navigation={navigation} />
            <UpcomingTests navigation={navigation} />
          </>
        )}
      </AsyncBoundary>
    </Screen>
  );
}

function Strip({ days, value, onChange }) {
  const markers = useMemo(() => Object.fromEntries(days.map((day) => [day.date, { exam: day.hasExam, over: day.overloaded, suggested: day.hasSuggested }])), [days]);
  const keys = useMemo(() => days.map((day) => day.date), [days]);
  return <DayPicker days={keys} value={value} onChange={onChange} today={keys[0]} markers={markers} />;
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
    <>
      <Card>
        <View style={styles.dayHead}>
          <Text style={[styles.dayTitle, { color: colors.text }]}>
            {isToday ? 'Today' : capitalize(dayName(data.date, data.today))}, {shortDate(data.date)}
          </Text>
          <Muted small>
            {duration(data.plannedMins)} of {duration(data.limitMins)}
          </Muted>
        </View>
        <View style={[styles.load, { backgroundColor: colors.fill }]} accessibilityLabel={`${Math.round(ratio * 100)} percent of the daily limit planned`}>
          <View style={{ width: `${ratio * 100}%`, backgroundColor: data.overloaded ? colors.danger : colors.success, borderRadius: 4 }} />
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
    </>
  );
}

function PlanTools({ navigation }) {
  const strip = useResource(resources.planStrip);
  const day = strip.data?.[0]?.date;
  const daySummary = useResource(resources.planDay(day ?? 'pending'), { enabled: Boolean(day) });
  const suggestedCount = daySummary.data?.suggestedCount ?? 0;
  const auto = useAsyncAction(planActions.autoSchedule);
  const acceptAll = useAsyncAction(planActions.acceptAll);
  return (
    <>
      <Section bare footer="Pick a chapter and choose the days for each step. Homework and tests are yours to add too.">
        <View style={{ gap: 8 }}>
          <Button title="Schedule from syllabus" icon="plus" variant="primary" block onPress={() => navigation.navigate('Syllabus')} testID="open-syllabus" />
          <View style={styles.pair}>
            <View style={styles.flex}>
              <Button title="Homework" icon="plus" block onPress={() => navigation.navigate('NewHomework')} />
            </View>
            <View style={styles.flex}>
              <Button title="Test" icon="plus" block onPress={() => navigation.navigate('NewExam')} />
            </View>
          </View>
        </View>
      </Section>
      <Section title="Auto schedule" meta={suggestedCount ? `${suggestedCount} waiting` : undefined} footer="Priority = deadline × grade weight × difficulty.">
        <Muted>Fills free slots before your tests, highest priority first. You choose what stays.</Muted>
        <View style={styles.buttons}>
          <Button title="Fill free slots before exams" icon="spark" variant="primary" onPress={auto.execute} loading={auto.pending} testID="auto-schedule" />
          {suggestedCount ? <Button title={`Accept all ${suggestedCount}`} onPress={acceptAll.execute} loading={acceptAll.pending} /> : null}
        </View>
      </Section>
    </>
  );
}

function UpcomingTests({ navigation }) {
  const exams = useResource(resources.exams);
  const remove = useAsyncAction(examActions.remove);
  const edit = (exam) => navigation.navigate('EditExam', { exam: { id: exam.id, subject: exam.subject, name: exam.name, date: exam.date, weight: exam.weight, chapterKeys: exam.chapterKeys } });
  return (
    <Section title="Upcoming tests" flush>
      <AsyncBoundary resource={exams}>{(list) => <ExamList exams={list} onEdit={edit} onRemove={remove.execute} busy={remove.pending} />}</AsyncBoundary>
    </Section>
  );
}

const styles = StyleSheet.create({
  dayHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' },
  dayTitle: { fontSize: 17, fontWeight: '700' },
  load: { height: 8, borderRadius: 4, marginTop: 10, flexDirection: 'row', overflow: 'hidden' },
  note: { marginTop: 8 },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  pair: { flexDirection: 'row', gap: 8 },
  flex: { flex: 1 },
});
