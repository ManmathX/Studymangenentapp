import { useNavigation } from '@react-navigation/native';
import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { PriorityTag, SourceTag, Tag } from '../../components/domain/Badges';
import { Button } from '../../components/ui/Button';
import { Icon } from '../../components/ui/Icon';
import { Card } from '../../components/ui/Layout';
import { useAsyncAction } from '../../hooks/useAsyncAction';
import { habitActions, profileActions, taskActions } from '../../services/actions';
import { useSubjectInfo } from '../../store/subjectStore';
import { useTheme } from '../../theme/ThemeProvider';
import { clockTime, duration } from '../../utils/format';

/** How each kind of fixed block looks: exam papers stand out, habits are green, meals and breaks warm, sleep quiet. */
const FIXED_LOOK = {
  exam: { tag: 'PAPER', fill: 'dangerSoft', ink: 'danger', icon: 'trophy' },
  habit: { tag: 'HABIT', fill: 'successSoft', ink: 'successInk', icon: 'habits' },
  tuition: { tag: null, fill: 'tintSoft', ink: 'tintInk', icon: 'book' },
  meal: { tag: null, fill: 'warningSoft', ink: 'warningInk', icon: 'coffee' },
  break: { tag: 'BREAK', fill: 'warningSoft', ink: 'warningInk', icon: 'sun' },
  sleep: { tag: null, fill: 'fill', ink: 'textTertiary', icon: 'moon' },
};

/** Colour and icon of each kind of slot. */
const SLOT_LOOK = {
  homework: { color: 'tint', icon: 'homework' },
  study: { color: 'success', icon: 'book' },
  exam: { color: 'warning', icon: 'trophy' },
  night: { color: 'tintInk', icon: 'moon' },
};
const ROW_ORDER = { fixed: 0, slot: 1, break: 2, task: 3 };

/**
 * The day laid out in time order: exam paper, school, tuition, timed habits and meals as fixed
 * blocks, and the day's slots (Homework, Self study or Test prep, Night revision) with their
 * tasks under them.
 */
export function Timeline({ data }) {
  const { colors } = useTheme();
  const action = useAsyncAction((run, task) => run(task, data.today));
  const isToday = data.date === data.today;
  const navigation = useNavigation();
  const openEdit = (task) => navigation.navigate('EditTask', { task, today: data.today });
  const taskRows = data.rows.filter((row) => row.type === 'task');
  // Slots and routine blocks can be moved, resized or removed from today on.
  const editable = data.date >= data.today;
  const openSlot = (row, kind) =>
    navigation.navigate('EditSlot', { date: data.date, key: row.key, label: row.label, kind, start: row.start, end: row.end, edited: row.edited ?? null });
  const putBack = useAsyncAction((item) => profileActions.resetSlot({ key: item.key, date: data.date, scope: item.scope }, `${item.label} is back.`));
  const rows = [...data.rows, ...(data.slots ?? []).map((slot) => ({ type: 'slot', ...slot }))].sort((a, b) => a.start - b.start || ROW_ORDER[a.type] - ROW_ORDER[b.type]);
  const items = rows.map((row) => {
    if (row.type === 'fixed') {
      const onEdit = editable && row.key ? () => openSlot(row, row.kind) : null;
      return <FixedBlock key={`fixed-${row.kind}-${row.start}-${row.label}`} row={row} canTick={isToday} onEdit={onEdit} />;
    }
    if (row.type === 'slot') {
      const inside = taskRows.some((task) => task.start >= row.start && task.start < row.end);
      const onEdit = editable && row.key ? () => openSlot(row, row.kind === 'exam' ? 'study' : row.kind) : null;
      return <SlotHeader key={`slot-${row.kind}-${row.start}`} slot={row} empty={!inside} onEdit={onEdit} />;
    }
    if (row.type === 'break') return <BreakMarker key={`break-${row.start}`} row={row} />;
    if (!row.task) return null;
    return <TaskBlock key={row.task.id} row={row} ageMode={data.ageMode} canMove={!isToday} onAction={action.execute} onEdit={openEdit} busy={action.pending} />;
  });
  const removed = data.frame?.removed ?? [];
  return (
    <Card style={styles.card}>
      {items}
      {removed.map((item) => (
        <View key={`removed-${item.key}`} style={styles.removedRow} testID={`removed-${item.key}`}>
          <Text style={[styles.removedText, { color: colors.textSecondary }]}>
            {item.label} is removed for {item.scope === 'always' ? 'every day' : 'this day'}.
          </Text>
          {editable ? <Button title="Put back" size="sm" variant="ghost" onPress={() => putBack.execute(item)} disabled={putBack.pending} /> : null}
        </View>
      ))}
    </Card>
  );
}

/** Shows the time as "until 06:00" for the night's sleep, otherwise "07:00 to 07:20". */
const spanOf = (row) => (row.kind === 'sleep' && row.start === 0 ? `until ${clockTime(row.end)}` : row.end >= 24 * 60 ? `from ${clockTime(row.start)}` : `${clockTime(row.start)} to ${clockTime(row.end)}`);

const FixedBlock = memo(function FixedBlock({ row, canTick, onEdit }) {
  const { colors } = useTheme();
  const look = FIXED_LOOK[row.kind];
  const tick = useAsyncAction(() => habitActions.setHabitDone(row.habitId, !row.done));
  const ink = look ? colors[look.ink] : colors.textSecondary;
  return (
    <Pressable
      style={styles.block}
      testID={`fixed-${row.kind}`}
      onPress={onEdit ?? undefined}
      disabled={!onEdit}
      accessibilityRole={onEdit ? 'button' : undefined}
      accessibilityHint={onEdit ? 'Move, resize or remove it' : undefined}
    >
      <Text style={[styles.at, { color: colors.textSecondary }]}>{row.kind === 'sleep' && row.start === 0 ? '' : clockTime(row.start)}</Text>
      <View style={[styles.box, row.kind === 'sleep' && styles.thin, { backgroundColor: look ? colors[look.fill] : colors.fill, opacity: row.done ? 0.6 : 1 }]}>
        <View style={styles.meta}>
          {look?.icon ? <Icon name={look.icon} size={13} color={ink} /> : null}
          <Text style={[styles.fixedTitle, { color: ink, fontWeight: row.kind === 'exam' ? '800' : '600', textDecorationLine: row.done ? 'line-through' : 'none' }]}>{row.label}</Text>
          {look?.tag ? <Text style={[styles.fixedTag, { color: ink, borderColor: ink }]}>{look.tag}</Text> : null}
          {row.kind === 'habit' && canTick ? (
            <Button title={row.done ? 'Done' : 'Tick'} icon={row.done ? 'check' : undefined} size="sm" variant={row.done ? 'secondary' : 'ghost'} onPress={tick.execute} loading={tick.pending} testID={`tick-habit-${row.habitId}`} />
          ) : null}
        </View>
        <Text style={{ color: colors.textTertiary, fontSize: 12 }}>
          {spanOf(row)}
          {row.auto ? ' · in your routine' : ''}
          {row.edited ? ` · changed for ${row.edited === 'always' ? 'every day' : 'this day'}` : ''}
          {onEdit ? ' · tap to change' : ''}
        </Text>
      </View>
    </Pressable>
  );
});

/** A slot of the day: what it is for, from when to when, and whether anything is planned in it yet. */
const SlotHeader = memo(function SlotHeader({ slot, empty, onEdit }) {
  const { colors } = useTheme();
  const look = SLOT_LOOK[slot.kind] ?? SLOT_LOOK.study;
  const color = colors[look.color];
  return (
    <Pressable
      style={styles.slotRow}
      testID={`slot-${slot.kind}`}
      onPress={onEdit ?? undefined}
      disabled={!onEdit}
      accessibilityRole={onEdit ? 'button' : undefined}
      accessibilityLabel={`${slot.label} slot, ${clockTime(slot.start)} to ${clockTime(slot.end)}${empty ? ', free' : ''}${onEdit ? ', tap to move or remove' : ''}`}
    >
      <Text style={[styles.at, { color }]}>{clockTime(slot.start)}</Text>
      <View style={[styles.slotBand, { borderColor: color, backgroundColor: `${color}12` }]}>
        <Icon name={look.icon} size={14} color={color} />
        <Text style={[styles.slotLabel, { color }]} numberOfLines={1}>
          {slot.label}
          {slot.detail ? ` · ${slot.detail}` : ''}
        </Text>
        <Text style={[styles.slotTime, { color: colors.textSecondary }]}>
          {clockTime(slot.start)}–{clockTime(slot.end)} · {duration(slot.end - slot.start)}
          {empty ? ' · free' : ''}
          {slot.edited ? ' · changed' : ''}
        </Text>
        {onEdit ? <Icon name="pencil" size={12} color={colors.textTertiary} /> : null}
      </View>
    </Pressable>
  );
});

/** The break between two study tasks: a short one, or a longer one after about 90 minutes of study. */
function BreakMarker({ row }) {
  const { colors } = useTheme();
  return (
    <Text style={[styles.breakText, { color: row.long ? colors.warningInk : colors.textTertiary }]} testID={row.long ? 'long-break' : 'short-break'}>
      {row.long ? '🧃' : '☕'} {duration(row.end - row.start)} {row.long ? 'long break: stretch, drink water' : 'break'}
    </Text>
  );
}

const TaskBlock = memo(function TaskBlock({ row, ageMode, canMove, onAction, onEdit, busy }) {
  const { colors } = useTheme();
  const { task } = row;
  const suggested = task.status === 'suggested';
  const subjectOf = useSubjectInfo();
  const color = subjectOf(task.subject).color;
  return (
    <View style={styles.block}>
      <Text style={[styles.at, { color: colors.textSecondary }]}>{clockTime(row.start)}</Text>
      <View style={[styles.box, { backgroundColor: `${color}1A`, borderLeftColor: color, borderStyle: suggested ? 'dashed' : 'solid', opacity: task.done ? 0.55 : 1 }]}>
        <View style={styles.meta}>
          <Text style={{ color, fontWeight: '800', fontSize: 12.5 }}>{subjectOf(task.subject).name}</Text>
          <Text style={{ color: colors.textSecondary, fontSize: 12.5, fontWeight: '600' }}>{duration(task.mins)}</Text>
          {suggested ? <Tag label="Suggested" kind="suggested" /> : <SourceTag source={task.source} />}
          <PriorityTag score={task.score} ageMode={ageMode} />
        </View>
        <Text style={[styles.boxTitle, { color: colors.text, textDecorationLine: task.done ? 'line-through' : 'none' }]}>{task.title}</Text>
        {suggested ? (
          <>
            {task.why ? <Text style={{ color: colors.textSecondary, fontSize: 12.5, lineHeight: 17 }}>{task.why}</Text> : null}
            <View style={styles.buttons}>
              <Button title="Accept" icon="check" size="sm" variant="primary" onPress={() => onAction(taskActions.accept, task)} disabled={busy} />
              <Button title="Swap day" size="sm" onPress={() => onAction(taskActions.swap, task)} disabled={busy} />
              <Button title="Edit" icon="pencil" size="sm" variant="ghost" onPress={() => onEdit(task)} disabled={busy} />
              <Button title="Skip" size="sm" variant="ghost" onPress={() => onAction(taskActions.skip, task)} disabled={busy} />
            </View>
          </>
        ) : !task.done ? (
          <View style={styles.buttons}>
            <Button title="Edit" icon="pencil" size="sm" variant="ghost" onPress={() => onEdit(task)} disabled={busy} testID={`plan-edit-${task.id}`} />
            {canMove ? <Button title="Move to another day" size="sm" variant="ghost" onPress={() => onAction(taskActions.moveToBestDay, task)} disabled={busy} /> : null}
          </View>
        ) : null}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  card: { paddingLeft: 8, paddingVertical: 10, gap: 6 },
  block: { flexDirection: 'row', gap: 8 },
  at: { width: 42, fontSize: 12, fontWeight: '700', paddingTop: 9, fontVariant: ['tabular-nums'] },
  box: { flex: 1, borderRadius: 12, paddingVertical: 8, paddingHorizontal: 10, gap: 3, borderLeftWidth: 4, borderLeftColor: 'transparent' },
  boxTitle: { fontSize: 14.5, fontWeight: '700' },
  fixedTitle: { fontSize: 13.5, fontWeight: '600', flexShrink: 1 },
  thin: { paddingVertical: 4 },
  removedRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginLeft: 50, marginTop: 4 },
  removedText: { flex: 1, fontSize: 12.5, fontStyle: 'italic' },
  fixedTag: { fontSize: 9.5, fontWeight: '800', letterSpacing: 0.5, borderWidth: 1, borderRadius: 4, paddingHorizontal: 4, overflow: 'hidden' },
  meta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  breakText: { fontSize: 11.5, marginLeft: 52, fontWeight: '600' },
  slotRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  slotBand: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, borderWidth: 1, borderStyle: 'dashed', borderRadius: 10, paddingVertical: 6, paddingHorizontal: 10 },
  slotLabel: { fontSize: 12.5, fontWeight: '800', flexShrink: 1 },
  slotTime: { fontSize: 11.5, fontWeight: '600', marginLeft: 'auto' },
});
