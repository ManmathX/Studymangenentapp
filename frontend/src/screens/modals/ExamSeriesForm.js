import { useMemo, useState } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';
import { StatusDot, SubjectDot } from '../../components/domain/Badges';
import { DayPicker } from '../../components/domain/DayPicker';
import { Button } from '../../components/ui/Button';
import { CheckRow, ToggleRow } from '../../components/ui/Controls';
import { Card, Divider, Muted, Section } from '../../components/ui/Layout';
import { AsyncBoundary } from '../../components/ui/States';
import { EXAM_SERIES } from '../../data/core/types';
import { useAsyncAction } from '../../hooks/useAsyncAction';
import { useResource } from '../../hooks/useResource';
import { examActions } from '../../services/actions';
import { resources } from '../../services/resources';
import { useSubjectInfo } from '../../store/subjectStore';
import { useTheme } from '../../theme/ThemeProvider';
import { addDays, shortDate } from '../../utils/format';

const FIRST_PAPER_DAYS_AHEAD = 120;

/**
 * Half-yearly or final exam: pick the first paper's date and the date sheet fills in one
 * paper per subject on back-to-back days, each with its usual chapters ticked. Any paper's
 * date or chapters can be changed, and a paper can be left out.
 */
export function ExamSeriesForm({ profile, type, onDone }) {
  const series = EXAM_SERIES[type];
  const subjectOf = useSubjectInfo();
  const today = profile.today;
  const days = useMemo(() => Array.from({ length: FIRST_PAPER_DAYS_AHEAD }, (_, index) => addDays(today, index + 1)), [today]);
  const [firstDate, setFirstDate] = useState(addDays(today, type === 'final' ? 60 : 30));
  const [skipSundays, setSkipSundays] = useState(true);
  const [edits, setEdits] = useState({});
  const [open, setOpen] = useState(null);
  const [error, setError] = useState(null);
  const draft = useResource(resources.examSeriesDraft(type, firstDate, skipSundays));

  const paperFor = (paper) => ({ ...paper, ...edits[paper.subject] });
  const edit = (subject, patch) => setEdits((current) => ({ ...current, [subject]: { ...current[subject], ...patch } }));
  // Moving the first paper or the Sunday rule rebuilds the date sheet; ticked chapters are kept.
  const resetDates = () =>
    setEdits((current) => Object.fromEntries(Object.entries(current).map(([subject, { date: _date, ...rest }]) => [subject, rest])));

  const submit = useAsyncAction(async () => {
    const papers = (draft.data ?? []).map(paperFor).filter((paper) => !paper.excluded);
    if (!papers.length) return setError('Keep at least one paper.');
    const empty = papers.find((paper) => !paper.chapterKeys.length);
    if (empty) return setError(`Tick at least one ${subjectOf(empty.subject).name} chapter.`);
    setError(null);
    const created = await examActions.createSeries(
      { type, papers: papers.map(({ subject, date, chapterKeys }) => ({ subject, date, chapterKeys })) },
      series.label,
    );
    if (created) onDone(created);
    return created;
  });

  return (
    <View style={{ gap: 16 }}>
      <Section title="First paper" bare footer={`Papers follow on back-to-back days. Preparation starts ${series.prepDays / 7} weeks before the first paper.`}>
        <DayPicker
          days={days}
          value={firstDate}
          today={today}
          onChange={(date) => {
            setFirstDate(date);
            resetDates();
          }}
        />
      </Section>
      <Card flush>
        <ToggleRow
          label="Skip Sundays"
          hint="No papers on Sundays"
          value={skipSundays}
          onValueChange={(value) => {
            setSkipSundays(value);
            resetDates();
          }}
        />
      </Card>
      <Section title="Date sheet" bare footer="Every day of the plan mixes subjects, and the evening before each paper is kept for revising that subject.">
        <AsyncBoundary resource={draft}>
          {(list) => (
            <Card flush>
              {list.map((base, index) => (
                <PaperRow
                  key={base.subject}
                  paper={paperFor(base)}
                  first={index === 0}
                  days={days}
                  today={today}
                  open={open?.subject === base.subject ? open.what : null}
                  onOpen={(what) => setOpen(open?.subject === base.subject && open.what === what ? null : { subject: base.subject, what })}
                  onEdit={(patch) => edit(base.subject, patch)}
                />
              ))}
            </Card>
          )}
        </AsyncBoundary>
      </Section>
      {error ? <ErrorText message={error} /> : null}
      <Button title={`Add ${series.label.toLowerCase()} and plan`} icon="spark" variant="primary" block onPress={submit.execute} loading={submit.pending} testID="series-submit" />
    </View>
  );
}

function PaperRow({ paper, first, days, today, open, onOpen, onEdit }) {
  const { colors } = useTheme();
  const name = useSubjectInfo()(paper.subject).name;
  const toggleChapter = (key) =>
    onEdit({ chapterKeys: paper.chapterKeys.includes(key) ? paper.chapterKeys.filter((item) => item !== key) : [...paper.chapterKeys, key] });
  return (
    <View testID={`paper-${paper.subject}`}>
      {first ? null : <Divider />}
      <View style={styles.row}>
        <SubjectDot subject={paper.subject} size={10} />
        <View style={styles.flex}>
          <Text style={{ color: paper.excluded ? colors.textTertiary : colors.text, fontSize: 16, fontWeight: '600' }}>{name}</Text>
          <Muted small>
            {paper.excluded ? 'Not taking this paper' : `${shortDate(paper.date)} · ${paper.chapterKeys.length} of ${paper.chapters.length} chapters`}
          </Muted>
        </View>
        <Switch value={!paper.excluded} onValueChange={(on) => onEdit({ excluded: !on })} accessibilityLabel={`${name} paper`} />
      </View>
      {paper.excluded ? null : (
        <View style={styles.actions}>
          <Button title="Date" size="sm" variant={open === 'date' ? 'primary' : 'secondary'} onPress={() => onOpen('date')} testID={`paper-${paper.subject}-date`} />
          <Button title="Chapters" size="sm" variant={open === 'chapters' ? 'primary' : 'secondary'} onPress={() => onOpen('chapters')} testID={`paper-${paper.subject}-chapters`} />
        </View>
      )}
      {open === 'date' && !paper.excluded ? (
        <View style={styles.panel}>
          <DayPicker days={days} value={paper.date} today={today} onChange={(date) => onEdit({ date })} />
        </View>
      ) : null}
      {open === 'chapters' && !paper.excluded
        ? paper.chapters.map((chapter) => (
            <CheckRow key={chapter.key} label={chapter.name} checked={paper.chapterKeys.includes(chapter.key)} onToggle={() => toggleChapter(chapter.key)}>
              <StatusDot status={chapter.status} size={8} />
            </CheckRow>
          ))
        : null}
    </View>
  );
}

function ErrorText({ message }) {
  const { colors } = useTheme();
  return (
    <Text style={{ color: colors.danger }} accessibilityRole="alert">
      {message}
    </Text>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  flex: { flex: 1 },
  actions: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingBottom: 12, marginLeft: 22 },
  panel: { paddingHorizontal: 12, paddingBottom: 12 },
});
