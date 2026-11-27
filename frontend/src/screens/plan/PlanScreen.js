import { useNavigation } from '@react-navigation/native';
import { useMemo, useRef, useState } from 'react';
import { Dimensions, Modal, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { DayPicker } from '../../components/domain/DayPicker';
import { Datesheet } from '../../components/domain/Datesheet';
import { MonthCalendar } from '../../components/domain/MonthCalendar';
import { Button } from '../../components/ui/Button';
import { SegmentedControl } from '../../components/ui/Controls';
import { Card, IconTile, Muted, Screen, Section, Stack } from '../../components/ui/Layout';
import { PressableScale, ProgressBar } from '../../components/ui/Motion';
import { AsyncBoundary, Banner } from '../../components/ui/States';
import { useAsyncAction } from '../../hooks/useAsyncAction';
import { useResource } from '../../hooks/useResource';
import { examActions, habitActions, taskActions } from '../../services/actions';
import { resources } from '../../services/resources';
import { useSubjectInfo } from '../../store/subjectStore';
import { useTheme } from '../../theme/ThemeProvider';
import { capitalize, clockTime, dayName, duration, plural, shortDate } from '../../utils/format';
import { Timeline } from './Timeline';

export function PlanScreen({ navigation, route }) {
  const strip = useResource(resources.planStrip);
  const today = strip.data?.[0]?.date;
  const [selected, setSelected] = useState(null);

  // Other screens open a day with { date, at }. `at` makes every request distinct, so asking
  // for the same day twice still jumps back to it after the student picked another day.
  const request = route.params;
  const [handledAt, setHandledAt] = useState(null);
  if (request?.at && request.at !== handledAt) {
    setHandledAt(request.at);
    setSelected(request.date ?? null);
  }

  const date = selected ?? today;
  const [view, setView] = useState('week');
  return (
    <Screen refreshing={strip.isRefreshing} onRefresh={strip.refresh} testID="plan-screen">
      <AsyncBoundary resource={strip}>
        {(days) => (
          <>
            <SegmentedControl
              label="Calendar view"
              value={view}
              onChange={setView}
              options={[
                { value: 'week', label: 'Week' },
                { value: 'month', label: 'Month' },
              ]}
            />
            {view === 'month' && today ? <Month today={today} value={date} onChange={setSelected} /> : <Strip days={days} value={date} onChange={setSelected} />}
            {date ? <DayPlan key={date} date={date} navigation={navigation} /> : null}
            <PlanTools navigation={navigation} />
            <DatesheetSection navigation={navigation} />
          </>
        )}
      </AsyncBoundary>
    </Screen>
  );
}

function Strip({ days, value, onChange }) {
  const markers = useMemo(() => Object.fromEntries(days.map((day) => [day.date, { exam: day.hasExam, over: day.overloaded, suggested: day.hasSuggested }])), [days]);
  const keys = useMemo(() => days.map((day) => day.date), [days]);
  return <DayPicker days={keys} value={value} onChange={onChange} today={keys[0]} markers={markers} legend />;
}

/** How far the month calendar goes from today's month. */
const MONTHS_BACK = 2;
const MONTHS_AHEAD = 6;
const monthOf = (date) => date.slice(0, 7);
const shiftMonth = (month, delta) => {
  const [year, number] = month.split('-').map(Number);
  const index = year * 12 + number - 1 + delta;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;
};
const monthsBetween = (from, to) => {
  const [a, b] = [from, to].map((month) => month.split('-').map(Number));
  return (b[0] - a[0]) * 12 + (b[1] - a[1]);
};

/** The month around the chosen day: school days, holidays, tests and preparation at a glance. */
function Month({ today, value, onChange }) {
  const [month, setMonth] = useState(() => monthOf(value ?? today));
  const data = useResource(resources.planMonth(month));
  const offset = monthsBetween(monthOf(today), month);
  return (
    <Card>
      <AsyncBoundary resource={data}>
        {(days) => (
          <MonthCalendar
            month={month}
            days={days}
            value={value}
            today={today}
            onChange={onChange}
            onMonthChange={(delta) => setMonth((current) => shiftMonth(current, delta))}
            canPrev={offset > -MONTHS_BACK}
            canNext={offset < MONTHS_AHEAD}
          />
        )}
      </AsyncBoundary>
    </Card>
  );
}

/** One line on what kind of day it is, when it isn't an ordinary school day. */
function dayNote(frame, rest) {
  if (rest) return { icon: 'moon', text: 'Rest day: no self study or daily revision, just night revision.' };
  if (!frame) return null;
  if (frame.dayType === 'paper') return { icon: 'trophy', text: `Exam day: ${frame.papers.map((paper) => `${paper.name} ${clockTime(paper.start)}–${clockTime(paper.end)}`).join(', ')}. No school or Homework slot.` };
  if (frame.dayType === 'studyLeave') return { icon: 'book', text: `Study leave for ${frame.reason}: no school, a full day to revise.` };
  if (frame.dayType === 'noSchool') return { icon: 'sun', text: frame.reason === 'Sunday' ? 'Sunday: no school.' : `No school: ${frame.reason}.` };
  if (frame.dayType === 'halfDay') return { icon: 'bag', text: 'Half day at school.' };
  if (frame.examPeriod) return { icon: 'trophy', text: `${frame.examPeriod} is on: no Homework slot until the last paper.` };
  if (frame.changed) return { icon: 'clock', text: `School timings are changed for this ${frame.changed.scope}.` };
  return null;
}

function DayPlan({ date, navigation }) {
  const day = useResource(resources.planDay(date));
  return <AsyncBoundary resource={day}>{(data) => <DayDetails data={data} navigation={navigation} />}</AsyncBoundary>;
}

function DayDetails({ data }) {
  const { colors } = useTheme();
  const isToday = data.date === data.today;
  const fix = useAsyncAction(() => taskActions.moveTo({ id: data.moveSuggestion.taskId }, data.moveSuggestion.toDate, data.today));
  const moveOverflow = useAsyncAction(async () => {
    for (const task of data.overflow) await taskActions.moveToBestDay(task, data.today);
  });
  const ratio = Math.min(1, data.plannedMins / Math.max(1, data.limitMins));
  const title = data.moveSuggestion?.title ?? '';
  const note = dayNote(data.frame, data.rest);
  const ahead = data.date >= data.today;
  const navigation = useNavigation();
  const rest = useAsyncAction(() => habitActions.setRestDay(data.date, !data.rest, data.today));
  return (
    <Stack>
      <Card>
        <View style={styles.dayHead}>
          <Text style={[styles.dayTitle, { color: colors.text }]}>
            {isToday ? 'Today' : capitalize(dayName(data.date, data.today))}, {shortDate(data.date)}
          </Text>
          <Text style={[styles.dayLoad, { color: data.overloaded ? colors.danger : colors.textSecondary }]}>
            {duration(data.plannedMins)} of {duration(data.limitMins)} free
          </Text>
        </View>
        <View accessibilityLabel={`${Math.round(ratio * 100)} percent of the day’s free time planned`}>
          <ProgressBar progress={ratio} color={data.overloaded ? colors.danger : colors.success} track={colors.fill} height={8} style={styles.load} />
        </View>
        {note ? (
          <View style={styles.noteRow} testID="day-note">
            <IconTile name={note.icon} color={data.frame.dayType === 'paper' ? colors.danger : colors.tint} size={22} />
            <Muted small style={styles.flex}>
              {note.text}
            </Muted>
          </View>
        ) : null}
        {(data.frame?.dropped ?? []).map((item) => (
          <Muted key={item.label} small style={styles.note}>
            {item.because === 'no free time' ? `${item.label} has no free time today.` : `${item.label} is off today: it clashes with ${item.because}.`}
          </Muted>
        ))}
        {ahead ? (
          <View style={styles.buttons}>
            <Button title="Change timings" icon="clock" size="sm" onPress={() => navigation.navigate('ChangeTimings', { date: data.date })} testID="open-change-timings" />
            <Button title={data.rest ? 'Make it a study day' : 'Make it a rest day'} icon="moon" size="sm" variant="ghost" onPress={rest.execute} loading={rest.pending} testID="toggle-rest-day" />
          </View>
        ) : null}
      </Card>
      {data.overloaded ? (
        <Banner title="More than this day can hold" body={`${duration(data.plannedMins - data.limitMins)} more than its free time. Move something to a lighter day.`}>
          {data.moveSuggestion ? (
            <View style={styles.buttons}>
              <Button
                title={`Move “${title.length > 30 ? `${title.slice(0, 28)}…` : title}” to ${dayName(data.moveSuggestion.toDate, data.today)}`}
                size="sm"
                variant="primary"
                onPress={fix.execute}
                loading={fix.pending}
              />
            </View>
          ) : null}
        </Banner>
      ) : null}
      <Timeline data={data} />
      {data.overflow.length ? (
        <Banner title="Doesn’t fit today" body={`${data.overflow.map((task) => task.title).join(', ')}. There is no free stretch long enough before you stop studying.`}>
          {data.date >= data.today ? (
            <View style={styles.buttons}>
              <Button title={data.overflow.length > 1 ? 'Move them to other days' : 'Move to another day'} size="sm" variant="primary" onPress={moveOverflow.execute} loading={moveOverflow.pending} testID="move-overflow" />
            </View>
          ) : null}
        </Banner>
      ) : null}
    </Stack>
  );
}

const EXAM_MENU = [
  { value: 'unit', label: 'Unit test' },
  { value: 'periodic', label: 'Periodic test' },
  { value: 'halfYearly', label: 'Half-yearly' },
  { value: 'final', label: 'Final exam' },
  { value: 'other', label: 'Other exam' },
];

/** Three big "add" tiles: a chapter from the syllabus, homework, or a test. */
function PlanTools({ navigation }) {
  const { colors } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const [anchor, setAnchor] = useState(null);
  const tileRef = useRef(null);
  // Open straight away; place the menu under the tile once it has been measured.
  const openMenu = () => {
    setMenuOpen(true);
    tileRef.current?.measure((_x, _y, w, h, px, py) => {
      const screenW = Dimensions.get('window').width;
      const menuW = 160;
      const left = Math.min(Math.max(px + w - menuW, 8), screenW - menuW - 8);
      setAnchor({ left, top: py + h + 4 });
    });
  };
  return (
    <Section title="Add to your plan" icon="plus" bare>
      <View style={styles.tools}>
        <ToolTile icon="book" color="#06B6D4" label="Chapter" hint="from syllabus" onPress={() => navigation.navigate('Syllabus')} testID="open-syllabus" />
        <ToolTile icon="homework" color={colors.tint} label="Homework" hint="due soon" onPress={() => navigation.navigate('NewHomework')} />
        <View ref={tileRef} style={styles.toolWrap}>
          <ToolTile icon="trophy" color={colors.warning} label="Exam" hint="test or olympiad" onPress={openMenu} testID="add-exam" style={styles.toolFill} />
        </View>
      </View>
      <Modal visible={menuOpen} transparent animationType="none" onRequestClose={() => setMenuOpen(false)}>
        <Pressable style={styles.overlay} onPress={() => setMenuOpen(false)}>
          <View style={[styles.menu, { backgroundColor: colors.card, borderColor: colors.separator, top: anchor?.top ?? 0, left: anchor?.left ?? 0, width: 160 }]}>
            {EXAM_MENU.map((item, i) => (
              <View key={item.value}>
                {i > 0 ? <View style={[styles.menuDivider, { backgroundColor: colors.separator }]} /> : null}
                <Pressable
                  onPress={() => { setMenuOpen(false); navigation.navigate('NewDatesheet', { kind: item.value }); }}
                  style={({ pressed }) => [styles.menuItem, { opacity: pressed ? 0.5 : 1 }]}
                  accessibilityRole="menuitem"
                >
                  <Text style={{ color: colors.text, fontSize: 14, fontWeight: '600' }}>{item.label}</Text>
                </Pressable>
              </View>
            ))}
          </View>
        </Pressable>
      </Modal>
    </Section>
  );
}

function ToolTile({ icon, color, label, hint, onPress, testID, style }) {
  const { colors, radius } = useTheme();
  return (
    <PressableScale
      onPress={onPress}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={`Add ${label.toLowerCase()} ${hint}`}
      style={[styles.tool, { backgroundColor: colors.card, borderRadius: radius.lg, boxShadow: colors.shadow }, style]}
    >
      <IconTile name={icon} color={color} size={36} />
      <Text style={[styles.toolLabel, { color: colors.text }]}>{label}</Text>
      <Text style={[styles.toolHint, { color: colors.textSecondary }]} numberOfLines={1}>
        {hint}
      </Text>
    </PressableScale>
  );
}

/** Every exam in one place: unit tests, half-yearly & final, and other exams, each with its syllabus. */
function DatesheetSection({ navigation }) {
  const { colors } = useTheme();
  const { height } = useWindowDimensions();
  const exams = useResource(resources.exams);
  const subjectOf = useSubjectInfo();
  const papers = exams.data?.length ?? 0;
  const remove = useAsyncAction(examActions.remove);
  const removeGroup = useAsyncAction(examActions.removeGroup);
  const busy = remove.pending || removeGroup.pending;
  const edit = (exam) =>
    navigation.navigate('EditExam', {
      exam: { id: exam.id, type: exam.type, subject: exam.subject, name: exam.name, date: exam.date, weight: exam.weight, chapterKeys: exam.chapterKeys, start: exam.start, end: exam.end, studyLeave: exam.studyLeave },
    });
  return (
    <Section
      title="Datesheet"
      icon="today"
      iconColor={colors.danger}
      meta={papers ? plural(papers, 'paper') : undefined}
      bare
      footer="Tap a paper to see its syllabus or remove it. Use the pencil to change its date or chapters."
    >
      <AsyncBoundary resource={exams}>
        {(list) => (
          <Datesheet
            exams={list}
            subjectOf={subjectOf}
            // Long datesheets scroll in their own box instead of stretching the page.
            maxHeight={Math.max(320, Math.round(height * 0.6))}
            onAdd={(kind) => navigation.navigate('NewDatesheet', { kind })}
            onEdit={edit}
            onRemove={remove.execute}
            onRemoveGroup={(group) => (group.exams.length > 1 ? removeGroup.execute(group) : remove.execute(group.exams[0]))}
            busy={busy}
          />
        )}
      </AsyncBoundary>
    </Section>
  );
}

const styles = StyleSheet.create({
  dayHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' },
  dayTitle: { fontSize: 16.5, fontWeight: '800' },
  dayLoad: { fontSize: 12.5, fontWeight: '700' },
  load: { marginTop: 8 },
  note: { marginTop: 6 },
  noteRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  flex: { flex: 1 },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  tools: { flexDirection: 'row', gap: 8 },
  toolWrap: { flex: 1 },
  toolFill: { flex: 1 },
  overlay: { flex: 1 },
  menu: { position: 'absolute', borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 6 },
  menuItem: { paddingHorizontal: 14, paddingVertical: 11 },
  menuDivider: { height: StyleSheet.hairlineWidth },
  tool: { flex: 1, alignItems: 'center', paddingVertical: 12, paddingHorizontal: 6, gap: 4 },
  toolLabel: { fontSize: 14, fontWeight: '800' },
  toolHint: { fontSize: 11 },
});
