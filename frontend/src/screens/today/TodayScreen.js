import { useCallback } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ChapterChip } from '../../components/domain/Badges';
import { Rings } from '../../components/domain/Charts';
import { SuggestionCard } from '../../components/domain/SuggestionCard';
import { TaskRow } from '../../components/domain/TaskRow';
import { Button } from '../../components/ui/Button';
import { Icon } from '../../components/ui/Icon';
import { Card, Divider, Screen, Section } from '../../components/ui/Layout';
import { AsyncBoundary, Banner, EmptyState } from '../../components/ui/States';
import { useAsyncAction } from '../../hooks/useAsyncAction';
import { useResource } from '../../hooks/useResource';
import { suggestionActions, taskActions } from '../../services/actions';
import { resources } from '../../services/resources';
import { rings } from '../../theme/tokens';
import { useTheme } from '../../theme/ThemeProvider';
import { capitalize, clockTime, dayName, duration, hours, longDate, plural } from '../../utils/format';

export function TodayScreen({ navigation }) {
  const today = useResource(resources.today);
  return (
    <Screen refreshing={today.isRefreshing} onRefresh={today.refresh} testID="today-screen">
      <AsyncBoundary resource={today}>{(data) => <TodayContent data={data} navigation={navigation} />}</AsyncBoundary>
    </Screen>
  );
}

function TodayContent({ data, navigation }) {
  const openPlan = useCallback((date) => navigation.navigate('Plan', { date, at: Date.now() }), [navigation]);
  return (
    <>
      <NextTest exam={data.nextExam} navigation={navigation} />
      {data.examSeason ? <Banner tone="info" icon="moon" title="Exam-season mode is on" body="Study groups are muted and your daily limit is 45 min higher." /> : null}
      <Summary data={data} />
      {data.suggestedBlocks.count ? (
        <Banner tone="info" icon="spark" title={`${plural(data.suggestedBlocks.count, 'study block')} suggested`} body="The planner found free time before your tests. You choose what stays.">
          <View style={styles.buttons}>
            <Button title="Review in Plan" size="sm" variant="primary" onPress={() => openPlan(data.suggestedBlocks.firstDate)} />
          </View>
        </Banner>
      ) : null}
      <TodayPlan data={data} navigation={navigation} />
      {data.heavyDay ? (
        <Banner title={`${capitalize(dayName(data.heavyDay.date, data.today))} looks too heavy`} body={`${duration(data.heavyDay.plannedMins)} planned against a limit of ${duration(data.heavyDay.limitMins)}.`}>
          <View style={styles.buttons}>
            <Button title="Fix it in Plan" size="sm" onPress={() => openPlan(data.heavyDay.date)} />
          </View>
        </Banner>
      ) : null}
      <WaitingSuggestions suggestions={data.suggestions} today={data.today} laterCount={data.laterCount} />
    </>
  );
}

function NextTest({ exam, navigation }) {
  const { colors } = useTheme();
  if (!exam) {
    return (
      <Card>
        <Text style={[styles.label, { color: colors.textSecondary }]}>NEXT TEST</Text>
        <Text style={[styles.examName, { color: colors.text }]}>No tests added yet</Text>
        <Text style={{ color: colors.textSecondary, marginTop: 4 }}>Add your next test and the planner spaces out revision before it.</Text>
        <View style={styles.buttons}>
          <Button title="Add a test" size="sm" variant="primary" onPress={() => navigation.navigate('NewExam')} />
          <Button title="Schedule from syllabus" size="sm" onPress={() => navigation.navigate('Syllabus')} />
        </View>
      </Card>
    );
  }
  return (
    <Card>
      <Text style={[styles.label, { color: colors.textSecondary }]}>NEXT TEST</Text>
      <View style={styles.countRow}>
        <Text style={[styles.countNumber, { color: colors.text }]} accessibilityLabel={`${exam.daysLeft} days left`}>
          {exam.daysLeft}
        </Text>
        <Text style={{ color: colors.textSecondary, fontSize: 15 }}>{exam.daysLeft === 1 ? 'day left' : 'days left'}</Text>
      </View>
      <Text style={[styles.examName, { color: colors.text }]}>{exam.name}</Text>
      <Text style={{ color: colors.textSecondary, fontSize: 14 }}>{longDate(exam.date)}</Text>
      <View style={styles.chips}>
        {exam.chapters.map((chapter) => (
          <ChapterChip key={chapter.key} name={chapter.name} status={chapter.status} />
        ))}
      </View>
      <View style={[styles.readyRow, { borderTopColor: colors.separator }]}>
        <Text style={{ color: colors.text, fontSize: 15 }}>
          <Text style={{ fontWeight: '700' }}>
            {exam.readiness.revised} of {exam.readiness.total}
          </Text>{' '}
          chapters revised
        </Text>
        <Button title="Revision plan" size="sm" onPress={() => navigation.navigate('Plan')} />
      </View>
    </Card>
  );
}

function Summary({ data }) {
  const { colors } = useTheme();
  const total = data.tasks.length;
  const values = [
    { color: rings.tasks, progress: total ? data.doneCount / total : 0 },
    { color: rings.focus, progress: data.focusTodayMins / 60 },
    { color: rings.week, progress: data.weeklyGoalMins ? data.weekMins / data.weeklyGoalMins : 0 },
  ];
  return (
    <Section title="Summary">
      <View style={styles.summaryRow}>
        <Rings values={values} />
        <View style={styles.ringLabels}>
          <RingLabel color={rings.tasks} label="Tasks" value={`${data.doneCount}/${total}`} />
          <RingLabel color={colors.successInk} label="Focus" value={`${data.focusTodayMins}/60`} unit="MIN" />
          <RingLabel color={rings.week} label="This week" value={`${hours(data.weekMins)}/${hours(data.weeklyGoalMins)}`} unit="H" />
        </View>
      </View>
      <View style={[styles.streak, { borderTopColor: colors.separator }]}>
        <Icon name="habits" size={18} color={colors.warning} />
        <Text style={{ color: colors.text, flex: 1 }}>
          {data.streak ? (
            <>
              <Text style={{ fontWeight: '700' }}>{data.streak}-day streak.</Text>
              <Text style={{ color: colors.textSecondary }}> Rest days count.</Text>
            </>
          ) : (
            <>
              <Text style={{ fontWeight: '700' }}>Start your streak today.</Text>
              <Text style={{ color: colors.textSecondary }}> Finish one task.</Text>
            </>
          )}
        </Text>
      </View>
    </Section>
  );
}

function RingLabel({ color, label, value, unit }) {
  const { colors } = useTheme();
  return (
    <View>
      <Text style={{ color, fontSize: 13, fontWeight: '600' }}>{label}</Text>
      <Text style={{ color: colors.text, fontSize: 20, fontWeight: '700' }}>
        {value}
        {unit ? <Text style={{ fontSize: 12, color: colors.textSecondary }}> {unit}</Text> : null}
      </Text>
    </View>
  );
}

function TodayPlan({ data, navigation }) {
  const toggle = useAsyncAction(taskActions.toggleDone);
  return (
    <Section title="Today’s plan" meta={`${duration(data.plannedMins)} of ${duration(data.limitMins)}`} flush>
      {data.tasks.length ? (
        data.tasks.map(({ task, start }, index) => (
          <View key={task.id}>
            {index ? <Divider /> : null}
            <TaskRow task={task} time={start === null ? '–' : clockTime(start)} onToggle={toggle.execute} disabled={toggle.pending} />
          </View>
        ))
      ) : (
        <EmptyState message="Nothing planned. Pick a task in Plan or accept a suggestion." />
      )}
      <View style={[styles.buttons, styles.cardButtons]}>
        <Button title="Start focus" icon="play" size="sm" variant="primary" onPress={() => navigation.navigate('Habits')} />
        <Button title="Full plan" size="sm" onPress={() => navigation.navigate('Plan')} />
      </View>
    </Section>
  );
}

function WaitingSuggestions({ suggestions, today, laterCount }) {
  const busy = useAsyncAction(async (action, item) => action(item, today));
  if (!suggestions.length) return null;
  return (
    <Section title="Waiting for you" meta={String(suggestions.length)} bare footer={`Nothing changes in your plan until you accept.${laterCount ? ` ${laterCount} saved for later in Settings.` : ''}`}>
      <View style={{ gap: 10 }}>
        {suggestions.map((item) => (
          <SuggestionCard
            key={item.id}
            suggestion={item}
            today={today}
            busy={busy.pending}
            onAccept={(value) => busy.execute(suggestionActions.accept, value)}
            onSwap={(value) => busy.execute(suggestionActions.swap, value)}
            onSkip={(value) => busy.execute(suggestionActions.skip, value)}
            onLater={(value) => busy.execute(suggestionActions.later, value)}
          />
        ))}
      </View>
    </Section>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 12, fontWeight: '700', letterSpacing: 0.6 },
  countRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 4 },
  countNumber: { fontSize: 52, fontWeight: '800', lineHeight: 58 },
  examName: { fontSize: 20, fontWeight: '700', marginTop: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  readyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, gap: 8 },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  cardButtons: { paddingHorizontal: 16, paddingBottom: 14, marginTop: 4 },
  summaryRow: { flexDirection: 'row', alignItems: 'center', gap: 20 },
  ringLabels: { gap: 8, flex: 1 },
  streak: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
});
