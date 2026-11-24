import { useNavigation } from '@react-navigation/native';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SuggestionCard } from '../../components/domain/SuggestionCard';
import { Button } from '../../components/ui/Button';
import { CheckRow, SegmentedControl, ToggleRow } from '../../components/ui/Controls';
import { Icon } from '../../components/ui/Icon';
import { Card, Divider, Muted, Screen, Section } from '../../components/ui/Layout';
import { AsyncBoundary } from '../../components/ui/States';
import { useAsyncAction } from '../../hooks/useAsyncAction';
import { useResource } from '../../hooks/useResource';
import { profileActions, suggestionActions } from '../../services/actions';
import { resources } from '../../services/resources';
import { useAuthStore } from '../../store/authStore';
import { usePreferencesStore } from '../../store/preferencesStore';
import { useTheme } from '../../theme/ThemeProvider';
import { hours, initialOf, shortDate } from '../../utils/format';

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
            <AppearanceSection />
            <AppMode data={data} />
            <ParentView data={data} />
            <StudyGroups data={data} />
            {data.later.length ? <SavedForLater items={data.later} /> : null}
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
        {['Under-18 profile', 'No ads', 'No public ranking', 'Friends by approval'].map((label, index) => (
          <View key={label} style={[styles.badge, { backgroundColor: colors.fill }]}>
            {index === 0 ? <Icon name="shield" size={12} color={colors.textSecondary} /> : null}
            <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{label}</Text>
          </View>
        ))}
      </View>
    </Card>
  );
}

const APPEARANCE_OPTIONS = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

function AppearanceSection() {
  const appearance = usePreferencesStore((state) => state.appearance);
  const setAppearance = usePreferencesStore((state) => state.setAppearance);
  return (
    <Section title="Appearance" flush footer="System follows your phone’s light or dark setting. Saved on this device.">
      <View style={styles.padded}>
        <SegmentedControl label="Appearance" value={appearance} onChange={setAppearance} options={APPEARANCE_OPTIONS} />
      </View>
    </Section>
  );
}

function AppMode({ data }) {
  return (
    <Section title="App mode" flush footer="Simple mode hides priority labels and the weekly review, and keeps days to 2 hours.">
      <View style={styles.padded}>
        <Muted small>Age mode</Muted>
        <SegmentedControl
          label="Age mode"
          value={data.ageMode}
          onChange={(ageMode) =>
            profileActions.update({ ageMode }, ageMode === 'simple' ? 'Simple mode: shorter days, fewer labels.' : 'Deeper mode: priorities and weekly review are back.')
          }
          options={[
            { value: 'simple', label: 'Simple, Class 6–8' },
            { value: 'deeper', label: 'Deeper, Class 9–12' },
          ]}
        />
      </View>
      <Divider />
      <ToggleRow
        label="Exam-season mode"
        hint="Mutes study groups and allows a longer, tighter plan."
        value={data.examSeason}
        onValueChange={(examSeason) => profileActions.update({ examSeason }, examSeason ? 'Exam-season mode on.' : 'Exam-season mode off.')}
      />
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
  if (items.marks) lines.push('Marks: none entered yet');
  return lines;
}

function ParentView({ data }) {
  const { colors } = useTheme();
  const { sharing } = data;
  const lines = previewLines(data);
  return (
    <Section
      title="Parent view"
      flush
      footer={`${sharing.parent ? '' : 'Parent view is off. Nothing is shared. '}Parents can see a summary but can’t add or change tasks. Your plan is yours.`}
    >
      <ToggleRow
        label="Weekly summary for a parent"
        hint="A summary once a week. No task lists, check-ins or timers."
        value={sharing.parent}
        onValueChange={(parent) => profileActions.update({ sharing: { parent } }, parent ? 'Parent view on.' : 'Parent view off. Nothing is shared.')}
      />
      {sharing.parent ? (
        <>
          <Divider />
          {SHARE_ITEMS.map(([key, label]) => (
            <CheckRow key={key} label={label} checked={sharing.items[key]} onToggle={() => profileActions.update({ sharing: { items: { [key]: !sharing.items[key] } } })} />
          ))}
          <View style={[styles.preview, { backgroundColor: colors.fill }]}>
            <Text style={{ color: colors.text, fontWeight: '700', marginBottom: 6 }}>What your parent would see on Sunday evening</Text>
            {lines.length ? (
              lines.map((line) => (
                <Text key={line} style={{ color: colors.textSecondary, lineHeight: 21 }}>
                  • {line}
                </Text>
              ))
            ) : (
              <Muted small>Nothing selected, so no summary would be sent.</Muted>
            )}
          </View>
        </>
      ) : null}
    </Section>
  );
}

function StudyGroups({ data }) {
  const muted = data.examSeason;
  return (
    <Section title="Study groups" flush footer="Never your hours, marks or tasks. No public leaderboards.">
      <ToggleRow
        label="Join study groups"
        hint={muted ? 'Muted while exam-season mode is on.' : 'Friends see your streak only.'}
        value={data.sharing.groups && !muted}
        disabled={muted}
        onValueChange={(groups) => profileActions.update({ sharing: { groups } }, groups ? 'Study groups preference saved.' : 'You left study groups.')}
      />
      {data.sharing.groups && !muted ? (
        <View style={styles.padded}>
          <Muted small>Groups with classmates are coming soon. Your choice is saved, and only your streak will ever be shared.</Muted>
        </View>
      ) : null}
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
    <Section title="Account" footer="Start over deletes your plan, homework, tests and history but keeps your login. Delete account removes everything, including the login.">
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
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 },
  padded: { padding: 16, gap: 8 },
  preview: { margin: 16, marginTop: 8, padding: 14, borderRadius: 12 },
});
