import { useCallback } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ChapterChip } from '../../components/domain/Badges';
import { SuggestionCard } from '../../components/domain/SuggestionCard';
import { TaskRow } from '../../components/domain/TaskRow';
import { Button } from '../../components/ui/Button';
import { Gradient } from '../../components/ui/Gradient';
import { Icon } from '../../components/ui/Icon';
import { Card, Divider, IconTile, Screen, Section, Stack } from '../../components/ui/Layout';
import { CountUp, ProgressBar, Pulse } from '../../components/ui/Motion';
import { AsyncBoundary, Banner, EmptyState } from '../../components/ui/States';
import { useAsyncAction } from '../../hooks/useAsyncAction';
import { useResource } from '../../hooks/useResource';
import { suggestionActions, taskActions } from '../../services/actions';
import { resources } from '../../services/resources';
import { useAuthStore } from '../../store/authStore';
import { useResourceStore } from '../../store/resourceStore';
import { useTheme } from '../../theme/ThemeProvider';
import { capitalize, clockTime, dayName, duration, longDate, plural } from '../../utils/format';

export function TodayScreen({ navigation }) {
  const today = useResource(resources.today);
  return (
    <Screen refreshing={today.isRefreshing} onRefresh={today.refresh} testID="today-screen">
      <AsyncBoundary resource={today}>{(data) => <TodayContent data={data} navigation={navigation} />}</AsyncBoundary>
    </Screen>
  );
}

function TodayContent({ data, navigation }) {
  const openPlan = useCallback((date) => navigation.navigate('Plan', { section: 'plan', date, at: Date.now() }), [navigation]);
  return (
    <Stack>
      <Hero data={data} />
      <TodayPlan data={data} navigation={navigation} />
      {data.suggestedBlocks.count ? (
        <Banner tone="info" icon="spark" title={`${plural(data.suggestedBlocks.count, 'more study block')} suggested`} body="The planner found free time on the coming days before your tests. You choose what stays.">
          <View style={styles.buttons}>
            <Button title="Review in Plan" size="sm" variant="primary" onPress={() => openPlan(data.suggestedBlocks.firstDate)} />
          </View>
        </Banner>
      ) : null}
      {data.heavyDay ? (
        <Banner
          title={`${capitalize(dayName(data.heavyDay.date, data.today))} looks too heavy`}
          body={`${duration(data.heavyDay.plannedMins)} planned but only ${duration(data.heavyDay.limitMins)} free that day.`}
        >
          <View style={styles.buttons}>
            <Button title="Fix it in Plan" size="sm" onPress={() => openPlan(data.heavyDay.date)} />
          </View>
        </Banner>
      ) : null}
      <NextTest exam={data.nextExam} navigation={navigation} />
      <WaitingSuggestions suggestions={data.suggestions} today={data.today} laterCount={data.laterCount} />
    </Stack>
  );
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

/** The greeting card: who you are, what to do right now, and your streak. */
function Hero({ data }) {
  const { colors, radius } = useTheme();
  const planName = useResourceStore((state) => state.entries.profile?.data?.name);
  const accountName = useAuthStore((state) => state.user?.name);
  const firstName = (planName ?? accountName ?? '').trim().split(/\s+/)[0];
  const total = data.tasks.length;
  const left = total - data.doneCount;
  const message = !total
    ? 'Nothing planned yet. Add homework or a test in Plan.'
    : left === 0
      ? 'All done for today. Brilliant work! 🎉'
      : `${left} of ${plural(total, 'task')} left. Tap a task when it’s done.`;
  return (
    <View style={[styles.hero, { borderRadius: radius.lg }]}>
      <Gradient colors={colors.hero} bubbles />
      <Text style={styles.heroHello} accessibilityRole="header">
        {greeting()}
        {firstName ? `, ${firstName}` : ''} 👋
      </Text>
      <Text style={styles.heroText}>{message}</Text>
      {total ? (
        <View style={styles.heroProgress}>
          <ProgressBar progress={data.doneCount / total} color="#FFFFFF" track="rgba(255,255,255,0.25)" height={8} style={styles.flex} />
          <Text style={styles.heroCount}>
            {data.doneCount}/{total}
          </Text>
        </View>
      ) : null}
      <View style={styles.heroStreak}>
        <Pulse active={data.streak > 0}>
          <View style={styles.flame}>
            <Icon name="flame" size={16} color="#FFB13B" />
          </View>
        </Pulse>
        <Text style={styles.heroStreakText}>
          {data.streak ? (
            <>
              <Text style={styles.bold}>{data.streak}-day streak.</Text> Rest days count.
            </>
          ) : (
            <>
              <Text style={styles.bold}>Start your streak today.</Text> Finish one task.
            </>
          )}
        </Text>
      </View>
    </View>
  );
}

function NextTest({ exam, navigation }) {
  const { colors, radius } = useTheme();
  if (!exam) {
    return (
      <Card style={styles.nextCard}>
        <View style={styles.nextHead}>
          <IconTile name="trophy" color={colors.warning} size={40} />
          <View style={styles.flex}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>NEXT TEST</Text>
            <Text style={[styles.examName, { color: colors.text }]}>No tests added yet</Text>
          </View>
        </View>
        <Text style={[styles.small, { color: colors.textSecondary }]}>Add your next test and the planner spaces out revision before it.</Text>
        <View style={styles.buttons}>
          <Button title="Add your datesheet" icon="plus" size="sm" variant="primary" onPress={() => navigation.navigate('NewDatesheet', { kind: 'unit' })} />
        </View>
      </Card>
    );
  }
  const urgent = exam.daysLeft <= 3;
  const accent = urgent ? colors.danger : colors.tint;
  const ratio = exam.readiness.total ? exam.readiness.revised / exam.readiness.total : 0;
  return (
    <Card style={styles.nextCard}>
      <View style={styles.nextHead}>
        <View style={[styles.countTile, { backgroundColor: urgent ? colors.dangerSoft : colors.tintSoft, borderRadius: radius.md }]}>
          <CountUp value={exam.daysLeft} style={[styles.countNumber, { color: accent }]} />
          <Text style={[styles.countUnit, { color: accent }]}>{exam.daysLeft === 1 ? 'day left' : 'days left'}</Text>
        </View>
        <View style={styles.flex}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>NEXT TEST</Text>
          <Text style={[styles.examName, { color: colors.text }]} numberOfLines={2}>
            {exam.name}
          </Text>
          <Text style={[styles.small, { color: colors.textSecondary }]}>{longDate(exam.date)}</Text>
        </View>
      </View>
      <View style={styles.chips}>
        {exam.chapters.map((chapter) => (
          <ChapterChip key={chapter.key} name={chapter.name} status={chapter.status} />
        ))}
      </View>
      <View style={[styles.readyRow, { borderTopColor: colors.separator }]}>
        <View style={styles.flex}>
          <Text style={{ color: colors.text, fontSize: 13.5 }}>
            <Text style={styles.bold}>
              {exam.readiness.revised} of {exam.readiness.total}
            </Text>{' '}
            chapters revised
          </Text>
          <ProgressBar progress={ratio} color={colors.success} track={colors.fill} height={6} style={styles.readyBar} />
        </View>
        <Button title="Revision plan" size="sm" onPress={() => navigation.navigate('Plan', { section: 'plan' })} />
      </View>
    </Card>
  );
}

function TodayPlan({ data, navigation }) {
  const toggle = useAsyncAction(taskActions.toggleDone);
  const act = useAsyncAction((action, task) => action(task, data.today));
  const hasSuggested = data.tasks.some(({ task }) => task.status === 'suggested');
  return (
    <Section
      title="Today’s plan"
      icon="list"
      meta={`${duration(data.plannedMins)} of ${duration(data.limitMins)} free`}
      flush
      footer={hasSuggested ? 'Suggested blocks were added by the planner. Just do them, or keep, move or remove them. Tap the pencil to edit any task.' : 'Tap the pencil to edit any task.'}
    >
      {data.tasks.length ? (
        data.tasks.map(({ task, start }, index) => (
          <View key={task.id}>
            {slotStartingAt(data.slots, data.tasks, index) ? <SlotLine slot={slotStartingAt(data.slots, data.tasks, index)} /> : index ? <Divider inset={52} /> : null}
            <TaskRow
              task={task}
              time={start === null ? '–' : clockTime(start)}
              onToggle={toggle.execute}
              onEdit={(value) => navigation.navigate('EditTask', { task: value, today: data.today })}
              disabled={toggle.pending || act.pending}
            />
            {task.status === 'suggested' && !task.done ? <SuggestedActions task={task} onAction={act.execute} busy={act.pending || toggle.pending} /> : null}
          </View>
        ))
      ) : (
        <EmptyState icon="today" message="Nothing planned. Pick a task in Plan or accept a suggestion." />
      )}
      <View style={styles.cardButtons}>
        <Button title="Start focus timer" icon="play" size="sm" variant="primary" block onPress={() => navigation.navigate('Habits', { section: 'habits' })} />
      </View>
    </Section>
  );
}

/** The slot a task is in: Homework, Self study, Test prep or Night revision. */
const slotOf = (slots, start) => (start === null ? null : (slots ?? []).find((slot) => start >= slot.start && start < slot.end) ?? null);

/** The slot that starts with the task at `index` (it differs from the task before's), or null. */
function slotStartingAt(slots, tasks, index) {
  const slot = slotOf(slots, tasks[index].start);
  const before = index ? slotOf(slots, tasks[index - 1].start) : null;
  return slot && slot !== before && !(before && before.kind === slot.kind && before.label === slot.label) ? slot : null;
}

/** A thin header naming the slot the next tasks are in. */
function SlotLine({ slot }) {
  const { colors } = useTheme();
  const color = slot.kind === 'night' ? colors.tintInk : slot.kind === 'exam' ? colors.warningInk : slot.kind === 'homework' ? colors.tint : colors.successInk;
  return (
    <View style={[styles.slotLine, { borderTopColor: colors.separator }]} testID={`today-slot-line-${slot.kind}`}>
      <Icon name={slot.kind === 'night' ? 'moon' : slot.kind === 'homework' ? 'homework' : slot.kind === 'exam' ? 'trophy' : 'book'} size={13} color={color} />
      <Text style={[styles.slotLineText, { color }]}>
        {slot.label.toUpperCase()} · {clockTime(slot.start)}–{clockTime(slot.end)}
      </Text>
    </View>
  );
}

/** Keep, move or remove a block the planner added to today. */
function SuggestedActions({ task, onAction, busy }) {
  const { colors } = useTheme();
  return (
    <View style={styles.suggestedActions}>
      {task.why ? <Text style={[styles.small, { color: colors.textSecondary }]}>{task.why}</Text> : null}
      <View style={styles.rowButtons}>
        <Button title="Keep" icon="check" size="sm" onPress={() => onAction(taskActions.keep, task)} disabled={busy} testID={`task-keep-${task.id}`} />
        <Button title="Another day" size="sm" onPress={() => onAction(taskActions.swap, task)} disabled={busy} testID={`task-swap-${task.id}`} />
        <Button title="Remove" size="sm" variant="ghost" onPress={() => onAction(taskActions.remove, task)} disabled={busy} testID={`task-remove-${task.id}`} />
      </View>
    </View>
  );
}

function WaitingSuggestions({ suggestions, today, laterCount }) {
  const busy = useAsyncAction(async (action, item) => action(item, today));
  if (!suggestions.length) return null;
  return (
    <Section
      title="Waiting for you"
      icon="bell"
      iconColor="#A855F7"
      meta={String(suggestions.length)}
      bare
      footer={`Nothing changes in your plan until you accept.${laterCount ? ` ${laterCount} saved for later in Profile.` : ''}`}
    >
      <View style={styles.stack}>
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
  flex: { flex: 1 },
  bold: { fontWeight: '800' },
  stack: { gap: 8 },
  hero: { padding: 16, gap: 8, overflow: 'hidden' },
  heroHello: { color: '#FFFFFF', fontSize: 22, fontWeight: '800' },
  heroText: { color: 'rgba(255,255,255,0.92)', fontSize: 14.5, lineHeight: 20, fontWeight: '500' },
  heroProgress: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 2 },
  heroCount: { color: '#FFFFFF', fontSize: 13, fontWeight: '800', fontVariant: ['tabular-nums'] },
  heroStreak: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2, alignSelf: 'flex-start', backgroundColor: 'rgba(255,255,255,0.16)', paddingVertical: 5, paddingLeft: 5, paddingRight: 11, borderRadius: 999 },
  flame: { width: 24, height: 24, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.95)', alignItems: 'center', justifyContent: 'center' },
  heroStreakText: { color: '#FFFFFF', fontSize: 13, flexShrink: 1 },
  label: { fontSize: 11, fontWeight: '800', letterSpacing: 0.7 },
  small: { fontSize: 13, lineHeight: 18 },
  nextCard: { gap: 8 },
  nextHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  countTile: { width: 74, paddingVertical: 8, alignItems: 'center' },
  countNumber: { fontSize: 32, fontWeight: '900', lineHeight: 36 },
  countUnit: { fontSize: 10.5, fontWeight: '800' },
  examName: { fontSize: 17, fontWeight: '800', marginTop: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  readyRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth },
  readyBar: { marginTop: 6 },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
  suggestedActions: { paddingLeft: 53, paddingRight: 12, paddingBottom: 10, gap: 6 },
  rowButtons: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  cardButtons: { paddingHorizontal: 14, paddingBottom: 12, marginTop: 2 },
  slotLine: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 2, borderTopWidth: StyleSheet.hairlineWidth },
  slotLineText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
});
