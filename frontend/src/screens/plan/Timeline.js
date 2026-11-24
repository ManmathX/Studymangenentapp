import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { PriorityTag, SourceTag, Tag } from '../../components/domain/Badges';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Layout';
import { useAsyncAction } from '../../hooks/useAsyncAction';
import { taskActions } from '../../services/actions';
import { useSubjectInfo } from '../../store/subjectStore';
import { useTheme } from '../../theme/ThemeProvider';
import { clockTime, duration } from '../../utils/format';

const BREAK_MINUTES = 10;

/** The day laid out in time order: school, meals and tuition as fixed blocks, study blocks between. */
export function Timeline({ data }) {
  const action = useAsyncAction((run, task) => run(task, data.today));
  const isToday = data.date === data.today;
  let previousTaskEnd = null;
  const items = [];
  data.rows.forEach((row) => {
    if (row.type === 'fixed') {
      previousTaskEnd = null;
      items.push(<FixedBlock key={`fixed-${row.start}-${row.label}`} row={row} />);
      return;
    }
    if (previousTaskEnd !== null && row.start - previousTaskEnd === BREAK_MINUTES) items.push(<BreakMarker key={`break-${row.start}`} />);
    previousTaskEnd = row.end;
    items.push(<TaskBlock key={row.task.id} row={row} ageMode={data.ageMode} canMove={!isToday} onAction={action.execute} busy={action.pending} />);
  });
  return <Card style={styles.card}>{items}</Card>;
}

const FixedBlock = memo(function FixedBlock({ row }) {
  const { colors } = useTheme();
  return (
    <View style={styles.block}>
      <Text style={[styles.at, { color: colors.textSecondary }]}>{clockTime(row.start)}</Text>
      <View style={[styles.box, { backgroundColor: colors.fill }]}>
        <Text style={[styles.boxTitle, { color: colors.textSecondary }]}>{row.label}</Text>
        <Text style={{ color: colors.textTertiary, fontSize: 13 }}>
          {clockTime(row.start)} to {clockTime(row.end)}
        </Text>
      </View>
    </View>
  );
});

function BreakMarker() {
  const { colors } = useTheme();
  return <Text style={[styles.breakText, { color: colors.textTertiary }]}>10 min break</Text>;
}

const TaskBlock = memo(function TaskBlock({ row, ageMode, canMove, onAction, busy }) {
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
          <Text style={{ color, fontWeight: '600', fontSize: 13 }}>{subjectOf(task.subject).name}</Text>
          <Text style={{ color: colors.textSecondary, fontSize: 13 }}>{duration(task.mins)}</Text>
          {suggested ? <Tag label="Suggested" kind="suggested" /> : <SourceTag source={task.source} />}
          <PriorityTag score={task.score} ageMode={ageMode} />
        </View>
        <Text style={[styles.boxTitle, { color: colors.text, textDecorationLine: task.done ? 'line-through' : 'none' }]}>{task.title}</Text>
        {suggested ? (
          <>
            {task.why ? <Text style={{ color: colors.textSecondary, fontSize: 13 }}>{task.why}</Text> : null}
            <View style={styles.buttons}>
              <Button title="Accept" size="sm" variant="primary" onPress={() => onAction(taskActions.accept, task)} disabled={busy} />
              <Button title="Swap day" size="sm" onPress={() => onAction(taskActions.swap, task)} disabled={busy} />
              <Button title="Skip" size="sm" variant="ghost" onPress={() => onAction(taskActions.skip, task)} disabled={busy} />
            </View>
          </>
        ) : canMove && !task.done ? (
          <View style={styles.buttons}>
            <Button title="Move to another day" size="sm" variant="ghost" onPress={() => onAction(taskActions.moveToBestDay, task)} disabled={busy} />
          </View>
        ) : null}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  card: { paddingLeft: 8, gap: 8 },
  block: { flexDirection: 'row', gap: 10 },
  at: { width: 44, fontSize: 13, paddingTop: 10, fontVariant: ['tabular-nums'] },
  box: { flex: 1, borderRadius: 10, padding: 10, gap: 4, borderLeftWidth: 4, borderLeftColor: 'transparent' },
  boxTitle: { fontSize: 15, fontWeight: '500' },
  meta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  breakText: { fontSize: 12, marginLeft: 54 },
});
