import { useNavigation } from '@react-navigation/native';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SchoolDayFields } from '../../components/domain/SchoolDayFields';
import { SuggestionCard } from '../../components/domain/SuggestionCard';
import { Button } from '../../components/ui/Button';
import { SegmentedControl } from '../../components/ui/Controls';
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
import { HOMEWORK_SLOT_OPTIONS } from '../../data/core/engine';
import { clockTime, duration, hours, initialOf, plural } from '../../utils/format';
import { schoolDayProblem, tuitionsFromForm, tuitionsToForm } from '../../utils/tuitions';
import { checkName, MAX_NAME_LENGTH } from '../../utils/validation';

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
            <DailySlots data={data} />
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
      <Muted>
        Class {data.cls}, {data.boardName ?? data.board}
      </Muted>
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

/** Saved school hours and tuitions as form values. */
const toForm = (schoolDay) => ({ schoolStart: clockTime(schoolDay.schoolStart), schoolEnd: clockTime(schoolDay.schoolEnd), tuitions: tuitionsToForm(schoolDay.tuitions) });
/** Form values as the planner takes them; also used to tell whether anything changed. */
const fromForm = (value) => ({ schoolStart: value.schoolStart, schoolEnd: value.schoolEnd, tuitions: tuitionsFromForm(value.tuitions) });

function SchoolDay({ data }) {
  // Starts again from the saved timings whenever they change (after saving or a restore).
  return <SchoolDayEditor key={JSON.stringify(data.schoolDay)} schoolDay={data.schoolDay} />;
}

function SchoolDayEditor({ schoolDay }) {
  const { colors } = useTheme();
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
      summary={`School ${clockTime(schoolDay.schoolStart)}–${clockTime(schoolDay.schoolEnd)} · ${schoolDay.tuitions.length ? plural(schoolDay.tuitions.length, 'tuition') : 'no tuition'}`}
      testID="section-school"
      footer="Study time is planned around these. Tasks already in your plan keep their days."
    >
      <View style={{ gap: 12 }}>
        <SchoolDayFields value={value} onChange={(patch) => setValue((current) => ({ ...current, ...patch }))} />
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

/** The Homework and study slots every day gets, and how long the Homework one is. */
function DailySlots({ data }) {
  const { colors } = useTheme();
  return (
    <Section
      title="Daily study slots"
      collapsible
      summary={`Homework ${duration(data.homeworkMins)} a day, then a study slot`}
      testID="section-slots"
      icon="clock"
      flush
      footer="Every day has a Homework slot after school, then a study slot. In the two weeks before a test, the study slot becomes Test prep for it."
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
      {data.todaySlots.map((slot) => (
        <View key={slot.kind} testID={`today-slot-${slot.kind}`}>
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
  row: { flexDirection: 'row', gap: 8 },
  slot: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10 },
});
