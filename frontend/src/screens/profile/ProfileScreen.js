import { useNavigation } from '@react-navigation/native';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SATURDAY_OPTIONS, SchoolDayFields } from '../../components/domain/SchoolDayFields';
import { SuggestionCard } from '../../components/domain/SuggestionCard';
import { Button } from '../../components/ui/Button';
import { SegmentedControl, Stepper } from '../../components/ui/Controls';
import { Input } from '../../components/ui/Field';
import { Gradient } from '../../components/ui/Gradient';
import { Card, Divider, Muted, Screen, Section } from '../../components/ui/Layout';
import { AsyncBoundary } from '../../components/ui/States';
import { useAsyncAction } from '../../hooks/useAsyncAction';
import { useResource } from '../../hooks/useResource';
import { backupActions, profileActions, shareActions, suggestionActions } from '../../services/actions';
import { resources } from '../../services/resources';
import { useAuthStore } from '../../store/authStore';
import { useTheme } from '../../theme/ThemeProvider';
import { AFTER_SCHOOL_BREAK_OPTIONS, MAX_STUDY_SESSIONS, MEAL_LENGTHS, STUDY_END_OPTIONS } from '../../data/core/dayFrame';
import { HOMEWORK_SLOT_OPTIONS } from '../../data/core/engine';
import { clockTime, duration, hours, initialOf, minutesToTime, plural, shortDate, timeToMinutes } from '../../utils/format';
import { examLabel } from '../../utils/exam';
import { schoolDayProblem, tuitionsFromForm, tuitionsToForm } from '../../utils/tuitions';
import { checkName, MAX_NAME_LENGTH } from '../../utils/validation';
import { RemindersSection } from './RemindersSection';

/** Profile: who you are, school timings, sharing, your data and account. Opened from the header avatar. */
export function ProfileScreen() {
  const sharing = useResource(resources.sharing);
  return (
    <Screen refreshing={sharing.isRefreshing} onRefresh={sharing.refresh} testID="profile-screen">
      <AsyncBoundary resource={sharing}>
        {(data) => (
          <>
            <ProfileCard data={data} />
            <SchoolDay data={data} />
            <SleepAndMeals key={JSON.stringify([data.wakeAt, data.studyEnd, data.meals, data.afterSchoolBreakMins])} data={data} />
            <DailySlots data={data} />
            <RemindersSection reminders={data.reminders} />
            <Holidays holidays={data.holidays} />
            <ShareStreak streak={data.preview.streak} />
            {data.later.length ? <SavedForLater items={data.later} /> : null}
            <YourData />
            <Account />
          </>
        )}
      </AsyncBoundary>
    </Screen>
  );
}

function ProfileCard({ data }) {
  const { colors } = useTheme();
  const [editing, setEditing] = useState(false);
  return (
    <Card style={styles.profile}>
      <View style={styles.banner}>
        <Gradient colors={colors.hero} bubbles />
      </View>
      <View style={[styles.avatar, { borderColor: colors.card }]}>
        <Gradient colors={colors.hero} />
        <Text style={styles.avatarText}>{initialOf(data.name)}</Text>
      </View>
      {editing ? (
        <NameEditor current={data.name} onDone={() => setEditing(false)} />
      ) : (
        <>
          <Text style={{ color: colors.text, fontSize: 21, fontWeight: '800' }}>{data.name}</Text>
          <Button title="Edit name" icon="pencil" size="sm" variant="ghost" onPress={() => setEditing(true)} testID="edit-name" />
        </>
      )}
      <Muted>{examLabel(data)}</Muted>
      {data.preview ? (
        <View style={[styles.stats, { borderTopColor: colors.separator }]}>
          <Stat value={String(data.preview.streak)} label="day streak" />
          <Stat value={hours(data.preview.weekMins)} unit="h" label="this week" />
          <Stat value={`${data.preview.taughtPercent ?? data.preview.coveragePercent}%`} label="syllabus taught" />
        </View>
      ) : null}
    </Card>
  );
}

function Stat({ value, unit, label }) {
  const { colors } = useTheme();
  return (
    <View style={styles.stat}>
      <Text style={{ color: colors.tintInk, fontSize: 20, fontWeight: '900' }}>
        {value}
        {unit ? <Text style={{ fontSize: 14, color: colors.textSecondary }}> {unit}</Text> : null}
      </Text>
      <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{label}</Text>
    </View>
  );
}

/** Changes the name the planner uses for the student. Saved on this phone with the plan. */
function NameEditor({ current, onDone }) {
  const [name, setName] = useState(current ?? '');
  const [error, setError] = useState(null);
  const save = useAsyncAction(async () => {
    const checked = checkName(name);
    if (checked.error) {
      setError(checked.error);
      return;
    }
    if (checked.name === current) {
      onDone();
      return;
    }
    if (await profileActions.update({ name: checked.name }, 'Name saved.')) onDone();
  });
  return (
    <View style={styles.nameEditor}>
      <Input
        value={name}
        onChangeText={(text) => {
          setError(null);
          setName(text);
        }}
        placeholder="Your name"
        accessibilityLabel="Your name"
        maxLength={MAX_NAME_LENGTH}
        autoCapitalize="words"
        autoComplete="name"
        autoFocus
        onSubmitEditing={save.execute}
        returnKeyType="done"
        error={error}
        testID="field-profile-name"
      />
      <View style={styles.nameButtons}>
        <Button title="Save" variant="primary" size="sm" onPress={save.execute} loading={save.pending} testID="save-name" />
        <Button title="Cancel" variant="ghost" size="sm" onPress={onDone} />
      </View>
    </View>
  );
}

/** Saved school hours, Saturdays and tuitions as form values. */
const toForm = (schoolDay) => ({
  schoolStart: clockTime(schoolDay.schoolStart),
  schoolEnd: clockTime(schoolDay.schoolEnd),
  saturday: schoolDay.saturday ?? 'half',
  tuitions: tuitionsToForm(schoolDay.tuitions),
});
/** Form values as the planner takes them; also used to tell whether anything changed. */
const fromForm = (value) => ({ schoolStart: value.schoolStart, schoolEnd: value.schoolEnd, saturday: value.saturday, tuitions: tuitionsFromForm(value.tuitions) });
const saturdayLabel = (value) => SATURDAY_OPTIONS.find((option) => option.value === value)?.label.toLowerCase() ?? 'half day';

function SchoolDay({ data }) {
  // Starts again from the saved timings whenever they change (after saving or a restore).
  return <SchoolDayEditor key={JSON.stringify(data.schoolDay)} schoolDay={data.schoolDay} />;
}

function SchoolDayEditor({ schoolDay }) {
  const { colors } = useTheme();
  const navigation = useNavigation();
  const [value, setValue] = useState(() => toForm(schoolDay));
  const [error, setError] = useState(null);
  const changed = JSON.stringify(fromForm(value)) !== JSON.stringify(fromForm(toForm(schoolDay)));
  const save = useAsyncAction(async () => {
    const problem = schoolDayProblem(value);
    setError(problem);
    if (problem) return;
    await profileActions.update(fromForm(value), 'Timings saved. Your days are planned around them now.');
  });
  const cancel = () => {
    setError(null);
    setValue(toForm(schoolDay));
  };
  return (
    <Section
      title="School and tuition"
      icon="bag"
      iconColor="#06B6D4"
      bare
      collapsible
      summary={`School ${clockTime(schoolDay.schoolStart)}–${clockTime(schoolDay.schoolEnd)} · Saturday ${saturdayLabel(schoolDay.saturday)} · ${schoolDay.tuitions.length ? plural(schoolDay.tuitions.length, 'tuition') : 'no tuition'}`}
      testID="section-school"
      footer="Study time is planned around these. Tasks already in your plan keep their days."
    >
      <View style={{ gap: 12 }}>
        <SchoolDayFields value={value} onChange={(patch) => setValue((current) => ({ ...current, ...patch }))} />
        <Button title="Timetable: each weekday, changes and class periods" icon="list" size="sm" onPress={() => navigation.navigate('Timetable')} testID="open-timetable" />
        {error ? (
          <Text style={{ color: colors.danger }} accessibilityRole="alert">
            {error}
          </Text>
        ) : null}
        {changed ? (
          <View style={styles.row}>
            <Button title="Save timings" variant="primary" onPress={save.execute} loading={save.pending} testID="save-timings" />
            <Button title="Cancel" onPress={cancel} disabled={save.pending} />
          </View>
        ) : null}
      </View>
    </Section>
  );
}

/** The Homework and study slots every day gets: how long homework is, when self study happens, and when the day ends. */
function DailySlots({ data }) {
  const { colors } = useTheme();
  const sessions = data.studySessions ?? [];
  return (
    <Section
      title="Daily study slots"
      collapsible
      summary={`Homework ${duration(data.homeworkMins)} · self study ${sessions.length ? sessions.map((session) => `${clockTime(session.start)}–${clockTime(session.end)}`).join(' and ') : 'after homework'} · sleep at ${clockTime(data.studyEnd)}`}
      testID="section-slots"
      icon="clock"
      flush
      footer="Every day: a Homework slot after school, then self study in all the free time, then Night revision before you stop (what school, tuition and self study covered). In the two weeks before a test self study becomes Test prep; during a half-yearly or final it becomes Exam revision, with no Homework slot."
    >
      <View style={styles.padded}>
        <Muted small>Homework time each day</Muted>
        <SegmentedControl
          label="Homework time each day"
          value={data.homeworkMins}
          onChange={(homeworkMins) => profileActions.update({ homeworkMins }, `Homework slot set to ${duration(homeworkMins)} a day.`)}
          options={HOMEWORK_SLOT_OPTIONS.map((minutes) => ({ value: minutes, label: `${minutes} min` }))}
        />
      </View>
      <Divider />
      <StudySessions key={JSON.stringify(sessions)} sessions={sessions} studyEnd={data.studyEnd} />
      {data.todaySlots.map((slot) => (
        <View key={`${slot.kind}-${slot.start}`} testID={`today-slot-${slot.kind}`}>
          <Divider />
          <View style={styles.slot}>
            <Text style={{ color: colors.text, fontWeight: '600', flex: 1 }}>
              Today’s {slot.label.toLowerCase()} slot
              {slot.detail ? `: ${slot.detail}` : ''}
            </Text>
            <Muted small>
              {clockTime(slot.start)} to {clockTime(slot.end)}
            </Muted>
          </View>
        </View>
      ))}
    </Section>
  );
}

const TIME_STEP = 15;
const MEAL_ROWS = [
  { meal: 'breakfast', label: 'Breakfast' },
  { meal: 'lunch', label: 'Lunch', hint: 'This time is for days without school; on school days lunch is right after school.' },
  { meal: 'dinner', label: 'Dinner' },
];

/** When the student wakes up and sleeps, their meals, and the break after school. Nothing is planned while they sleep. */
function SleepAndMeals({ data }) {
  const { colors } = useTheme();
  const toForm = () => ({
    wakeAt: clockTime(data.wakeAt),
    studyEnd: data.studyEnd,
    afterSchoolBreakMins: data.afterSchoolBreakMins,
    meals: Object.fromEntries(MEAL_ROWS.map(({ meal }) => [meal, { at: clockTime(data.meals[meal].at), mins: data.meals[meal].mins }])),
  });
  const [value, setValue] = useState(toForm);
  const changed = JSON.stringify(value) !== JSON.stringify(toForm());
  const sleepMins = 24 * 60 - value.studyEnd + timeToMinutes(value.wakeAt);
  const setMeal = (meal, patch) => setValue((current) => ({ ...current, meals: { ...current.meals, [meal]: { ...current.meals[meal], ...patch } } }));
  const shiftTime = (time, delta) => minutesToTime(timeToMinutes(time) + delta);
  const save = useAsyncAction(() => profileActions.update({ ...value, studyEnd: clockTime(value.studyEnd) }, 'Saved. Your days are planned around your sleep and meals.'));
  return (
    <Section
      title="Sleep, meals and breaks"
      icon="moon"
      iconColor="#6366F1"
      collapsible
      summary={`Wake ${clockTime(data.wakeAt)} · sleep ${clockTime(data.studyEnd)} · dinner ${clockTime(data.meals.dinner.at)}`}
      testID="section-sleep"
      flush
      footer="Nothing is planned while you sleep, and every night ends with revision just before your sleep time."
    >
      <Stepper label="Wake up" valueLabel={value.wakeAt} onDecrement={() => setValue((current) => ({ ...current, wakeAt: shiftTime(current.wakeAt, -TIME_STEP) }))} onIncrement={() => setValue((current) => ({ ...current, wakeAt: shiftTime(current.wakeAt, TIME_STEP) }))} />
      <Divider />
      <View style={styles.padded}>
        <Muted small>Sleep at</Muted>
        <SegmentedControl label="Sleep at" value={value.studyEnd} onChange={(studyEnd) => setValue((current) => ({ ...current, studyEnd }))} options={STUDY_END_OPTIONS.map((minutes) => ({ value: minutes, label: clockTime(minutes) }))} />
        <Muted small style={{ color: sleepMins < 8 * 60 ? colors.danger : colors.textSecondary }}>
          {duration(sleepMins)} of sleep. Teens need 8 to 10 hours.
        </Muted>
      </View>
      {MEAL_ROWS.map(({ meal, label, hint }) => (
        <View key={meal}>
          <Divider />
          <Stepper label={label} valueLabel={value.meals[meal].at} onDecrement={() => setMeal(meal, { at: shiftTime(value.meals[meal].at, -TIME_STEP) })} onIncrement={() => setMeal(meal, { at: shiftTime(value.meals[meal].at, TIME_STEP) })} />
          <View style={styles.paddedTight}>
            <SegmentedControl label={`${label} length`} value={value.meals[meal].mins} onChange={(mins) => setMeal(meal, { mins })} options={MEAL_LENGTHS[meal].map((mins) => ({ value: mins, label: `${mins} min` }))} />
            {hint ? <Muted small>{hint}</Muted> : null}
          </View>
        </View>
      ))}
      <Divider />
      <View style={styles.padded}>
        <Muted small>Snack and play break after school</Muted>
        <SegmentedControl
          label="Break after school"
          value={value.afterSchoolBreakMins}
          onChange={(afterSchoolBreakMins) => setValue((current) => ({ ...current, afterSchoolBreakMins }))}
          options={AFTER_SCHOOL_BREAK_OPTIONS.map((mins) => ({ value: mins, label: mins ? `${mins} min` : 'Off' }))}
        />
        <Muted small>Study also gets a 10-minute break after each task and a 20-minute break after about 90 minutes.</Muted>
      </View>
      {changed ? (
        <View style={[styles.row, styles.padded]}>
          <Button title="Save" variant="primary" size="sm" onPress={save.execute} loading={save.pending} testID="save-sleep" />
          <Button title="Cancel" size="sm" onPress={() => setValue(toForm())} disabled={save.pending} />
        </View>
      ) : null}
    </Section>
  );
}

const SESSION_STEP = 15;
const sessionsToForm = (sessions) => sessions.map(({ start, end }) => ({ start: clockTime(start), end: clockTime(end) }));

/**
 * When the student does self study: "Auto" (the first free time after homework) or up to two
 * sessions of their own, for example 05:30–06:30 before school and 18:30–20:00. The planner fills
 * these first and puts anything left after homework.
 */
function StudySessions({ sessions, studyEnd }) {
  const { colors } = useTheme();
  const [rows, setRows] = useState(() => sessionsToForm(sessions));
  const changed = JSON.stringify(rows) !== JSON.stringify(sessionsToForm(sessions));
  const shift = (index, field, delta) =>
    setRows((current) => current.map((row, at) => (at === index ? { ...row, [field]: minutesToTime(Math.min(studyEnd, timeToMinutes(row[field]) + delta)) } : row)));
  const save = useAsyncAction(() =>
    profileActions.update({ studySessions: rows }, rows.length ? 'Study sessions saved. Self study goes in them first.' : 'Self study goes after homework again.'),
  );
  return (
    <View style={styles.padded} testID="study-sessions">
      <Muted small>Self study time</Muted>
      <SegmentedControl
        label="Self study time"
        value={rows.length ? 'own' : 'auto'}
        onChange={(mode) => setRows(mode === 'auto' ? [] : rows.length ? rows : [{ start: '18:30', end: '20:00' }])}
        options={[
          { value: 'auto', label: 'After homework' },
          { value: 'own', label: 'My own times' },
        ]}
      />
      {rows.map((row, index) => (
        <View key={index} style={[styles.sessionCard, { borderColor: colors.separator }]}>
          <View style={styles.sessionHead}>
            <Text style={{ color: colors.text, fontWeight: '700', flex: 1 }}>Session {index + 1}</Text>
            <Button title="Remove" icon="trash" size="sm" variant="ghost" onPress={() => setRows((current) => current.filter((_, at) => at !== index))} testID={`remove-session-${index}`} />
          </View>
          <Stepper label="Starts" valueLabel={row.start} onDecrement={() => shift(index, 'start', -SESSION_STEP)} onIncrement={() => shift(index, 'start', SESSION_STEP)} />
          <Stepper label="Ends" valueLabel={row.end} onDecrement={() => shift(index, 'end', -SESSION_STEP)} onIncrement={() => shift(index, 'end', SESSION_STEP)} />
        </View>
      ))}
      {rows.length && rows.length < MAX_STUDY_SESSIONS ? (
        <Button title="Add a second session" icon="plus" size="sm" onPress={() => setRows((current) => [...current, { start: '05:30', end: '06:30' }])} testID="add-session" />
      ) : null}
      <Muted small>{rows.length ? 'Self study goes in these times first; anything left goes after homework. Times inside school or tuition are skipped that day.' : 'Self study goes in the first free time after homework.'}</Muted>
      {changed ? (
        <View style={styles.row}>
          <Button title="Save study times" variant="primary" size="sm" onPress={save.execute} loading={save.pending} testID="save-sessions" />
          <Button title="Cancel" size="sm" onPress={() => setRows(sessionsToForm(sessions))} disabled={save.pending} />
        </View>
      ) : null}
    </View>
  );
}

/** Holidays and breaks (Diwali, winter break…): no school, so those days plan like a Sunday. */
function Holidays({ holidays = [] }) {
  const { colors } = useTheme();
  const navigation = useNavigation();
  const remove = useAsyncAction(profileActions.removeHoliday);
  return (
    <Section
      title="Holidays and breaks"
      icon="sun"
      iconColor={colors.warning}
      collapsible
      summary={holidays.length ? plural(holidays.length, 'break') : 'None added'}
      testID="section-holidays"
      footer="There is no school on these days, so they are planned like a Sunday. Tuition and habits still happen."
    >
      <View style={{ gap: 8 }}>
        {holidays.map((holiday) => (
          <View key={holiday.id} style={styles.holiday}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text, fontWeight: '700' }}>{holiday.name}</Text>
              <Muted small>{holiday.from === holiday.to ? shortDate(holiday.from) : `${shortDate(holiday.from)} to ${shortDate(holiday.to)}`}</Muted>
            </View>
            <Button title="Remove" icon="trash" size="sm" variant="ghost" onPress={() => remove.execute(holiday)} disabled={remove.pending} testID={`remove-holiday-${holiday.id}`} />
          </View>
        ))}
        <Button title="Add a holiday or break" icon="plus" onPress={() => navigation.navigate('AddHoliday')} block testID="add-holiday" />
      </View>
    </Section>
  );
}

/** Shares only the streak, as a message to friends; nothing about it is stored anywhere else. */
function ShareStreak({ streak }) {
  const message =
    streak > 0
      ? `I’ve studied ${streak} day${streak === 1 ? '' : 's'} in a row with Study Planner. Can you beat my streak?`
      : 'I’m starting a study streak with Study Planner. Want to keep one going with me?';
  const share = useAsyncAction(() => shareActions.send(message, 'Streak shared.'));
  return (
    <Section title="Share your streak" icon="flame" iconColor="#FF6B2C" footer="Sends only your streak. Your hours, marks and tasks stay private.">
      <Button
        title={streak > 0 ? `Share my ${streak}-day streak` : 'Invite a friend to a streak'}
        icon="spark"
        onPress={share.execute}
        loading={share.pending}
        block
        testID="share-streak"
      />
    </Section>
  );
}

function SavedForLater({ items }) {
  const today = useResource(resources.today);
  const busy = useAsyncAction((action, item) => action(item, today.data?.today ?? item.date));
  return (
    <Section title="Saved for later" icon="bell" iconColor="#A855F7" meta={String(items.length)} bare>
      <View style={{ gap: 10 }}>
        {items.map((item) => (
          <SuggestionCard
            key={item.id}
            suggestion={item}
            today={today.data?.today ?? item.date}
            busy={busy.pending}
            onAccept={(value) => busy.execute(suggestionActions.accept, value)}
            onSwap={(value) => busy.execute(suggestionActions.swap, value)}
            onSkip={(value) => busy.execute(suggestionActions.skip, value)}
          />
        ))}
      </View>
    </Section>
  );
}

function YourData() {
  const { colors } = useTheme();
  const save = useAsyncAction(backupActions.save);
  const restore = useAsyncAction(backupActions.restore);
  return (
    <Section
      title="Your data"
      icon="shield"
      iconColor={colors.success}
      footer="Your plan, tests, homework and history are saved only on this phone, never on our server. Save a backup to keep a copy or to move to a new phone."
    >
      <View style={{ gap: 8 }}>
        <Button title="Save a backup" icon="save" onPress={save.execute} loading={save.pending} disabled={restore.pending} block testID="export-backup" />
        <Button title="Restore from a backup" onPress={restore.execute} loading={restore.pending} disabled={save.pending} block testID="restore-backup" />
      </View>
    </Section>
  );
}

function Account() {
  const { colors } = useTheme();
  const navigation = useNavigation();
  const logout = useAuthStore((state) => state.logout);
  const [confirming, setConfirming] = useState(false);
  const signOut = useAsyncAction(logout);
  const startOver = useAsyncAction(async () => {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    await profileActions.startOver();
  });
  return (
    <Section
      title="Account"
      icon="key"
      iconColor={colors.danger}
      footer="Sign out keeps your plan on this phone. Start over wipes the plan but keeps your login. Delete account removes both."
    >
      <View style={{ gap: 8 }}>
        <Button title="Sign out" icon="logout" onPress={signOut.execute} loading={signOut.pending} block />
        <Button
          title={confirming ? 'Tap again to delete everything' : 'Start over with setup'}
          variant="danger"
          onPress={startOver.execute}
          loading={startOver.pending}
          block
          testID="start-over"
        />
        <Button title="Delete account" icon="trash" variant="danger" onPress={() => navigation.navigate('DeleteAccount')} block testID="open-delete-account" />
      </View>
    </Section>
  );
}

const styles = StyleSheet.create({
  profile: { alignItems: 'center', gap: 4, paddingTop: 0, overflow: 'hidden' },
  banner: { alignSelf: 'stretch', height: 62, marginHorizontal: -14, marginBottom: -34 },
  avatar: { width: 68, height: 68, borderRadius: 34, alignItems: 'center', justifyContent: 'center', marginBottom: 2, borderWidth: 4, overflow: 'hidden' },
  avatarText: { color: '#fff', fontSize: 28, fontWeight: '800' },
  stats: { flexDirection: 'row', alignSelf: 'stretch', marginTop: 10, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth },
  stat: { flex: 1, alignItems: 'center', gap: 2 },
  nameEditor: { alignSelf: 'stretch', gap: 8 },
  nameButtons: { flexDirection: 'row', justifyContent: 'center', gap: 8 },
  padded: { paddingHorizontal: 14, paddingVertical: 12, gap: 8 },
  paddedTight: { paddingHorizontal: 14, paddingBottom: 10, gap: 6 },
  row: { flexDirection: 'row', gap: 8 },
  slot: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10 },
  sessionCard: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, overflow: 'hidden' },
  sessionHead: { flexDirection: 'row', alignItems: 'center', paddingLeft: 14, paddingRight: 6, paddingTop: 6 },
  holiday: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
