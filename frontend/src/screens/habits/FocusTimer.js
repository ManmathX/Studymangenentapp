import { useEffect } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';
import { TimerRing } from '../../components/domain/Charts';
import { Button } from '../../components/ui/Button';
import { Chip, ChipGroup, SegmentedControl } from '../../components/ui/Controls';
import { Section } from '../../components/ui/Layout';
import { useTimerStore } from '../../store/timerStore';
import { useSubjectInfo } from '../../store/subjectStore';
import { useTheme } from '../../theme/ThemeProvider';
import { countdown } from '../../utils/format';

/** Focus timer bound to the global timer store, so it keeps running across tabs. */
export function FocusTimer({ subjects }) {
  const { colors } = useTheme();
  const timer = useTimerStore();
  const started = timer.leftSeconds < timer.totalSeconds;
  const subjectInfo = useSubjectInfo();
  const subject = subjects.includes(timer.subject) ? timer.subject : subjects[0];
  const color = subjectInfo(subject).color;
  const { setSubject } = timer;
  // The timer starts on Maths; students whose board or setup has no Maths log to their first subject.
  useEffect(() => {
    if (subject && subject !== timer.subject) setSubject(subject);
  }, [subject, timer.subject, setSubject]);

  return (
    <Section title="Focus" meta="Logged to a subject">
      <ChipGroup label="Subject">
        {subjects.map((id) => (
          <Chip key={id} label={subjectInfo(id).name} color={subjectInfo(id).color} selected={subject === id} disabled={timer.running} onPress={() => timer.setSubject(id)} />
        ))}
      </ChipGroup>
      <View style={styles.ring}>
        <TimerRing progress={timer.leftSeconds / timer.totalSeconds} color={color}>
          <Text style={[styles.time, { color: colors.text }]} accessibilityRole="timer" accessibilityLabel={`${countdown(timer.leftSeconds)} left`}>
            {countdown(timer.leftSeconds)}
          </Text>
          <Text style={{ color: colors.textSecondary }}>{subjectInfo(subject).name}</Text>
        </TimerRing>
      </View>
      <SegmentedControl
        label="Session length"
        value={timer.totalSeconds / 60}
        onChange={timer.setLength}
        options={[15, 25, 45].map((minutes) => ({ value: minutes, label: `${minutes} min`, disabled: timer.running || started }))}
      />
      <View style={styles.controls}>
        <Button title="Log" onPress={() => timer.finish(false)} disabled={!started} />
        <Button
          title={timer.running ? 'Pause' : started ? 'Resume' : 'Start'}
          variant="primary"
          onPress={() => {
            if (subject !== timer.subject) timer.setSubject(subject);
            timer.toggle();
          }}
          testID="timer-toggle"
        />
      </View>
      {__DEV__ ? (
        <View style={styles.fast}>
          <Switch value={timer.fastForward} onValueChange={timer.setFastForward} accessibilityLabel="Fast-forward the timer 60 times (development builds only)" />
          <Text style={{ color: colors.textSecondary }}>Fast-forward 60× (dev only)</Text>
        </View>
      ) : null}
    </Section>
  );
}

const styles = StyleSheet.create({
  ring: { marginVertical: 16 },
  time: { fontSize: 40, fontWeight: '700', fontVariant: ['tabular-nums'] },
  controls: { flexDirection: 'row', justifyContent: 'center', gap: 16, marginTop: 14 },
  fast: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 12 },
});
