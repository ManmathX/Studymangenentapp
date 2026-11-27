import { useEffect, useState } from 'react';
import { AppState, Platform, StyleSheet, Text, View } from 'react-native';
import { Button } from '../../components/ui/Button';
import { SegmentedControl, ToggleRow } from '../../components/ui/Controls';
import { Divider, Muted, Section } from '../../components/ui/Layout';
import { REMINDER_KINDS, REMINDER_LEAD_OPTIONS } from '../../data/core/reminderSettings';
import { useAsyncAction } from '../../hooks/useAsyncAction';
import { profileActions } from '../../services/actions';
import { allowExactTimes, enableNotifications, notificationsSupported, refreshPermission } from '../../services/notifications';
import { useNotificationStore } from '../../store/notificationStore';
import { useTheme } from '../../theme/ThemeProvider';

/** Each kind of reminder, in the order students see them. */
const KINDS = {
  slots: { label: 'Study slots', hint: 'Before Homework, Self study or Test prep, and Night revision, with a Start focus button' },
  tests: { label: 'Tests and homework', hint: 'The evening before a test or homework, and when your marks are likely back' },
  focus: { label: 'Focus timer and habits', hint: 'When a focus session or break ends, and habits at their set time' },
  bag: { label: 'School bag', hint: 'After dinner before a school day: books for tomorrow and homework to hand in' },
  streak: { label: 'Streak nudge', hint: 'Two hours before sleep, only on a day with nothing done yet' },
  morning: { label: 'Morning plan', hint: 'Just after you wake up: today’s slots and your next test' },
  weekly: { label: 'Weekly review', hint: 'Sunday evening: your study hours and what slipped' },
};

/** Keeps the permission up to date, including after the student comes back from the phone's settings. */
function useNotificationPermission() {
  const state = useNotificationStore();
  useEffect(() => {
    refreshPermission();
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') refreshPermission();
    });
    return () => subscription.remove();
  }, []);
  return state;
}

/** Reminders: which ones come, how early, and whether the phone lets them through. Set on this phone only. */
export function RemindersSection({ reminders }) {
  const { colors } = useTheme();
  const { permission, canAskAgain, exactTimes } = useNotificationPermission();
  // Switches move at once; the saved choice follows a moment later.
  const [choices, setChoices] = useState(reminders);
  const [saved, setSaved] = useState(reminders);
  if (saved !== reminders) {
    setSaved(reminders);
    setChoices(reminders);
  }
  const enable = useAsyncAction(enableNotifications);
  const exact = useAsyncAction(allowExactTimes);

  const change = (patch, message) => {
    setChoices((current) => ({ ...current, ...patch }));
    profileActions.update({ reminders: patch }, message);
  };

  const onCount = REMINDER_KINDS.filter((kind) => choices[kind]).length;
  const blocked = notificationsSupported && permission !== 'granted' && permission !== 'unknown';
  const summary = !notificationsSupported
    ? 'In the Android and iPhone app'
    : blocked
      ? 'Notifications are off on this phone'
      : `${onCount} of ${REMINDER_KINDS.length} on · ${choices.leadMins ? `${choices.leadMins} min before slots` : 'slots on time'}`;

  return (
    <Section
      title="Reminders"
      icon="bell"
      iconColor="#A855F7"
      collapsible
      summary={summary}
      testID="section-reminders"
      flush
      footer="Reminders are worked out from your plan on this phone and change when it does. Nothing is sent to our server, and nothing arrives while you sleep."
    >
      {!notificationsSupported ? (
        <View style={styles.padded}>
          <Muted>Reminders work in the Android and iPhone app. The web version can’t show them.</Muted>
        </View>
      ) : null}
      {blocked ? (
        <View style={styles.padded} testID="reminders-blocked">
          <Text style={{ color: colors.text, fontWeight: '700' }}>Notifications are off for Study Planner</Text>
          <Muted small>
            {permission === 'denied' && !canAskAgain ? 'Turn them on in your phone’s settings, then come back.' : 'Allow them so your reminders can reach you.'}
          </Muted>
          <Button
            title={permission === 'denied' && !canAskAgain ? 'Open phone settings' : 'Turn on notifications'}
            icon="bell"
            variant="primary"
            onPress={enable.execute}
            loading={enable.pending}
            block
            testID="enable-notifications"
          />
        </View>
      ) : null}
      {notificationsSupported && Platform.OS === 'android' && permission === 'granted' && !exactTimes ? (
        <View style={styles.padded} testID="reminders-exact">
          <Muted small>Reminders can arrive a few minutes late until you allow exact times for Study Planner.</Muted>
          <Button title="Allow exact times" icon="clock" size="sm" onPress={exact.execute} loading={exact.pending} testID="allow-exact-times" />
        </View>
      ) : null}
      {notificationsSupported ? (
        <>
          {blocked ? <Divider /> : null}
          {REMINDER_KINDS.map((kind, index) => (
            <View key={kind} testID={`reminder-${kind}`}>
              {index ? <Divider /> : null}
              <ToggleRow
                label={KINDS[kind].label}
                hint={KINDS[kind].hint}
                value={choices[kind]}
                onValueChange={(on) => change({ [kind]: on }, `${KINDS[kind].label} reminders ${on ? 'on' : 'off'}.`)}
              />
            </View>
          ))}
          <Divider />
          <View style={styles.padded}>
            <Muted small>Remind me before a study slot</Muted>
            <SegmentedControl
              label="Remind me before a study slot"
              value={choices.leadMins}
              onChange={(leadMins) => change({ leadMins }, leadMins ? `Slot reminders come ${leadMins} min early.` : 'Slot reminders come when the slot starts.')}
              options={REMINDER_LEAD_OPTIONS.map((mins) => ({ value: mins, label: mins ? `${mins} min` : 'On time' }))}
            />
          </View>
        </>
      ) : null}
    </Section>
  );
}

const styles = StyleSheet.create({
  padded: { paddingHorizontal: 14, paddingVertical: 12, gap: 8 },
});
