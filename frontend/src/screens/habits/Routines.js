import { memo, useEffect, useRef, useState } from 'react';
import { Animated, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Button } from '../../components/ui/Button';
import { Icon } from '../../components/ui/Icon';
import { Divider, Section } from '../../components/ui/Layout';
import { EmptyState } from '../../components/ui/States';
import { useAsyncAction } from '../../hooks/useAsyncAction';
import { habitActions } from '../../services/actions';
import { useTheme } from '../../theme/ThemeProvider';
import { shortDate, shortWeekday } from '../../utils/format';
import { IconTile } from './HabitIcon';
import { habitLook } from './habitLibrary';
import { ROUTINE_PARTS, RoutineEditor, scheduleLabel } from './RoutineEditor';

const NATIVE_DRIVER = Platform.OS !== 'web';
const without = (map, key) => Object.fromEntries(Object.entries(map).filter(([id]) => id !== key));

/**
 * The student's routine, grouped by time of day. Tick habits as you go; "Customize" adds,
 * edits, removes and reorders them. Mount with `key={today}` so ticks start fresh each day.
 */
export function Routines({ routine, today }) {
  const { colors } = useTheme();
  // Ticks shown before the save comes back; a failed save drops its entry again.
  const [ticks, setTicks] = useState({});
  const [customizing, setCustomizing] = useState(false);
  const [editor, setEditor] = useState(null);
  const move = useAsyncAction(habitActions.moveHabit);

  const isDone = (habit) => (habit.id in ticks ? ticks[habit.id] : habit.done);
  const toggle = async (habit) => {
    const next = !isDone(habit);
    setTicks((current) => ({ ...current, [habit.id]: next }));
    if (!(await habitActions.setHabitDone(habit.id, next))) setTicks((current) => without(current, habit.id));
  };

  const due = routine.habits.filter((habit) => habit.scheduledToday);
  const done = due.filter(isDone).length;
  const meta = !due.length ? 'Nothing due today' : done === due.length ? 'All done today' : `${done} of ${due.length} today`;
  const week = routine.week.map((day) => (day.date === today ? { ...day, done } : day));
  const openEditor = (habit) => setEditor({ habit, key: habit?.id ?? 'new' });
  const groups = ROUTINE_PARTS.map(({ value, label }) => ({ part: value, label, habits: routine.habits.filter((habit) => habit.part === value) })).filter(
    (group) => group.habits.length,
  );

  return (
    <Section title="Routines" meta={meta} flush footer={customizing ? 'Tap a habit to rename it or change its days. Use the arrows to reorder.' : 'Days a habit isn’t planned never break its streak.'}>
      {editor ? (
        <RoutineEditor
          key={editor.key}
          habit={editor.habit}
          defaultPart={routine.now}
          takenNames={routine.habits.filter((habit) => habit !== editor.habit).map((habit) => habit.name)}
          onClose={() => setEditor(null)}
        />
      ) : null}

      {routine.habits.length ? null : <EmptyState message="Your routine is empty. Add swimming, gym, a study step or anything you do regularly." />}

      {groups.map(({ part, label, habits }, groupIndex) => {
        const partDue = habits.filter((habit) => habit.scheduledToday);
        const partDone = partDue.filter(isDone).length;
        return (
          <View key={part}>
            {groupIndex ? <Divider /> : null}
            <View style={styles.partHead}>
              <Text style={[styles.partTitle, { color: colors.text }]} accessibilityRole="header">
                {label}
              </Text>
              {part === routine.now && !customizing ? (
                <View style={[styles.nowPill, { backgroundColor: `${colors.tint}1F` }]}>
                  <Text style={[styles.nowText, { color: colors.tintInk }]}>NOW</Text>
                </View>
              ) : null}
              {partDue.length && !customizing ? (
                <Text style={[styles.partCount, { color: partDone === partDue.length ? colors.successInk : colors.textSecondary }]}>
                  {partDone}/{partDue.length}
                </Text>
              ) : null}
            </View>
            {partDue.length && !customizing ? (
              <View style={[styles.progressTrack, { backgroundColor: colors.fill }]}>
                <View style={{ width: `${(partDone / partDue.length) * 100}%`, height: '100%', borderRadius: 2, backgroundColor: colors.success }} />
              </View>
            ) : null}
            {habits.map((habit, index) =>
              customizing ? (
                <EditRow
                  key={habit.id}
                  habit={habit}
                  first={index === 0}
                  last={index === habits.length - 1}
                  busy={move.pending}
                  onEdit={() => openEditor(habit)}
                  onMove={(direction) => move.execute(habit.id, direction)}
                />
              ) : (
                <HabitRow key={habit.id} habit={habit} checked={isDone(habit)} onToggle={() => toggle(habit)} />
              ),
            )}
          </View>
        );
      })}

      <Divider />
      <View style={styles.actions}>
        <Button title="Add habit" icon="plus" size="sm" variant={customizing ? 'primary' : 'secondary'} onPress={() => openEditor(null)} testID="routine-add" />
        <Button
          title={customizing ? 'Done' : 'Customize'}
          icon={customizing ? 'check' : 'pencil'}
          size="sm"
          variant="ghost"
          onPress={() => {
            setCustomizing((value) => !value);
            setEditor(null);
          }}
          testID="routine-customize"
        />
      </View>
      {customizing ? null : (
        <>
          <Divider />
          <WeekDots days={week} today={today} />
        </>
      )}
    </Section>
  );
}

function Caption({ habit }) {
  const { colors } = useTheme();
  const parts = [];
  if (!habit.scheduledToday) parts.push('Not today');
  if (habit.days.length < 7) parts.push(scheduleLabel(habit.days));
  if (habit.streak >= 2) parts.push(`${habit.streak} in a row`);
  if (!parts.length) return null;
  return (
    <Text style={[styles.caption, { color: colors.textSecondary }]} numberOfLines={1}>
      {parts.join(' · ')}
    </Text>
  );
}

function Badge({ habit }) {
  const { icon, color } = habitLook(habit);
  return <IconTile icon={icon} color={color} size={36} />;
}

/** One habit with a round check that pops when ticked. Habits not planned today are dimmed. */
const HabitRow = memo(function HabitRow({ habit, checked, onToggle }) {
  const { colors } = useTheme();
  const [scale] = useState(() => new Animated.Value(1));
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    if (!checked) return;
    scale.setValue(0.7);
    Animated.spring(scale, { toValue: 1, friction: 4, tension: 160, useNativeDriver: NATIVE_DRIVER }).start();
  }, [checked, scale]);
  return (
    <Pressable
      onPress={onToggle}
      testID={`habit-${habit.id}`}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={`${habit.name}${habit.scheduledToday ? '' : ', not planned today'}${habit.streak >= 2 ? `, ${habit.streak} in a row` : ''}`}
      style={({ pressed }) => [styles.row, { backgroundColor: pressed ? colors.fill : 'transparent', opacity: habit.scheduledToday || checked ? 1 : 0.55 }]}
    >
      <Badge habit={habit} />
      <View style={styles.flex}>
        <Text style={[styles.name, { color: checked ? colors.textSecondary : colors.text }]} numberOfLines={2}>
          {habit.name}
        </Text>
        <Caption habit={habit} />
      </View>
      <Animated.View
        style={[styles.check, { borderColor: checked ? colors.success : colors.fillStrong, backgroundColor: checked ? colors.success : 'transparent', transform: [{ scale }] }]}
      >
        {checked ? <Icon name="check" size={15} color="#fff" strokeWidth={3} /> : null}
      </Animated.View>
    </Pressable>
  );
});

/** A habit in Customize mode: tap to edit, arrows to reorder within its time of day. */
function EditRow({ habit, first, last, busy, onEdit, onMove }) {
  const { colors } = useTheme();
  return (
    <View style={styles.row}>
      <Pressable onPress={onEdit} accessibilityRole="button" accessibilityLabel={`Edit ${habit.name}`} testID={`edit-${habit.id}`} style={({ pressed }) => [styles.editTarget, { opacity: pressed ? 0.6 : 1 }]}>
        <Badge habit={habit} />
        <View style={styles.flex}>
          <Text style={[styles.name, { color: colors.text }]} numberOfLines={2}>
            {habit.name}
          </Text>
          <Text style={[styles.caption, { color: colors.textSecondary }]}>{scheduleLabel(habit.days)}</Text>
        </View>
        <Icon name="pencil" size={16} color={colors.textTertiary} />
      </Pressable>
      <View style={styles.arrows}>
        <ArrowButton icon="up" label={`Move ${habit.name} up`} disabled={first || busy} onPress={() => onMove(-1)} />
        <ArrowButton icon="down" label={`Move ${habit.name} down`} disabled={last || busy} onPress={() => onMove(1)} />
      </View>
    </View>
  );
}

function ArrowButton({ icon, label, disabled, onPress }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      hitSlop={4}
      style={({ pressed }) => [styles.arrow, { backgroundColor: colors.fill, opacity: disabled ? 0.35 : pressed ? 0.6 : 1 }]}
    >
      <Icon name={icon} size={16} color={colors.text} strokeWidth={2.4} />
    </Pressable>
  );
}

/** How much of each day's planned habits was done over the last seven days. */
function WeekDots({ days, today }) {
  const { colors } = useTheme();
  return (
    <View style={styles.week}>
      <Text style={[styles.weekTitle, { color: colors.textSecondary }]}>Last 7 days</Text>
      <View style={styles.weekRow}>
        {days.map((day) => {
          const share = day.due ? day.done / day.due : 0;
          const isToday = day.date === today;
          return (
            <View key={day.date} style={styles.weekDay} accessible accessibilityLabel={`${shortDate(day.date)}: ${day.done} of ${day.due} habits`}>
              <View
                style={[
                  styles.dot,
                  { backgroundColor: share >= 1 ? colors.success : share > 0 ? `${colors.success}59` : colors.fill },
                  isToday && { borderWidth: 2, borderColor: colors.text },
                ]}
              >
                {share >= 1 ? <Icon name="check" size={12} color="#fff" strokeWidth={3} /> : null}
              </View>
              <Text style={[styles.weekLabel, { color: isToday ? colors.text : colors.textSecondary, fontWeight: isToday ? '700' : '500' }]}>
                {isToday ? 'Today' : shortWeekday(day.date).charAt(0)}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  partHead: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingTop: 14 },
  partTitle: { fontSize: 15, fontWeight: '700', flexShrink: 1 },
  nowPill: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  nowText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.6 },
  partCount: { marginLeft: 'auto', fontSize: 13, fontWeight: '600', fontVariant: ['tabular-nums'] },
  progressTrack: { height: 4, borderRadius: 2, marginHorizontal: 16, marginTop: 8, marginBottom: 2, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 16, minHeight: 56 },
  editTarget: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  name: { fontSize: 16 },
  caption: { fontSize: 12, marginTop: 2 },
  check: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  arrows: { flexDirection: 'row', gap: 6 },
  arrow: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  actions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 10 },
  week: { paddingHorizontal: 16, paddingVertical: 14, gap: 10 },
  weekTitle: { fontSize: 13, fontWeight: '600' },
  weekRow: { flexDirection: 'row', justifyContent: 'space-between' },
  weekDay: { alignItems: 'center', gap: 5, flex: 1 },
  dot: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  weekLabel: { fontSize: 11 },
});
