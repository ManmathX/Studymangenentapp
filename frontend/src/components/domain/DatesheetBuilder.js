import { useMemo, useState } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';
import { useTheme } from '../../theme/ThemeProvider';
import { consecutiveDates, defaultChapterKeys, EXAM_KINDS, kindOf, paperName, suggestedSeriesName } from '../../utils/datesheet';
import { addDays, plural, shortDate } from '../../utils/format';
import { Button } from '../ui/Button';
import { CheckRow, Chip, ChipGroup, ToggleRow } from '../ui/Controls';
import { Input } from '../ui/Field';
import { Card, Divider } from '../ui/Layout';
import { StatusDot, SubjectDot } from './Badges';
import { DayPicker } from './DayPicker';

const DAYS_AHEAD = 180;
const FIRST_PAPER_AHEAD = { unit: 7, periodic: 7, halfYearly: 30, final: 60, other: 7 };

function Heading({ children }) {
  const { colors } = useTheme();
  return <Text style={[styles.heading, { color: colors.textSecondary }]}>{children}</Text>;
}

/**
 * Adds one exam to the datesheet the way the school hands it out: pick the kind (UT, half-yearly…),
 * switch on the subjects with a paper, set each paper's date and tick its syllabus. Dates start
 * back-to-back from the first paper; syllabus starts from what's been taught (unit tests), the
 * first half (half-yearly) or everything (final).
 *
 * `subjects`: [{ id, name, color, chapters: [{ key, name, status? }] }]. `isTaught(chapter)` tells
 * which chapters are done. `initial` ({ series, kind, papers }) loads an exam for editing.
 * `onSubmit({ series, kind, papers })` resolves truthy when saved.
 */
export function DatesheetBuilder({ subjects, today, isTaught, kind: startKind = 'unit', initial = null, existingSeries = [], onSubmit, onCancel, submitLabel }) {
  const { colors } = useTheme();
  const [kindValue, setKindValue] = useState(initial?.kind ?? startKind);
  const kind = kindOf(kindValue);
  const [name, setName] = useState(initial?.series ?? suggestedSeriesName(kindValue, existingSeries));
  const [nameTouched, setNameTouched] = useState(Boolean(initial));
  const initialFirst = initial ? [...initial.papers.map((paper) => paper.date)].sort()[0] : addDays(today, FIRST_PAPER_AHEAD[kindValue] ?? 7);
  const [firstDate, setFirstDate] = useState(initialFirst);
  const [skipSundays, setSkipSundays] = useState(true);
  const [included, setIncluded] = useState(() =>
    initial ? initial.papers.map((paper) => paper.subject) : kindValue === 'other' ? [] : subjects.map((subject) => subject.id),
  );
  const [edits, setEdits] = useState(() =>
    Object.fromEntries((initial?.papers ?? []).map((paper) => [paper.subject, { date: paper.date, chapterKeys: paper.chapterKeys }])),
  );
  const [open, setOpen] = useState(null);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const days = useMemo(() => {
    const list = Array.from({ length: DAYS_AHEAD }, (_, index) => addDays(today, index + 1));
    for (const paper of initial?.papers ?? []) if (!list.includes(paper.date)) list.push(paper.date);
    return list.sort();
  }, [today, initial]);

  const chosen = subjects.filter((subject) => included.includes(subject.id));
  const autoDates = consecutiveDates(firstDate, chosen.length, { skipSundays });
  const papers = chosen.map((subject, index) => ({
    subject,
    date: edits[subject.id]?.date ?? autoDates[index],
    chapterKeys: edits[subject.id]?.chapterKeys ?? defaultChapterKeys(kind, subject.chapters, isTaught),
  }));

  const edit = (subject, patch) => setEdits((current) => ({ ...current, [subject]: { ...current[subject], ...patch } }));
  const dropDates = () => setEdits((current) => Object.fromEntries(Object.entries(current).map(([id, { date: _date, ...rest }]) => [id, rest])));
  const dropChapters = () => setEdits((current) => Object.fromEntries(Object.entries(current).map(([id, { chapterKeys: _keys, ...rest }]) => [id, rest])));

  const chooseKind = (value) => {
    if (value === kindValue) return;
    setKindValue(value);
    if (!nameTouched) setName(suggestedSeriesName(value, existingSeries));
    if (!initial) setFirstDate(addDays(today, FIRST_PAPER_AHEAD[value] ?? 7));
    dropChapters();
    dropDates();
  };

  const toggleSubject = (id, on) => {
    setIncluded((current) => (on ? subjects.map((subject) => subject.id).filter((sid) => sid === id || current.includes(sid)) : current.filter((sid) => sid !== id)));
    if (!on && open?.subject === id) setOpen(null);
  };

  const submit = async () => {
    const series = name.trim();
    if (!series) return setError('Give this exam a name, for example "Unit test 1".');
    if (series.length > 60) return setError('Keep the name under 60 characters.');
    if (!papers.length) return setError('Switch on at least one subject.');
    const empty = papers.find((paper) => !paper.chapterKeys.length);
    if (empty) {
      setOpen({ subject: empty.subject.id, what: 'syllabus' });
      return setError(`Tick the ${empty.subject.name} syllabus.`);
    }
    setError(null);
    setSaving(true);
    try {
      await onSubmit({
        series,
        kind: kindValue,
        papers: papers.map((paper) => ({
          subject: paper.subject.id,
          name: paperName(series, paper.subject.name),
          date: paper.date,
          weight: kind.weight,
          chapterKeys: paper.chapterKeys,
        })),
      });
    } finally {
      setSaving(false);
    }
    return null;
  };

  return (
    <View style={styles.root}>
      <Heading>Which exam?</Heading>
      <ChipGroup label="Exam type">
        {EXAM_KINDS.map((item) => (
          <Chip key={item.value} label={item.label} selected={kindValue === item.value} onPress={() => chooseKind(item.value)} />
        ))}
      </ChipGroup>
      <Input
        label="Name on the datesheet"
        value={name}
        onChangeText={(text) => {
          setName(text);
          setNameTouched(true);
        }}
        placeholder={kindValue === 'other' ? 'e.g. Science Olympiad' : kind.label}
        maxLength={60}
        testID="datesheet-name"
      />

      <Heading>First paper</Heading>
      <DayPicker days={days} value={firstDate} today={today} onChange={(date) => { setFirstDate(date); dropDates(); }} />
      <Card flush>
        <ToggleRow label="Skip Sundays" hint="Papers follow on back-to-back days" value={skipSundays} onValueChange={(value) => { setSkipSundays(value); dropDates(); }} />
      </Card>

      <Heading>Papers and syllabus</Heading>
      <Card flush>
        {subjects.map((subject, index) => {
          const paper = papers.find((item) => item.subject.id === subject.id);
          const what = open?.subject === subject.id ? open.what : null;
          const toggleOpen = (next) => setOpen(what === next ? null : { subject: subject.id, what: next });
          const keys = paper?.chapterKeys ?? [];
          return (
            <View key={subject.id} testID={`builder-paper-${subject.id}`}>
              {index ? <Divider /> : null}
              <View style={styles.paperRow}>
                <SubjectDot subject={subject.id} size={10} color={subject.color} />
                <View style={styles.flex}>
                  <Text style={{ color: paper ? colors.text : colors.textTertiary, fontSize: 16, fontWeight: '600' }}>{subject.name}</Text>
                  <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
                    {paper ? `${shortDate(paper.date)} · ${keys.length} of ${plural(subject.chapters.length, 'chapter')}` : 'No paper'}
                  </Text>
                </View>
                <Switch value={Boolean(paper)} onValueChange={(on) => toggleSubject(subject.id, on)} accessibilityLabel={`${subject.name} paper`} trackColor={{ true: colors.success, false: colors.fillStrong }} thumbColor="#FFFFFF" />
              </View>
              {paper ? (
                <View style={styles.paperActions}>
                  <Button title="Syllabus" icon="check" size="sm" variant={what === 'syllabus' ? 'primary' : 'secondary'} onPress={() => toggleOpen('syllabus')} testID={`builder-${subject.id}-syllabus`} />
                  <Button title="Date" icon="today" size="sm" variant={what === 'date' ? 'primary' : 'secondary'} onPress={() => toggleOpen('date')} testID={`builder-${subject.id}-date`} />
                </View>
              ) : null}
              {paper && what === 'date' ? (
                <View style={styles.panel}>
                  <DayPicker days={days} value={paper.date} today={today} onChange={(date) => edit(subject.id, { date })} />
                </View>
              ) : null}
              {paper && what === 'syllabus' ? (
                <View>
                  <View style={styles.quick}>
                    <Button title="All" size="sm" variant="ghost" onPress={() => edit(subject.id, { chapterKeys: subject.chapters.map((chapter) => chapter.key) })} />
                    <Button title="Taught so far" size="sm" variant="ghost" onPress={() => edit(subject.id, { chapterKeys: subject.chapters.filter(isTaught).map((chapter) => chapter.key) })} />
                    <Button title="None" size="sm" variant="ghost" onPress={() => edit(subject.id, { chapterKeys: [] })} />
                  </View>
                  {subject.chapters.map((chapter) => (
                    <CheckRow
                      key={chapter.key}
                      label={chapter.name}
                      checked={keys.includes(chapter.key)}
                      onToggle={() => edit(subject.id, { chapterKeys: keys.includes(chapter.key) ? keys.filter((key) => key !== chapter.key) : [...keys, chapter.key] })}
                    >
                      {chapter.status ? <StatusDot status={chapter.status} size={8} /> : null}
                    </CheckRow>
                  ))}
                </View>
              ) : null}
            </View>
          );
        })}
      </Card>

      {error ? (
        <Text style={{ color: colors.danger }} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
      <View style={styles.buttons}>
        <View style={styles.flex}>
          <Button
            title={submitLabel ?? (initial ? 'Save exam' : `Add ${papers.length ? plural(papers.length, 'paper') : 'exam'} to datesheet`)}
            icon="check"
            variant="primary"
            block
            onPress={submit}
            loading={saving}
            testID="datesheet-submit"
          />
        </View>
        {onCancel ? <Button title="Cancel" variant="ghost" onPress={onCancel} /> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 10 },
  heading: { fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 6, paddingHorizontal: 2 },
  flex: { flex: 1 },
  paperRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 6 },
  paperActions: { flexDirection: 'row', gap: 8, paddingHorizontal: 14, paddingBottom: 10, marginLeft: 22 },
  panel: { paddingHorizontal: 12, paddingBottom: 10 },
  quick: { flexDirection: 'row', gap: 4, paddingHorizontal: 12 },
  buttons: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
