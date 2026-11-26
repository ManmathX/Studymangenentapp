import { useEffect, useState } from 'react';
import { Animated, Platform, Pressable, StyleSheet, Switch, Text, useWindowDimensions, View } from 'react-native';
import { TimerRing } from '../../components/domain/Charts';
import { Chip, ChipGroup, SegmentedControl } from '../../components/ui/Controls';
import { Icon } from '../../components/ui/Icon';
import { Card, Section } from '../../components/ui/Layout';
import { BREAK_MINS, FOCUS_LENGTHS, isActive, useTimerStore } from '../../store/timerStore';
import { useSubjectInfo } from '../../store/subjectStore';
import { useTheme } from '../../theme/ThemeProvider';
import { confirmAction } from '../../utils/confirm';
import { countdown, duration } from '../../utils/format';

const NATIVE_DRIVER = Platform.OS !== 'web';

/** Focus timer bound to the global timer store, so it keeps running across tabs and restarts. */
export function FocusTimer({ subjects, todayMins }) {
  const { colors } = useTheme();
  const timer = useTimerStore();
  const subjectInfo = useSubjectInfo();
  const { width } = useWindowDimensions();
  const active = isActive(timer);
  const onBreak = timer.mode === 'break';
  const subject = subjects.includes(timer.subject) ? timer.subject : subjects[0];
  const accent = onBreak ? colors.success : subjectInfo(subject).color;
  const { setSubject } = timer;

  // The timer starts on Maths; students whose board or setup has no Maths log to their first subject.
  useEffect(() => {
    if (subject && subject !== timer.subject && !active) setSubject(subject);
  }, [subject, timer.subject, setSubject, active]);

  const ringSize = Math.round(Math.min(244, Math.max(176, Math.min(width, 640) - 132)));
  const elapsed = timer.totalSeconds - timer.leftSeconds;
  const phase = onBreak ? 'Break' : timer.running ? 'Focusing' : active ? 'Paused' : 'Ready';
  const phaseColor = onBreak ? colors.successInk : timer.running ? accent : active ? colors.warningInk : colors.textSecondary;

  const onDiscard = async () => {
    const minutes = Math.floor(elapsed / 60);
    if (minutes >= 1) {
      const confirmed = await confirmAction({
        title: 'Discard this session?',
        message: `The ${duration(minutes)} you’ve focused so far won’t be logged.`,
        confirmLabel: 'Discard',
      });
      if (!confirmed) return;
    }
    timer.discard();
  };

  return (
    <Section title="Focus" meta={onBreak ? `${BREAK_MINS}-min break` : active ? subjectInfo(subject).name : 'Pick a subject'}>
      {!active && !onBreak ? (
        <ChipGroup label="Subject">
          {subjects.map((id) => (
            <Chip key={id} label={subjectInfo(id).name} color={subjectInfo(id).color} selected={subject === id} onPress={() => timer.setSubject(id)} />
          ))}
        </ChipGroup>
      ) : null}

      <View style={styles.ring}>
        <TimerRing progress={timer.totalSeconds ? elapsed / timer.totalSeconds : 0} color={accent} size={ringSize} strokeWidth={9} trackColor={`${accent}24`}>
          <Text style={[styles.phase, { color: phaseColor }]}>{phase.toUpperCase()}</Text>
          <Text
            style={[styles.time, { color: colors.text, fontSize: Math.round(ringSize * 0.21) }]}
            accessibilityRole="timer"
            accessibilityLabel={`${phase}. ${countdown(timer.leftSeconds)} left`}
          >
            {countdown(timer.leftSeconds)}
          </Text>
          <Text style={[styles.ringCaption, { color: colors.textSecondary }]} numberOfLines={1}>
            {onBreak ? 'Stand up, stretch, drink water' : `${subjectInfo(subject).name} · ${duration(timer.totalSeconds / 60)}`}
          </Text>
        </TimerRing>
      </View>

      {!active && !onBreak ? (
        <SegmentedControl label="Session length" value={timer.focusMins} onChange={timer.setLength} options={FOCUS_LENGTHS.map((minutes) => ({ value: minutes, label: `${minutes} min` }))} />
      ) : null}

      <View style={styles.controls}>
        <SideButton
          icon="close"
          label={onBreak ? 'Skip' : 'Discard'}
          onPress={onBreak ? timer.skipBreak : onDiscard}
          hidden={!active}
          testID={onBreak ? 'timer-skip-break' : 'timer-discard'}
          accessibilityLabel={onBreak ? 'Skip the break' : 'Discard this session without logging it'}
        />
        <PrimaryButton
          running={timer.running}
          color={accent}
          label={timer.running ? 'Pause' : active ? 'Resume' : 'Start'}
          disabled={timer.saving}
          onPress={() => {
            if (!active && !onBreak && subject !== timer.subject) timer.setSubject(subject);
            timer.toggle();
          }}
        />
        <SideButton
          icon="stop"
          label="Finish"
          onPress={() => timer.finish(false)}
          hidden={!active || onBreak}
          disabled={timer.saving}
          testID="timer-finish"
          accessibilityLabel="Finish now and log the time so far"
        />
      </View>

      {timer.result && !active && !onBreak ? (
        <CompletionCard
          result={timer.result}
          todayMins={todayMins}
          onBreak={timer.startBreak}
          onAgain={timer.start}
          onDismiss={timer.dismissResult}
        />
      ) : null}

      {__DEV__ ? (
        <View style={styles.fast}>
          <Switch value={timer.fastForward} onValueChange={timer.setFastForward} accessibilityLabel="Fast-forward the timer 60 times (development builds only)" />
          <Text style={{ color: colors.textSecondary, fontSize: 13 }}>Fast-forward 60× (dev only)</Text>
        </View>
      ) : null}
    </Section>
  );
}

function PrimaryButton({ running, color, label, onPress, disabled }) {
  const { colors } = useTheme();
  return (
    <View style={styles.controlColumn}>
      <Pressable
        onPress={onPress}
        disabled={disabled}
        testID="timer-toggle"
        accessibilityRole="button"
        accessibilityLabel={label === 'Start' ? 'Start focus session' : label}
        accessibilityState={{ disabled }}
        style={({ pressed }) => [styles.primary, { backgroundColor: color, opacity: disabled ? 0.5 : 1, transform: [{ scale: pressed ? 0.93 : 1 }] }]}
      >
        <Icon name={running ? 'pause' : 'play'} size={30} color={colors.onTint} />
      </Pressable>
      <Text style={[styles.controlLabel, { color: colors.text }]}>{label}</Text>
    </View>
  );
}

function SideButton({ icon, label, onPress, hidden, disabled = false, testID, accessibilityLabel }) {
  const { colors } = useTheme();
  if (hidden) return <View style={styles.controlColumn} />;
  return (
    <View style={styles.controlColumn}>
      <Pressable
        onPress={onPress}
        disabled={disabled}
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityState={{ disabled }}
        style={({ pressed }) => [styles.side, { backgroundColor: colors.fill, opacity: disabled ? 0.45 : 1, transform: [{ scale: pressed ? 0.92 : 1 }] }]}
      >
        <Icon name={icon} size={icon === 'stop' ? 18 : 20} color={colors.text} strokeWidth={2.4} />
      </Pressable>
      <Text style={[styles.controlLabel, { color: colors.textSecondary }]}>{label}</Text>
    </View>
  );
}

/** Shown after a session is logged: what was saved, today's total, and what to do next. */
function CompletionCard({ result, todayMins, onBreak, onAgain, onDismiss }) {
  const { colors, radius } = useTheme();
  const subjectInfo = useSubjectInfo();
  const [appear] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.spring(appear, { toValue: 1, useNativeDriver: NATIVE_DRIVER, friction: 7, tension: 80 }).start();
  }, [appear]);
  const name = subjectInfo(result.subject).name;
  return (
    <Animated.View
      style={{ opacity: appear, transform: [{ scale: appear.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) }] }}
      accessibilityLiveRegion="polite"
      testID="focus-complete"
    >
      <Card style={[styles.done, { backgroundColor: `${colors.success}1A`, borderRadius: radius.md }]}>
        <View style={styles.doneHead}>
          <View style={[styles.doneIcon, { backgroundColor: colors.success }]}>
            <Icon name="check" size={18} color="#fff" strokeWidth={3} />
          </View>
          <View style={styles.flex}>
            <Text style={[styles.doneTitle, { color: colors.text }]}>{result.completed ? 'Session complete' : 'Session logged'}</Text>
            <Text style={{ color: colors.textSecondary, fontSize: 14 }}>
              {duration(result.mins)} of {name}
              {todayMins ? ` · ${duration(todayMins)} today` : ''}
            </Text>
          </View>
          <Pressable onPress={onDismiss} accessibilityRole="button" accessibilityLabel="Close" hitSlop={10} style={styles.dismiss}>
            <Icon name="close" size={16} color={colors.textSecondary} />
          </Pressable>
        </View>
        <View style={styles.doneButtons}>
          {result.completed ? <SmallAction icon="coffee" label={`${BREAK_MINS}-min break`} onPress={onBreak} tone="primary" /> : null}
          <SmallAction icon="play" label="Start another" onPress={onAgain} tone={result.completed ? 'plain' : 'primary'} />
        </View>
      </Card>
    </Animated.View>
  );
}

function SmallAction({ icon, label, onPress, tone }) {
  const { colors, radius } = useTheme();
  const primary = tone === 'primary';
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.smallAction,
        { borderRadius: radius.pill, backgroundColor: primary ? colors.success : colors.card, opacity: pressed ? 0.75 : 1 },
      ]}
    >
      <Icon name={icon} size={15} color={primary ? '#fff' : colors.text} />
      <Text style={{ color: primary ? '#fff' : colors.text, fontWeight: '600', fontSize: 14 }}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  ring: { marginTop: 18, marginBottom: 14 },
  phase: { fontSize: 12, fontWeight: '700', letterSpacing: 1.2, marginBottom: 2 },
  time: { fontWeight: '700', fontVariant: ['tabular-nums'], letterSpacing: -0.5 },
  ringCaption: { fontSize: 14, marginTop: 2, maxWidth: 170, textAlign: 'center' },
  controls: { flexDirection: 'row', justifyContent: 'center', alignItems: 'flex-start', gap: 28, marginTop: 18 },
  controlColumn: { alignItems: 'center', gap: 6, minWidth: 64 },
  primary: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center' },
  side: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', marginTop: 10 },
  controlLabel: { fontSize: 13, fontWeight: '600' },
  done: { marginTop: 18, padding: 14, gap: 12 },
  doneHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  doneIcon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  doneTitle: { fontSize: 16, fontWeight: '700' },
  dismiss: { padding: 4 },
  doneButtons: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  smallAction: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, minHeight: 36 },
  fast: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 14 },
});
