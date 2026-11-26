import { useNavigation } from '@react-navigation/native';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SuggestionCard } from '../../components/domain/SuggestionCard';
import { Button } from '../../components/ui/Button';
import { ToggleRow } from '../../components/ui/Controls';
import { Icon } from '../../components/ui/Icon';
import { Card, Muted, Screen, Section } from '../../components/ui/Layout';
import { AsyncBoundary } from '../../components/ui/States';
import { useAsyncAction } from '../../hooks/useAsyncAction';
import { useResource } from '../../hooks/useResource';
import { profileActions, suggestionActions } from '../../services/actions';
import { resources } from '../../services/resources';
import { useAuthStore } from '../../store/authStore';
import { usePreferencesStore } from '../../store/preferencesStore';
import { useTheme } from '../../theme/ThemeProvider';
import { hours, initialOf } from '../../utils/format';

export function PrivacyScreen() {
  const sharing = useResource(resources.sharing);
  return (
    <Screen refreshing={sharing.isRefreshing} onRefresh={sharing.refresh} testID="privacy-screen">
      <AsyncBoundary resource={sharing}>
        {(data) => (
          <>
            <ProfileCard data={data} />
            <AppearanceSection />
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

function AppearanceSection() {
  const { scheme } = useTheme();
  const setAppearance = usePreferencesStore((state) => state.setAppearance);
  return (
    <Section title="Appearance" flush footer="Follows your phone until you change it. Saved on this device.">
      <ToggleRow label="Dark mode" value={scheme === 'dark'} onValueChange={(on) => setAppearance(on ? 'dark' : 'light')} />
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
  stats: { flexDirection: 'row', alignSelf: 'stretch', marginTop: 12, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
  stat: { flex: 1, alignItems: 'center', gap: 2 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 },
});
