import { memo, useId, useMemo, useRef, useState } from 'react';
import { Dimensions, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { useTheme } from '../../theme/ThemeProvider';
import { datesheetSections, EXAM_KINDS, sectionOf } from '../../utils/datesheet';
import { dayOfMonth, diffDays, plural, shortMonth, shortWeekday } from '../../utils/format';
import { Button } from '../ui/Button';
import { Icon } from '../ui/Icon';
import { Card, IconTile } from '../ui/Layout';
import { Appear, ProgressBar } from '../ui/Motion';
import { SubjectDot } from './Badges';

/** How each section looks: its tab label, icon and colour, and what it says while empty. */
const SECTION_LOOK = {
  unit: { tab: 'Unit tests', icon: 'list', tone: 'tint', emptyTitle: 'No unit tests yet', emptyBody: 'Add UT 1 with its syllabus. Your plan works back from its dates.' },
  term: { tab: 'Term exams', icon: 'trophy', tone: 'warning', emptyTitle: 'No half-yearly or final yet', emptyBody: 'Add it when the datesheet is out: one paper per subject, each with its syllabus.' },
  other: { tab: 'Other', icon: 'star', tone: 'success', emptyTitle: 'No other exams yet', emptyBody: 'Olympiads, class tests, anything else.' },
};

const MENU_WIDTH = 170;

function dateRange(from, to) {
  if (from === to) return `${dayOfMonth(from)} ${shortMonth(from)}`;
  if (shortMonth(from) === shortMonth(to)) return `${dayOfMonth(from)}–${dayOfMonth(to)} ${shortMonth(to)}`;
  return `${dayOfMonth(from)} ${shortMonth(from)} – ${dayOfMonth(to)} ${shortMonth(to)}`;
}

function leftLabel(days) {
  if (days < 0) return 'Done';
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  return `${days} days`;
}

/** Badge colours for "days left": red in the last three days, amber within a week. */
function urgency(days, colors) {
  if (days < 0) return { bg: colors.fill, fg: colors.textTertiary };
  if (days <= 3) return { bg: colors.dangerSoft, fg: colors.danger };
  if (days <= 7) return { bg: colors.warningSoft, fg: colors.warningInk };
  return { bg: colors.fill, fg: colors.textSecondary };
}

function IconAction({ icon, label, onPress, disabled, color, bg, testID }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [bg ? styles.round : styles.action, bg && { backgroundColor: bg }, { opacity: disabled ? 0.4 : pressed ? 0.55 : 1 }]}
      testID={testID}
    >
      <Icon name={icon} size={bg ? 16 : 17} color={color} />
    </Pressable>
  );
}

/** A small calendar leaf: weekday, day and month stacked. */
function DateTile({ date, isNext, done }) {
  const { colors } = useTheme();
  const look = isNext
    ? { bg: colors.tint, fg: colors.onTint, sub: 'rgba(255,255,255,0.82)' }
    : { bg: colors.fill, fg: done ? colors.textTertiary : colors.text, sub: colors.textSecondary };
  return (
    <View style={[styles.dateTile, { backgroundColor: look.bg }]}>
      <Text style={[styles.tileSmall, { color: look.sub }]}>{shortWeekday(date).toUpperCase()}</Text>
      <Text style={[styles.tileNum, { color: look.fg }]}>{dayOfMonth(date)}</Text>
      <Text style={[styles.tileSmall, { color: look.sub }]}>{shortMonth(date).toUpperCase()}</Text>
    </View>
  );
}

const PaperRow = memo(function PaperRow({ exam, daysLeft, isNext, first, subject, showName, syllabus, onEdit, onRemove, busy }) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const done = daysLeft < 0;
  const left = leftLabel(daysLeft);
  const badge = urgency(daysLeft, colors);
  const summary = exam.readiness ? `${exam.readiness.revised}/${exam.readiness.total} revised` : plural(exam.chapterKeys.length, 'chapter');
  return (
    <View
      style={[isNext && { backgroundColor: colors.tintSoft }, !first && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.separator }, done && styles.done]}
      testID={`datesheet-row-${exam.id}`}
    >
      <View style={styles.row}>
        <Pressable
          onPress={() => setOpen((value) => !value)}
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          accessibilityLabel={`${subject.name}${showName ? `, ${exam.name}` : ''}, ${shortWeekday(exam.date)} ${dayOfMonth(exam.date)} ${shortMonth(exam.date)}, ${done ? 'done' : `${left}${daysLeft > 1 ? ' left' : ''}`}. ${open ? 'Hide' : 'Show'} syllabus`}
          style={({ pressed }) => [styles.rowMain, { opacity: pressed ? 0.6 : 1 }]}
        >
          <DateTile date={exam.date} isNext={isNext} done={done} />
          <View style={styles.subjectCol}>
            <View style={styles.subjectLine}>
              <SubjectDot subject={exam.subject} size={9} color={subject.color} />
              <Text style={[styles.subject, { color: colors.text }]} numberOfLines={2}>
                {subject.name}
              </Text>
            </View>
            <View style={styles.metaLine}>
              {isNext ? (
                <View style={[styles.nextPill, { backgroundColor: colors.tint }]}>
                  <Text style={[styles.next, { color: colors.onTint }]}>NEXT</Text>
                </View>
              ) : null}
              <Text style={[styles.metaText, { color: colors.textSecondary }]} numberOfLines={1}>
                {showName ? `${exam.name} · ` : ''}
                {summary}
              </Text>
              <Icon name={open ? 'up' : 'down'} size={13} color={colors.textTertiary} strokeWidth={2.4} />
            </View>
          </View>
          <View style={[styles.leftPill, { backgroundColor: badge.bg }]}>
            <Text style={[styles.leftText, { color: badge.fg }]}>{left}</Text>
          </View>
        </Pressable>
        {onEdit ? <IconAction icon="pencil" label={`Edit ${exam.name}`} onPress={() => onEdit(exam)} disabled={busy} color={colors.tint} testID={`edit-exam-${exam.id}`} /> : null}
      </View>
      {open ? (
        <View style={styles.syllabus}>
          <Text style={[styles.syllabusHead, { color: colors.textTertiary }]}>SYLLABUS</Text>
          {syllabus.length ? (
            syllabus.map((name, index) => (
              <View key={`${index}-${name}`} style={styles.chapter}>
                <Text style={[styles.chapterNum, { color: colors.textTertiary }]}>{index + 1}</Text>
                <Text style={[styles.chapterName, { color: colors.text }]}>{name}</Text>
              </View>
            ))
          ) : (
            <Text style={{ color: colors.textSecondary, fontSize: 14 }}>No chapters picked.</Text>
          )}
          {onRemove ? (
            <View style={styles.paperActions}>
              <Button title="Remove paper" icon="trash" size="sm" variant="danger" accessibilityLabel={`Remove ${exam.name}`} onPress={() => onRemove(exam)} disabled={busy} testID={`remove-exam-${exam.id}`} />
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
});

/** One exam (e.g. "Unit test 1"): its name, dates, readiness and actions top its own card. */
function Group({ group, nextId, daysLeftOf, subjectOf, syllabusOf, onEdit, onRemove, onEditGroup, onRemoveGroup, busy }) {
  const { colors } = useTheme();
  const ready = group.exams.reduce(
    (sum, exam) => (exam.readiness ? { revised: sum.revised + exam.readiness.revised, total: sum.total + exam.readiness.total } : sum),
    { revised: 0, total: 0 },
  );
  return (
    <Card flush testID={`datesheet-group-${group.title}`}>
      <View style={styles.groupHead}>
        <View style={styles.flex}>
          <Text style={[styles.groupTitle, { color: colors.text }]} numberOfLines={2}>
            {group.title}
          </Text>
          <View style={styles.groupMetaLine}>
            <Icon name="today" size={13} color={colors.textTertiary} />
            <Text style={[styles.groupMeta, { color: colors.textSecondary }]}>
              {dateRange(group.from, group.to)} · {plural(group.exams.length, 'paper')}
            </Text>
          </View>
        </View>
        {onEditGroup ? <IconAction icon="pencil" label={`Edit ${group.title}`} onPress={() => onEditGroup(group)} disabled={busy} color={colors.tintInk} bg={colors.tintSoft} testID={`datesheet-edit-group-${group.title}`} /> : null}
        {onRemoveGroup ? (
          <IconAction icon="trash" label={`Remove ${group.title}`} onPress={() => onRemoveGroup(group)} disabled={busy} color={colors.danger} bg={colors.dangerSoft} testID={`datesheet-remove-group-${group.title}`} />
        ) : null}
      </View>
      {ready.total ? (
        <View style={styles.readiness} accessibilityLabel={`${ready.revised} of ${ready.total} chapters revised`}>
          <ProgressBar progress={ready.revised / ready.total} color={colors.success} track={colors.fill} height={6} style={styles.flex} />
          <Text style={[styles.readyText, { color: colors.textSecondary }]}>
            {ready.revised}/{ready.total} chapters revised
          </Text>
        </View>
      ) : null}
      <View style={[styles.papers, { borderTopColor: colors.separator }]}>
        {group.exams.map((exam, index) => (
          <PaperRow
            key={exam.id}
            exam={exam}
            first={index === 0}
            daysLeft={daysLeftOf(exam)}
            isNext={exam.id === nextId}
            subject={subjectOf(exam.subject)}
            showName={!group.series}
            syllabus={syllabusOf(exam)}
            onEdit={onEdit}
            onRemove={onRemove}
            busy={busy}
          />
        ))}
      </View>
    </Card>
  );
}

/** Unit tests / Term exams / Other, each with how many exams it holds. */
function SectionTabs({ sections, value, onChange }) {
  const { colors, radius } = useTheme();
  return (
    <View style={[styles.tabs, { backgroundColor: colors.fill, borderRadius: radius.md }]} accessibilityRole="tablist">
      {sections.map((section) => {
        const look = SECTION_LOOK[section.value];
        const selected = section.value === value;
        const count = section.groups.length;
        return (
          <Pressable
            key={section.value}
            onPress={() => onChange(section.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={`${section.title}, ${plural(count, 'exam')}`}
            testID={`datesheet-tab-${section.value}`}
            style={[styles.tab, selected && { backgroundColor: colors.card, borderRadius: radius.md - 3, boxShadow: colors.shadow }]}
          >
            <Text style={[styles.tabLabel, { color: selected ? colors.text : colors.textSecondary, fontWeight: selected ? '700' : '600' }]} numberOfLines={1}>
              {look.tab}
            </Text>
            {count ? (
              <View style={[styles.count, { backgroundColor: selected ? colors[look.tone] : colors.fillStrong }]}>
                <Text style={[styles.countText, { color: selected ? colors.onTint : colors.textSecondary }]}>{count}</Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * The section's "Add" button: a dashed row under the exams, or a filled button when the section
 * is empty. Sections with one kind of exam add it straight away; the others (unit/periodic,
 * half-yearly/final) open a small menu under the button first.
 */
function AddMenu({ section, onAdd, disabled, filled = false }) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState(null);
  const ref = useRef(null);
  const kinds = EXAM_KINDS.filter((kind) => section.kinds.includes(kind.value));
  // Open straight away; place the menu under the trigger once it has been measured (some
  // platforms never call back, and the menu must still open).
  const press = () => {
    if (kinds.length === 1) {
      onAdd(section.addKind);
      return;
    }
    setOpen(true);
    ref.current?.measure((_x, _y, w, h, px, py) => {
      const screenW = Dimensions.get('window').width;
      const left = Math.min(Math.max(px + (w - MENU_WIDTH) / 2, 8), screenW - MENU_WIDTH - 8);
      setAnchor({ left, top: py + h + 4 });
    });
  };
  return (
    <View ref={ref} collapsable={false}>
      {filled ? (
        <Button title={section.addLabel} icon="plus" size="sm" variant="primary" onPress={press} disabled={disabled} testID={`datesheet-add-${section.value}`} />
      ) : (
        <DashedAdd label={section.addLabel} onPress={press} disabled={disabled} testID={`datesheet-add-${section.value}`} />
      )}
      {kinds.length > 1 ? (
        <Modal visible={open} transparent animationType="none" onRequestClose={() => setOpen(false)}>
          <Pressable style={styles.overlay} onPress={() => setOpen(false)}>
            <View style={[styles.menu, { backgroundColor: colors.card, borderColor: colors.separator, top: anchor?.top ?? 0, left: anchor?.left ?? 0, width: MENU_WIDTH }]}>
              {kinds.map((kind, index) => (
                <View key={kind.value}>
                  {index > 0 ? <View style={[styles.menuDivider, { backgroundColor: colors.separator }]} /> : null}
                  <Pressable
                    onPress={() => {
                      setOpen(false);
                      onAdd(kind.value);
                    }}
                    style={({ pressed }) => [styles.menuItem, { opacity: pressed ? 0.5 : 1 }]}
                    accessibilityRole="menuitem"
                  >
                    <Text style={{ color: colors.text, fontSize: 14, fontWeight: '600' }}>{kind.label}</Text>
                  </Pressable>
                </View>
              ))}
            </View>
          </Pressable>
        </Modal>
      ) : null}
    </View>
  );
}

function DashedAdd({ label, onPress, disabled, testID }) {
  const { colors, radius } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      testID={testID}
      style={({ pressed }) => [styles.dashed, { borderColor: colors.fillStrong, borderRadius: radius.lg, backgroundColor: pressed ? colors.fill : 'transparent', opacity: disabled ? 0.45 : 1 }]}
    >
      <Icon name="plus" size={16} color={colors.tintInk} strokeWidth={2.4} />
      <Text style={[styles.dashedText, { color: colors.tintInk }]}>{label}</Text>
    </Pressable>
  );
}

function EmptySection({ section, onAdd, busy }) {
  const { colors } = useTheme();
  const look = SECTION_LOOK[section.value];
  return (
    <Card style={styles.empty}>
      <IconTile name={look.icon} color={colors[look.tone]} size={44} />
      <Text style={[styles.emptyTitle, { color: colors.text }]}>{look.emptyTitle}</Text>
      <Text style={[styles.emptyBody, { color: colors.textSecondary }]}>{look.emptyBody}</Text>
      {onAdd ? <AddMenu section={section} onAdd={onAdd} disabled={busy} filled /> : null}
    </Card>
  );
}

/** A soft fade at the bottom of the scroll area, hinting that there is more below. */
function FadeEdge({ color }) {
  const id = `fade${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <View pointerEvents="none" style={styles.fade}>
      <Svg width="100%" height="100%" aria-hidden>
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={color} stopOpacity={0} />
            <Stop offset="1" stopColor={color} stopOpacity={1} />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}

/** Caps the exam cards at `maxHeight`; past that they scroll inside the page. */
function ScrollArea({ maxHeight, children }) {
  const { colors } = useTheme();
  const [viewH, setViewH] = useState(0);
  const [contentH, setContentH] = useState(0);
  const [atEnd, setAtEnd] = useState(false);
  const overflows = viewH > 0 && contentH > viewH + 1;
  return (
    <View style={styles.scrollWrap}>
      <ScrollView
        style={{ maxHeight }}
        contentContainerStyle={styles.scrollContent}
        nestedScrollEnabled
        persistentScrollbar
        scrollEventThrottle={32}
        onLayout={(event) => setViewH(event.nativeEvent.layout.height)}
        onContentSizeChange={(_w, h) => setContentH(h)}
        onScroll={(event) => {
          const { contentOffset, layoutMeasurement, contentSize } = event.nativeEvent;
          setAtEnd(contentOffset.y + layoutMeasurement.height >= contentSize.height - 12);
        }}
        testID="datesheet-scroll"
      >
        {children}
      </ScrollView>
      {overflows && !atEnd ? <FadeEdge color={colors.background} /> : null}
    </View>
  );
}

const defaultSyllabus = (exam) => (exam.chapters ?? []).map((chapter) => chapter.name);

/**
 * Every exam in one place, the way a school datesheet reads, split into tabs: Unit tests,
 * Term exams (half-yearly & final) and Other. Each exam is a card of papers with date, subject
 * and days left; tap a paper to see its syllabus. The next paper overall is highlighted.
 *
 * `subjectOf(id)` gives `{ name, color }`; `syllabusOf(exam)` gives chapter names (defaults to
 * `exam.chapters`). `onAdd(kind)` shows an Add button per section. `onEdit` / `onRemove` act
 * on one paper, `onEditGroup` / `onRemoveGroup` on a whole exam. `maxHeight` makes the list of
 * exams scroll inside that height. `initialSection` picks the tab shown first; otherwise it is
 * the one holding the next paper.
 */
export function Datesheet({ exams, today, subjectOf, syllabusOf = defaultSyllabus, onAdd, onEdit, onRemove, onEditGroup, onRemoveGroup, busy = false, maxHeight, initialSection }) {
  const sections = useMemo(() => datesheetSections(exams), [exams]);
  const daysLeftOf = (exam) => exam.daysLeft ?? diffDays(today, exam.date);
  const next = exams.filter((exam) => daysLeftOf(exam) >= 0).sort((a, b) => daysLeftOf(a) - daysLeftOf(b))[0];
  const [active, setActive] = useState(() => initialSection ?? (next ? sectionOf(next) : sections.find((section) => section.groups.length)?.value) ?? sections[0].value);

  // An exam added from anywhere (the tab's Add, or the Exam tile) opens its tab, so it is seen.
  const [known, setKnown] = useState(() => new Set(exams.map((exam) => exam.id)));
  const added = exams.find((exam) => !known.has(exam.id));
  if (added) {
    setKnown(new Set(exams.map((exam) => exam.id)));
    setActive(sectionOf(added));
  }

  const section = sections.find((item) => item.value === active) ?? sections[0];
  const shared = { nextId: next?.id, daysLeftOf, subjectOf, syllabusOf, onEdit, onRemove, onEditGroup, onRemoveGroup, busy };
  const groups = section.groups.map((group) => <Group key={group.exams[0].id} group={group} {...shared} />);
  return (
    <View style={styles.wrap}>
      <SectionTabs sections={sections} value={section.value} onChange={setActive} />
      <Appear key={section.value} distance={6} duration={220}>
        <View style={styles.panel} testID={`datesheet-section-${section.value}`}>
          {section.groups.length ? (
            <>
              {maxHeight ? <ScrollArea maxHeight={maxHeight}>{groups}</ScrollArea> : <View style={styles.groups}>{groups}</View>}
              {onAdd ? <AddMenu section={section} onAdd={onAdd} disabled={busy} /> : null}
            </>
          ) : (
            <EmptySection section={section} onAdd={onAdd} busy={busy} />
          )}
        </View>
      </Appear>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  panel: { gap: 12 },
  groups: { gap: 12 },
  flex: { flex: 1 },

  tabs: { flexDirection: 'row', padding: 3 },
  tab: { flexGrow: 1, flexShrink: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 8 },
  tabLabel: { fontSize: 13, flexShrink: 1 },
  count: { minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 5, alignItems: 'center', justifyContent: 'center' },
  countText: { fontSize: 11, fontWeight: '800' },

  scrollWrap: { marginHorizontal: -8 },
  scrollContent: { gap: 12, paddingHorizontal: 8, paddingTop: 2, paddingBottom: 8 },
  fade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 40 },

  groupHead: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 14, paddingRight: 12, paddingTop: 12, paddingBottom: 10 },
  groupTitle: { fontSize: 16, fontWeight: '800' },
  groupMetaLine: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 },
  groupMeta: { fontSize: 12.5, fontWeight: '500' },
  readiness: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingBottom: 12 },
  readyText: { fontSize: 12, fontWeight: '600' },
  papers: { borderTopWidth: StyleSheet.hairlineWidth },

  row: { flexDirection: 'row', alignItems: 'center', paddingRight: 4 },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, paddingLeft: 12, paddingRight: 4, paddingVertical: 10 },
  done: { opacity: 0.6 },
  dateTile: { width: 46, paddingVertical: 5, borderRadius: 12, alignItems: 'center' },
  tileSmall: { fontSize: 9.5, fontWeight: '800', letterSpacing: 0.6 },
  tileNum: { fontSize: 19, fontWeight: '800', lineHeight: 23 },
  subjectCol: { flex: 1, gap: 4 },
  subjectLine: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  subject: { fontSize: 15, fontWeight: '700', flexShrink: 1, lineHeight: 19 },
  metaLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  metaText: { fontSize: 12.5, flexShrink: 1 },
  nextPill: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5 },
  next: { fontSize: 9, fontWeight: '900', letterSpacing: 0.5 },
  leftPill: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999 },
  leftText: { fontSize: 12, fontWeight: '800' },
  action: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  round: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },

  syllabus: { paddingLeft: 70, paddingRight: 14, paddingBottom: 12, gap: 5 },
  syllabusHead: { fontSize: 10.5, fontWeight: '700', letterSpacing: 0.4, marginBottom: 1 },
  chapter: { flexDirection: 'row', gap: 8 },
  chapterNum: { width: 14, fontSize: 13, fontWeight: '700', textAlign: 'right', lineHeight: 19 },
  chapterName: { flex: 1, fontSize: 14, lineHeight: 19 },
  paperActions: { flexDirection: 'row', marginTop: 6 },

  dashed: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderWidth: 1.5, borderStyle: 'dashed' },
  dashedText: { fontSize: 14, fontWeight: '700' },

  empty: { alignItems: 'center', gap: 6, paddingVertical: 22 },
  emptyTitle: { fontSize: 15.5, fontWeight: '800', marginTop: 4, textAlign: 'center' },
  emptyBody: { fontSize: 13, lineHeight: 18, textAlign: 'center', maxWidth: 290, marginBottom: 6 },

  overlay: { flex: 1 },
  menu: { position: 'absolute', borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 6 },
  menuItem: { paddingHorizontal: 14, paddingVertical: 11 },
  menuDivider: { height: StyleSheet.hairlineWidth },
});
