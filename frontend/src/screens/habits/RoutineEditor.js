import { useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SegmentedControl, Stepper, ToggleRow } from '../../components/ui/Controls';
import { Icon } from '../../components/ui/Icon';
import { useAsyncAction } from '../../hooks/useAsyncAction';
import { habitActions } from '../../services/actions';
import { useTheme } from '../../theme/ThemeProvider';
import { clockTime, duration, minutesToTime, timeToMinutes } from '../../utils/format';
import { IconTile } from './HabitIcon';
import { colorOfIcon, findIdea, HABIT_CATEGORIES, HABIT_LIBRARY, habitLook } from './habitLibrary';

export const ROUTINE_PARTS = [
  { value: 'morning', label: 'Morning' },
  { value: 'afternoon', label: 'After school' },
  { value: 'evening', label: 'Evening' },
];

/** Monday first, as students read a timetable. 0 = Sunday. */
const WEEKDAYS = [
  { day: 1, short: 'Mon', letter: 'M', long: 'Monday' },
  { day: 2, short: 'Tue', letter: 'T', long: 'Tuesday' },
  { day: 3, short: 'Wed', letter: 'W', long: 'Wednesday' },
  { day: 4, short: 'Thu', letter: 'T', long: 'Thursday' },
  { day: 5, short: 'Fri', letter: 'F', long: 'Friday' },
  { day: 6, short: 'Sat', letter: 'S', long: 'Saturday' },
  { day: 0, short: 'Sun', letter: 'S', long: 'Sunday' },
];
const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6];
const NAMED_DAYS = [
  { label: 'Every day', days: EVERY_DAY },
  { label: 'Weekdays', days: [1, 2, 3, 4, 5] },
  { label: 'Weekends', days: [0, 6] },
];
const sameDays = (a, b) => a.length === b.length && a.every((day) => b.includes(day));
/** A habit with a set time blocks that time on the plan. Lengths offered, and where a new time starts by time of day. */
const HABIT_LENGTHS = [15, 30, 45, 60, 90, 120];
/** Habits without a set time are short; the plan puts them in their part of the day. */
const ANY_TIME_LENGTHS = [5, 10, 15, 20, 30];
const PART_WORDS = { morning: 'the morning, before school', afternoon: 'the afternoon, after school', evening: 'the evening, after dinner' };
const DEFAULT_AT = { morning: '06:30', afternoon: '17:00', evening: '19:00' };
const TIME_STEP = 15;
const slug = (name) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/** "Every day", "Weekdays", "Weekends" or "Mon, Wed, Fri". */
export function scheduleLabel(days) {
  const named = NAMED_DAYS.find((option) => sameDays(option.days, days));
  if (named) return named.label;
  return WEEKDAYS.filter(({ day }) => days.includes(day))
    .map(({ short }) => short)
    .join(', ');
}

/**
 * Sheet to add a habit to the routine, or edit one (`habit`). Picking an idea fills in the name,
 * icon and time of day; with a name of their own, students pick just the icon.
 */
export function RoutineEditor({ habit, defaultPart, takenNames, onClose }) {
  const { colors, layout, scheme } = useTheme();
  const insets = useSafeAreaInsets();
  const startIdea = habit ? findIdea(habit.name) : undefined;
  const [name, setName] = useState(habit?.name ?? '');
  const [icon, setIcon] = useState(habit ? habitLook(habit).icon : null);
  const [picked, setPicked] = useState(startIdea?.name ?? null);
  const [part, setPart] = useState(habit?.part ?? defaultPart);
  const [days, setDays] = useState(habit?.days ?? EVERY_DAY);
  const [category, setCategory] = useState(startIdea?.category ?? HABIT_CATEGORIES[0].id);
  const [timed, setTimed] = useState(Number.isInteger(habit?.at));
  const [at, setAt] = useState(Number.isInteger(habit?.at) ? clockTime(habit.at) : DEFAULT_AT[habit?.part ?? defaultPart] ?? '17:00');
  const [mins, setMins] = useState(habit?.mins ?? 60);
  const [anyTimeMins, setAnyTimeMins] = useState(Number.isInteger(habit?.at) ? 5 : (habit?.mins ?? 5));

  const query = name.trim().toLowerCase();
  const exact = findIdea(name);
  const taken = new Set(takenNames.map((value) => value.toLowerCase()));
  const offered = (item) => Boolean(habit) || !taken.has(item.name.toLowerCase());
  const matches = query && !exact ? HABIT_LIBRARY.filter((item) => offered(item) && item.name.toLowerCase().includes(query)).slice(0, 8) : [];
  const ownName = Boolean(query) && !exact && !matches.length;
  const ideas = matches.length ? matches : HABIT_LIBRARY.filter((item) => item.category === category && offered(item));
  const shownIcon = icon ?? exact?.icon ?? 'star';
  const valid = Boolean(query) && days.length > 0;

  const save = useAsyncAction(async () => {
    const body = { name: name.trim(), icon: shownIcon, part, days, ...(timed ? { at, mins } : { at: null, mins: anyTimeMins }) };
    const saved = habit ? await habitActions.updateHabit(habit.id, body) : await habitActions.addHabit(body);
    if (saved) onClose();
  });
  const remove = useAsyncAction(async () => {
    if (await habitActions.removeHabit(habit)) onClose();
  });

  const choose = (item) => {
    setIcon(item.icon);
    setPicked(item.name);
    // A new habit takes the idea's details; an edit or a name of the student's own only takes the icon.
    if (!habit && !ownName) {
      setName(item.name);
      setPart(item.part);
    }
  };
  const toggleDay = (day) => setDays((current) => (current.includes(day) ? current.filter((value) => value !== day) : [...current, day]));
  const hint = habit ? 'Choose a new icon.' : ownName ? `Choose an icon for “${name.trim()}”.` : 'Tap an idea to fill in the details, or type your own name above.';

  return (
    <Modal visible animationType="slide" presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : 'fullScreen'} onRequestClose={onClose}>
      <View style={[styles.sheet, { backgroundColor: colors.background }]} testID="routine-editor">
        <View style={[styles.bar, { backgroundColor: colors.card, borderBottomColor: colors.separator }]}>
          <View style={[styles.barInner, { maxWidth: layout.maxContentWidth }]}>
            <BarButton label="Cancel" onPress={onClose} align="left" />
            <Text style={[styles.barTitle, { color: colors.text }]} accessibilityRole="header">
              {habit ? 'Edit habit' : 'New habit'}
            </Text>
            <BarButton label={habit ? 'Save' : 'Add'} strong align="right" onPress={save.execute} disabled={!valid || save.pending || remove.pending} testID="habit-save" />
          </View>
        </View>

        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[styles.body, { maxWidth: layout.maxContentWidth, paddingBottom: insets.bottom + 32 }]}
        >
          <View style={[styles.card, styles.nameRow, { backgroundColor: colors.card }]}>
            <IconTile icon={shownIcon} color={colorOfIcon(shownIcon)} size={44} solid />
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Habit name"
              placeholderTextColor={colors.textTertiary}
              maxLength={40}
              returnKeyType="done"
              keyboardAppearance={scheme}
              selectionColor={colors.tint}
              accessibilityLabel="Habit name"
              testID="habit-name"
              style={[styles.nameInput, { color: colors.text }, Platform.OS === 'web' && styles.webInput]}
            />
            {name ? (
              <Pressable onPress={() => setName('')} accessibilityRole="button" accessibilityLabel="Clear the name" hitSlop={8} style={[styles.clear, { backgroundColor: colors.fillStrong }]}>
                <Icon name="close" size={11} color={colors.card} strokeWidth={3} />
              </Pressable>
            ) : null}
          </View>

          <Caption>{habit ? 'Icon' : matches.length ? 'Matching ideas' : 'Ideas'}</Caption>
          <View style={[styles.card, { backgroundColor: colors.card }]}>
            {matches.length ? null : (
              <>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs} accessibilityRole="tablist">
                  {HABIT_CATEGORIES.map((item) => {
                    const selected = item.id === category;
                    return (
                      <Pressable
                        key={item.id}
                        onPress={() => setCategory(item.id)}
                        accessibilityRole="tab"
                        accessibilityState={{ selected }}
                        testID={`category-${item.id}`}
                        style={[styles.tab, { borderBottomColor: selected ? item.color : 'transparent' }]}
                      >
                        <Text style={[styles.tabLabel, { color: selected ? colors.text : colors.textSecondary }]}>{item.label}</Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
                <View style={[styles.hairline, { backgroundColor: colors.separator }]} />
              </>
            )}
            {ideas.length ? (
              <View style={styles.grid}>
                {ideas.map((item) => (
                  <IdeaTile key={item.name} item={item} selected={picked ? item.name === picked : exact?.name === item.name} onPress={() => choose(item)} />
                ))}
              </View>
            ) : (
              <Text style={[styles.empty, { color: colors.textSecondary }]}>Everything here is already in your routine.</Text>
            )}
          </View>
          <Text style={[styles.hint, { color: colors.textSecondary }]}>{hint}</Text>

          <Caption>Time of day</Caption>
          <View style={[styles.card, styles.cardPad, styles.spaced, { backgroundColor: colors.card }]}>
            <SegmentedControl label="Time of day" options={ROUTINE_PARTS} value={part} onChange={setPart} />
          </View>

          <Caption right={days.length ? scheduleLabel(days) : 'Pick at least one day'}>Repeat</Caption>
          <View style={[styles.card, styles.days, { backgroundColor: colors.card }]}>
            {WEEKDAYS.map(({ day, letter, long }) => {
              const on = days.includes(day);
              return (
                <Pressable
                  key={day}
                  onPress={() => toggleDay(day)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                  accessibilityLabel={long}
                  testID={`habit-day-${day}`}
                  style={({ pressed }) => [styles.day, { backgroundColor: on ? colors.tint : colors.fill, transform: [{ scale: pressed ? 0.92 : 1 }] }]}
                >
                  <Text style={[styles.dayLetter, { color: on ? colors.onTint : colors.text }]}>{letter}</Text>
                </Pressable>
              );
            })}
          </View>

          <Caption right={timed ? `${at} · ${duration(mins)}` : `${duration(anyTimeMins)}, in ${part === 'morning' ? 'the morning' : part === 'afternoon' ? 'the afternoon' : 'the evening'}`}>Time</Caption>
          <View style={[styles.card, styles.spaced, { backgroundColor: colors.card }]}>
            <ToggleRow label="At a set time" hint="It shows on your plan, and study is planned around it." value={timed} onValueChange={setTimed} />
            {timed ? (
              <>
                <Stepper
                  label="Starts"
                  valueLabel={at}
                  onDecrement={() => setAt(minutesToTime(timeToMinutes(at) - TIME_STEP))}
                  onIncrement={() => setAt(minutesToTime(timeToMinutes(at) + TIME_STEP))}
                />
                <View style={styles.cardPad}>
                  <SegmentedControl label="How long" options={HABIT_LENGTHS.map((value) => ({ value, label: value < 60 ? `${value}m` : `${value / 60}h` }))} value={mins} onChange={setMins} />
                </View>
              </>
            ) : (
              <View style={styles.cardPad}>
                <SegmentedControl label="How long" options={ANY_TIME_LENGTHS.map((value) => ({ value, label: `${value}m` }))} value={anyTimeMins} onChange={setAnyTimeMins} />
                <Text style={[styles.hint, { color: colors.textSecondary, marginBottom: 4, marginTop: 8, paddingHorizontal: 4 }]}>It goes on your plan in {PART_WORDS[part]}, wherever there is a free moment.</Text>
              </View>
            )}
          </View>

          {habit ? (
            <Pressable
              onPress={remove.execute}
              disabled={remove.pending || save.pending}
              accessibilityRole="button"
              testID="habit-remove"
              style={({ pressed }) => [styles.card, styles.remove, { backgroundColor: colors.card, opacity: pressed || remove.pending ? 0.6 : 1 }]}
            >
              <Text style={[styles.removeLabel, { color: colors.danger }]}>Remove from routine</Text>
            </Pressable>
          ) : null}
        </ScrollView>
      </View>
    </Modal>
  );
}

function BarButton({ label, onPress, disabled = false, strong = false, align, testID }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      hitSlop={8}
      testID={testID}
      style={({ pressed }) => [styles.barButton, { alignItems: align === 'left' ? 'flex-start' : 'flex-end', opacity: pressed ? 0.5 : 1 }]}
    >
      <Text style={[styles.barLabel, { color: disabled ? colors.textTertiary : colors.tint, fontWeight: strong ? '700' : '400' }]}>{label}</Text>
    </Pressable>
  );
}

function Caption({ children, right }) {
  const { colors } = useTheme();
  return (
    <View style={styles.caption}>
      <Text style={[styles.captionText, { color: colors.textSecondary }]}>{children}</Text>
      {right ? <Text style={[styles.captionRight, { color: colors.textSecondary }]}>{right}</Text> : null}
    </View>
  );
}

function IdeaTile({ item, selected, onPress }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={item.name}
      testID={`suggestion-${slug(item.name)}`}
      style={({ pressed }) => [styles.cell, { opacity: pressed ? 0.6 : 1 }]}
    >
      <View style={[styles.tileRing, { borderColor: selected ? item.color : 'transparent' }]}>
        <IconTile icon={item.icon} color={item.color} size={48} solid={selected} />
      </View>
      <Text style={[styles.cellLabel, { color: selected ? colors.text : colors.textSecondary, fontWeight: selected ? '600' : '400' }]} numberOfLines={2}>
        {item.name}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  sheet: { flex: 1 },
  bar: { borderBottomWidth: StyleSheet.hairlineWidth },
  barInner: { width: '100%', alignSelf: 'center', flexDirection: 'row', alignItems: 'center', minHeight: 56, paddingHorizontal: 16 },
  barButton: { flex: 1, paddingVertical: 8 },
  barLabel: { fontSize: 17 },
  barTitle: { fontSize: 17, fontWeight: '600', textAlign: 'center' },
  body: { width: '100%', alignSelf: 'center', padding: 16, gap: 8 },
  card: { borderRadius: 14, overflow: 'hidden' },
  cardPad: { padding: 6 },
  spaced: { marginBottom: 14 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 14 },
  nameInput: { flex: 1, minWidth: 0, fontSize: 18, fontWeight: '500', paddingVertical: 8 },
  webInput: { outlineStyle: 'none' },
  clear: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  caption: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingHorizontal: 16 },
  captionText: { fontSize: 12.5, fontWeight: '600', letterSpacing: 0.6, textTransform: 'uppercase' },
  captionRight: { fontSize: 13 },
  tabs: { paddingHorizontal: 8 },
  tab: { paddingHorizontal: 10, paddingTop: 13, paddingBottom: 10, borderBottomWidth: 2 },
  tabLabel: { fontSize: 14, fontWeight: '600' },
  hairline: { height: StyleSheet.hairlineWidth },
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 6, paddingVertical: 10 },
  cell: { width: '25%', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 2, gap: 6 },
  tileRing: { padding: 2, borderRadius: 17, borderWidth: 2 },
  cellLabel: { fontSize: 12, textAlign: 'center', lineHeight: 15, minHeight: 30 },
  empty: { fontSize: 14, textAlign: 'center', padding: 24 },
  hint: { fontSize: 13, paddingHorizontal: 16, marginBottom: 14, lineHeight: 18 },
  days: { flexDirection: 'row', justifyContent: 'space-between', gap: 6, paddingHorizontal: 12, paddingVertical: 14, marginBottom: 14 },
  day: { flex: 1, maxWidth: 40, aspectRatio: 1, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  dayLetter: { fontSize: 15, fontWeight: '600' },
  remove: { alignItems: 'center', paddingVertical: 15, marginTop: 8 },
  removeLabel: { fontSize: 16, fontWeight: '500' },
});
