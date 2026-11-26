import { useNavigation } from '@react-navigation/native';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SchoolDayFields } from '../../components/domain/SchoolDayFields';
import { SuggestionCard } from '../../components/domain/SuggestionCard';
import { Button } from '../../components/ui/Button';
import { CheckRow, SegmentedControl, ToggleRow } from '../../components/ui/Controls';
import { Icon } from '../../components/ui/Icon';
import { Card, Divider, Muted, Screen, Section } from '../../components/ui/Layout';
import { AsyncBoundary } from '../../components/ui/States';
import { useAsyncAction } from '../../hooks/useAsyncAction';
import { useResource } from '../../hooks/useResource';
import { backupActions, profileActions, shareActions, suggestionActions } from '../../services/actions';
import { resources } from '../../services/resources';
import { useAuthStore } from '../../store/authStore';
import { usePreferencesStore } from '../../store/preferencesStore';
import { useTheme } from '../../theme/ThemeProvider';
import { HOMEWORK_SLOT_OPTIONS } from '../../data/core/engine';
import { clockTime, duration, hours, initialOf, shortDate } from '../../utils/format';
import { schoolDayProblem, tuitionsFromForm, tuitionsToForm } from '../../utils/tuitions';

const SHARE_ITEMS = [
  ['hours', 'Study hours against the goal'],
  ['streak', 'Streak'],
  ['coverage', 'Syllabus coverage'],
  ['tests', 'Upcoming tests'],
  ['marks', 'Marks and grades'],
];


export function PrivacyScreen() {
  const sharing = useResource(resources.sharing);
  return (
    <Screen refreshing={sharing.isRefreshing} onRefresh={sharing.refresh} testID="privacy-screen">
      <AsyncBoundary resource={sharing}>
        {(data) => (
          <>
            <ProfileCard data={data} />
            <SchoolDay data={data} />
            <DailySlots data={data} />
            <AppearanceSection />
            <ParentView data={data} />
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
  return (
    <Card style={styles.profile}>
      <View style={[styles.avatar, { backgroundColor: colors.tint }]}>
        <Text style={styles.avatarText}>{initialOf(data.name)}</Text>
      </View>
      <Text style={{ color: colors.text, fontSize: 22, fontWeight: '700' }}>{data.name}</Text>
      <Muted>
        Class {data.cls}, {data.boardName ?? data.board}
      </Muted>
      <View style={styles.badges}>
        {['Under-18 profile', 'No ads', 'No public ranking', 'Plan stays on this phone'].map((label, index) => (
          <View key={label} style={[styles.badge, { backgroundColor: colors.fill }]}>
            {index === 0 ? <Icon name="shield" size={12} color={colors.textSecondary} /> : null}
            <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{label}</Text>
          </View>
        ))}
      </View>
      {data.preview ? <View style={[styles.stats, { borderTopColor: colors.separator }]}>
        <Stat value={String(data.preview.streak)} label="day streak" />
        <Stat value={hours(data.preview.weekMins)} unit="h" label="this week" />
        <Stat value={`${data.preview.taughtPercent ?? data.preview.coveragePercent}%`} label="syllabus taught" />
      </View> : null}
    </Card>
  );
}

function Stat({ value, unit, label }) {
  const { colors } = useTheme();
  return (
    <View style={styles.stat}>
      <Text style={{ color: colors.text, fontSize: 22, fontWeight: '800' }}>
        {value}
        {unit ? <Text style={{ fontSize: 14, color: colors.textSecondary }}> {unit}</Text> : null}
      </Text>
      <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{label}</Text>
    </View>
  );
}
/** Saved school hours and tuitions as form values. */
const toForm = (schoolDay) => ({
  schoolStart: clockTime(schoolDay.schoolStart),
  schoolEnd: clockTime(schoolDay.schoolEnd),
  tuitions: tuitionsToForm(schoolDay.tuitions),
});
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
    <Section title="School and tuition" bare footer="Study time is planned around these. Tasks already in your plan keep their days.">
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
              Today’s {slot.label.toLowerCase()} slot{slot.detail ? `: ${slot.detail}` : ''}
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

function AppearanceSection() {
  const { scheme } = useTheme();
  const setAppearance = usePreferencesStore((state) => state.setAppearance);
  return (
    <Section title="Appearance" flush footer="Follows your phone until you change it. Saved on this device.">
      <ToggleRow label="Dark mode" value={scheme === 'dark'} onValueChange={(on) => setAppearance(on ? 'dark' : 'light')} />
    </Section>
  );
}

function previewLines(data) {
  const { items } = data.sharing;
  const { preview } = data;
  const lines = [];
  if (items.hours) lines.push(`Studied ${hours(preview.weekMins)} h this week, goal ${hours(preview.weeklyGoalMins)} h`);
  if (items.streak) lines.push(`Streak: ${preview.streak} days`);
  if (items.coverage) lines.push(`Syllabus covered: ${preview.coveragePercent}%`);
  if (items.tests && preview.nextExam) lines.push(`Next test: ${preview.nextExam.name}, ${shortDate(preview.nextExam.date)}`);
  if (items.marks) {
    const marks = preview.recentMarks.map((test) => `${test.name} ${test.score}/${test.outOf} (${test.percent}%)`);
    lines.push(marks.length ? `Marks: ${marks.join('; ')}` : 'Marks: none entered in the last two weeks');
  }
  return lines;
}

const summaryMessage = (data, lines) => [`${data.name}’s study week`, ...lines.map((line) => `• ${line}`)].join('\n');

function ParentView({ data }) {
  const { colors } = useTheme();
  const { sharing } = data;
  const lines = previewLines(data);
  const send = useAsyncAction(() => shareActions.send(summaryMessage(data, lines), 'Summary sent.'));
  return (
    <Section
      title="Parent summary"
      flush
      footer="Nothing is shared unless you send it. Parents see only this summary; they can’t add or change tasks. Your plan is yours."
    >
      <ToggleRow
        label="Weekly summary for a parent"
        hint="Pick what’s in it, then send it yourself on WhatsApp, SMS or email."
        value={sharing.parent}
        onValueChange={(parent) => profileActions.update({ sharing: { parent } }, parent ? 'Parent summary on.' : 'Parent summary off.')}
      />
      {sharing.parent ? (
        <>
          <Divider />
          {SHARE_ITEMS.map(([key, label]) => (
            <CheckRow key={key} label={label} checked={sharing.items[key]} onToggle={() => profileActions.update({ sharing: { items: { [key]: !sharing.items[key] } } })} />
          ))}
          <View style={[styles.preview, { backgroundColor: colors.fill }]}>
            <Text style={{ color: colors.text, fontWeight: '700', marginBottom: 6 }}>This week’s summary</Text>
            {lines.length ? (
              lines.map((line) => (
                <Text key={line} style={{ color: colors.textSecondary, lineHeight: 21 }}>
                  • {line}
                </Text>
              ))
            ) : (
              <Muted small>Nothing selected, so there is nothing to send.</Muted>
            )}
          </View>
          <View style={styles.sendRow}>
            <Button title="Send to a parent" variant="primary" onPress={send.execute} loading={send.pending} disabled={!lines.length} block testID="send-parent-summary" />
          </View>
        </>
      ) : null}
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
    <Section title="Share your streak" footer="Sends only your streak, from this phone. Your hours, marks and tasks stay private, and there are no public leaderboards.">
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
    <Section title="Saved for later" meta={String(items.length)} bare>
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
  const save = useAsyncAction(backupActions.save);
  const restore = useAsyncAction(backupActions.restore);
  return (
    <Section
      title="Your data"
      footer="Your plan, tests, homework and history are saved only on this phone, never on our server. Save a backup to keep a copy or to move to a new phone."
    >
      <View style={{ gap: 10 }}>
        <Button title="Save a backup" onPress={save.execute} loading={save.pending} disabled={restore.pending} block testID="export-backup" />
        <Button title="Restore from a backup" onPress={restore.execute} loading={restore.pending} disabled={save.pending} block testID="restore-backup" />
      </View>
    </Section>
  );
}

function Account() {
  const navigation = useNavigation();
  const logout = useAuthStore((state) => state.logout);
  const hasPassword = useAuthStore((state) => state.user?.hasPassword !== false);
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
      footer="Signing out keeps your plan on this phone for when you sign in again. Start over deletes your plan, homework, tests and history but keeps your login. Delete account removes your login and the plan on this phone."
    >
      <View style={{ gap: 10 }}>
        <Button title="Sign out" icon="logout" onPress={signOut.execute} loading={signOut.pending} block />
        {hasPassword ? <Button title="Change password" icon="key" onPress={() => navigation.navigate('ChangePassword')} block testID="open-change-password" /> : null}
        <Button title={confirming ? 'Tap again to delete everything' : 'Start over with setup'} variant="danger" onPress={startOver.execute} loading={startOver.pending} block testID="start-over" />
        <Button title="Delete account" icon="trash" variant="danger" onPress={() => navigation.navigate('DeleteAccount')} block testID="open-delete-account" />
      </View>
    </Section>
  );
}

const styles = StyleSheet.create({
  profile: { alignItems: 'center', gap: 6 },
  avatar: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  avatarText: { color: '#fff', fontSize: 28, fontWeight: '700' },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center', marginTop: 8 },
  stats: { flexDirection: 'row', alignSelf: 'stretch', marginTop: 12, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
  stat: { flex: 1, alignItems: 'center', gap: 2 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 },
  padded: { padding: 16, gap: 8 },
  row: { flexDirection: 'row', gap: 10 },
  preview: { margin: 16, marginTop: 8, padding: 14, borderRadius: 12 },
  sendRow: { paddingHorizontal: 16, paddingBottom: 16 },
  slot: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 12 },
});
