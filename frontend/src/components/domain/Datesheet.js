import { memo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../theme/ThemeProvider';
import { datesheetSections } from '../../utils/datesheet';
import { dayOfMonth, diffDays, plural, shortMonth, shortWeekday } from '../../utils/format';
import { Button } from '../ui/Button';
import { Icon } from '../ui/Icon';
import { Card, Divider, IconTile } from '../ui/Layout';
import { SubjectDot } from './Badges';

function dateRange(from, to) {
  if (from === to) return `${dayOfMonth(from)} ${shortMonth(from)}`;
  if (shortMonth(from) === shortMonth(to)) return `${dayOfMonth(from)}–${dayOfMonth(to)} ${shortMonth(to)}`;
  return `${dayOfMonth(from)} ${shortMonth(from)} – ${dayOfMonth(to)} ${shortMonth(to)}`;
}

function IconAction({ icon, label, onPress, disabled, color, testID }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.action, { opacity: disabled ? 0.4 : pressed ? 0.5 : 1 }]}
      testID={testID}
    >
      <Icon name={icon} size={17} color={color} />
    </Pressable>
  );
}

const PaperRow = memo(function PaperRow({ exam, daysLeft, isNext, subject, showName, syllabus, onEdit, onRemove, busy }) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const left = daysLeft === 0 ? 'Today' : daysLeft === 1 ? '1 day' : `${daysLeft} days`;
  const summary = exam.readiness ? `${exam.readiness.revised}/${exam.readiness.total} revised` : plural(exam.chapterKeys.length, 'chapter');
  return (
    <View style={isNext && { backgroundColor: colors.tintSoft }} testID={`datesheet-row-${exam.id}`}>
      <View style={styles.row}>
        <Pressable
          onPress={() => setOpen((value) => !value)}
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          accessibilityLabel={`${subject.name}${showName ? `, ${exam.name}` : ''}, ${shortWeekday(exam.date)} ${dayOfMonth(exam.date)} ${shortMonth(exam.date)}, ${left} left. ${open ? 'Hide' : 'Show'} syllabus`}
          style={({ pressed }) => [styles.rowMain, { opacity: pressed ? 0.6 : 1 }]}
        >
          <View style={styles.dateCol}>
            <Text style={[styles.dateNum, { color: colors.text }]}>{dayOfMonth(exam.date)}</Text>
            <Text style={{ color: colors.textSecondary, fontSize: 11 }}>{shortMonth(exam.date)}</Text>
          </View>
          <Text style={[styles.dayCol, { color: colors.textSecondary }]}>{shortWeekday(exam.date)}</Text>
          <View style={styles.subjectCol}>
            <View style={styles.subjectLine}>
              <SubjectDot subject={exam.subject} size={10} color={subject.color} />
              <Text style={[styles.subject, { color: colors.text }]} numberOfLines={1}>
                {subject.name}
              </Text>
              {isNext ? (
                <View style={[styles.nextPill, { backgroundColor: colors.tint }]}>
                  <Text style={styles.next}>NEXT</Text>
                </View>
              ) : null}
            </View>
            <Text style={{ color: colors.textSecondary, fontSize: 12 }} numberOfLines={1}>
              {showName ? `${exam.name} · ` : ''}
              {summary} {open ? '▴' : '▾'}
            </Text>
          </View>
          <Text style={[styles.leftCol, { color: daysLeft <= 3 ? colors.danger : colors.textSecondary, fontWeight: daysLeft <= 3 ? '800' : '600' }]}>{left}</Text>
        </Pressable>
        {onEdit || onRemove ? (
          <View style={styles.actions}>
            {onEdit ? <IconAction icon="pencil" label={`Edit ${exam.name}`} onPress={() => onEdit(exam)} disabled={busy} color={colors.tint} testID={`edit-exam-${exam.id}`} /> : null}
            {onRemove ? (
              <IconAction icon="trash" label={`Remove ${exam.name}`} onPress={() => onRemove(exam)} disabled={busy} color={colors.textTertiary} testID={`remove-exam-${exam.id}`} />
            ) : null}
          </View>
        ) : null}
      </View>
      {open ? (
        <View style={styles.syllabus}>
          <Text style={[styles.syllabusHead, { color: colors.textTertiary }]}>SYLLABUS</Text>
          {syllabus.length ? (
            syllabus.map((name, index) => (
              <Text key={`${index}-${name}`} style={{ color: colors.text, fontSize: 14 }}>
                {index + 1}. {name}
              </Text>
            ))
          ) : (
            <Text style={{ color: colors.textSecondary, fontSize: 14 }}>No chapters picked.</Text>
          )}
        </View>
      ) : null}
    </View>
  );
});

/** One exam (e.g. "Unit test 1"): its name, dates and actions sit at the top of its own card. */
function Group({ group, nextId, daysLeftOf, subjectOf, syllabusOf, onEdit, onRemove, onEditGroup, onRemoveGroup, busy }) {
  const { colors } = useTheme();
  return (
    <Card flush testID={`datesheet-group-${group.title}`}>
      <View style={[styles.groupHead, { borderBottomColor: colors.separator }]}>
        <View style={styles.flex}>
          <Text style={[styles.groupTitle, { color: colors.text }]} numberOfLines={1}>
            {group.title}
          </Text>
          <Text style={[styles.groupMeta, { color: colors.textSecondary }]}>
            {dateRange(group.from, group.to)} · {plural(group.exams.length, 'paper')}
          </Text>
        </View>
        {onEditGroup ? <Button title="Edit" size="sm" icon="pencil" onPress={() => onEditGroup(group)} disabled={busy} /> : null}
        {onRemoveGroup ? <Button title="Remove" size="sm" icon="trash" variant="danger" onPress={() => onRemoveGroup(group)} disabled={busy} /> : null}
      </View>
      <View style={[styles.row, styles.headRow, { backgroundColor: colors.fill }]}>
        <View style={[styles.rowMain, styles.headMain]}>
          <Text style={[styles.head, styles.dateCol, { color: colors.textTertiary }]}>DATE</Text>
          <Text style={[styles.head, styles.dayCol, { color: colors.textTertiary }]}>DAY</Text>
          <Text style={[styles.head, styles.subjectCol, { color: colors.textTertiary }]}>SUBJECT</Text>
          <Text style={[styles.head, styles.leftCol, { color: colors.textTertiary }]}>LEFT</Text>
        </View>
        {onEdit || onRemove ? <View style={styles.actions} /> : null}
      </View>
      {group.exams.map((exam, index) => (
        <View key={exam.id}>
          {index ? <Divider inset={0} /> : null}
          <PaperRow
            exam={exam}
            daysLeft={daysLeftOf(exam)}
            isNext={exam.id === nextId}
            subject={subjectOf(exam.subject)}
            showName={!group.series}
            syllabus={syllabusOf(exam)}
            onEdit={onEdit}
            onRemove={onRemove}
            busy={busy}
          />
        </View>
      ))}
    </Card>
  );
}

const defaultSyllabus = (exam) => (exam.chapters ?? []).map((chapter) => chapter.name);

/**
 * Every exam in one place, the way a school datesheet reads: Unit tests, Half-yearly & final,
 * and Other exams. Each exam is a table of Date, Day, Subject and days left; tap a paper to
 * see its syllabus. The next paper overall is highlighted.
 *
 * `subjectOf(id)` gives `{ name, color }`; `syllabusOf(exam)` gives chapter names (defaults to
 * `exam.chapters`). `onAdd(kind)` shows an Add button per section. `onEdit` / `onRemove` act
 * on one paper, `onEditGroup` / `onRemoveGroup` on a whole exam.
 */
const SECTION_LOOK = { unit: ['list', 'tint'], term: ['trophy', 'warning'], other: ['star', 'success'] };

export function Datesheet({ exams, today, subjectOf, syllabusOf = defaultSyllabus, onAdd, onEdit, onRemove, onEditGroup, onRemoveGroup, busy = false }) {
  const { colors } = useTheme();
  const daysLeftOf = (exam) => exam.daysLeft ?? diffDays(today, exam.date);
  const nextId = [...exams].sort((a, b) => daysLeftOf(a) - daysLeftOf(b))[0]?.id;
  const shared = { nextId, daysLeftOf, subjectOf, syllabusOf, onEdit, onRemove, onEditGroup, onRemoveGroup, busy };
  return (
    <View style={styles.sections}>
      {datesheetSections(exams).map((section) => (
        <View key={section.value} style={styles.section} testID={`datesheet-section-${section.value}`}>
          <View style={styles.sectionHead}>
            <IconTile name={SECTION_LOOK[section.value]?.[0] ?? 'today'} color={colors[SECTION_LOOK[section.value]?.[1]] ?? colors.tint} size={26} />
            <View style={styles.flex}>
              <Text style={[styles.sectionTitle, { color: colors.text }]} accessibilityRole="header">
                {section.title}
              </Text>
              <Text style={[styles.sectionMeta, { color: colors.textSecondary }]} numberOfLines={2}>
                {section.groups.length ? plural(section.groups.length, 'exam') : section.empty}
              </Text>
            </View>
            {onAdd ? (
              <Button
                title="Add"
                icon="plus"
                size="sm"
                variant={section.groups.length ? 'secondary' : 'primary'}
                accessibilityLabel={section.addLabel}
                onPress={() => onAdd(section.addKind)}
                disabled={busy}
                testID={`datesheet-add-${section.value}`}
              />
            ) : null}
          </View>
          {section.groups.map((group) => (
            <Group key={group.title} group={group} {...shared} />
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  sections: { gap: 20 },
  section: { gap: 10, alignItems: 'stretch' },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 2 },
  sectionTitle: { fontSize: 15.5, fontWeight: '800' },
  sectionMeta: { fontSize: 12, marginTop: 1, lineHeight: 16 },
  groupHead: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 14, paddingRight: 10, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  groupTitle: { fontSize: 14, fontWeight: '700' },
  groupMeta: { fontSize: 12, marginTop: 1 },
  headMain: { paddingVertical: 6 },
  flex: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', paddingRight: 6 },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 9, paddingLeft: 12, paddingVertical: 8 },
  headRow: { paddingVertical: 0 },
  head: { fontSize: 10.5, fontWeight: '700', letterSpacing: 0.4 },
  dateCol: { width: 32, alignItems: 'center', textAlign: 'center' },
  dateNum: { fontSize: 17, fontWeight: '800' },
  dayCol: { width: 32, fontSize: 13 },
  subjectCol: { flex: 1, gap: 1 },
  subjectLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  subject: { fontSize: 15, fontWeight: '700', flexShrink: 1 },
  nextPill: { paddingHorizontal: 5, paddingVertical: 1, borderRadius: 5 },
  next: { fontSize: 9, fontWeight: '900', letterSpacing: 0.5, color: '#fff' },
  leftCol: { width: 52, textAlign: 'right', fontSize: 12.5 },
  actions: { flexDirection: 'row', width: 64, justifyContent: 'flex-end' },
  action: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  syllabus: { paddingLeft: 85, paddingRight: 14, paddingBottom: 10, gap: 2 },
  syllabusHead: { fontSize: 10.5, fontWeight: '700', letterSpacing: 0.4, marginBottom: 2 },
});
