import { useMemo, useState } from 'react';
import { Datesheet } from '../../components/domain/Datesheet';
import { DatesheetBuilder } from '../../components/domain/DatesheetBuilder';
import { Button } from '../../components/ui/Button';
import { AsyncBoundary } from '../../components/ui/States';
import { useOnboardingStore } from '../../store/onboardingStore';
import { toast } from '../../store/toastStore';
import { kindOf, sectionOf } from '../../utils/datesheet';
import { localTodayKey, plural, timeToMinutes } from '../../utils/format';
import { FieldHeading, StepLayout } from './StepLayout';
import { useDraftSubjects } from './useDraftSubjects';

/** Temporary ids for tests drafted during setup; real ids are given on "Build my plan". */
let draftSequence = 0;
const nextDraftId = () => {
  draftSequence += 1;
  return `draft-${draftSequence}`;
};

/**
 * Step 4: the student copies their school datesheet in. Unit tests, half-yearly and final,
 * and any other exam each have a section; every paper carries its own syllabus.
 */
export function TestsStep({ navigation }) {
  const { draft, syllabus, chosen } = useDraftSubjects();
  const saveSeries = useOnboardingStore((state) => state.saveSeries);
  const removeExams = useOnboardingStore((state) => state.removeExams);
  const today = localTodayKey();
  // null: showing the datesheet. { kind } adds an exam; { kind, initial, ids } edits one.
  const [composing, setComposing] = useState(null);
  // The datesheet tab to show after adding or editing an exam: the one that exam belongs to.
  const [shownSection, setShownSection] = useState(undefined);
  const compose = (next) => {
    setShownSection(sectionOf({ kind: next.kind }));
    setComposing(next);
  };

  const subjectById = useMemo(() => new Map(chosen.map((subject) => [subject.id, subject])), [chosen]);
  const chapterNames = useMemo(() => new Map(chosen.flatMap((subject) => subject.chapters.map((chapter) => [chapter.key, chapter.name]))), [chosen]);
  const exams = draft.exams.filter((exam) => subjectById.has(exam.subject) && exam.date > today);
  const subjectOf = (id) => subjectById.get(id) ?? { name: id, color: undefined };
  const syllabusOf = (exam) => exam.chapterKeys.map((key) => chapterNames.get(key)).filter(Boolean);
  const isTaught = (chapter) => Boolean(draft.taught[chapter.key]);
  const existingSeries = [...new Set(exams.map((exam) => exam.series).filter(Boolean))];

  const onSubmit = async ({ series, kind, papers, ...timing }) => {
    saveSeries(
      // Half-yearly and final papers keep their time and study-leave choice (`timing`).
      papers.map((paper) => ({ id: nextDraftId(), ...paper, series, kind, ...timing })),
      composing?.ids ?? [],
    );
    toast(`${series}: ${plural(papers.length, 'paper')} on your datesheet.`);
    setComposing(null);
  };

  const editGroup = (group) =>
    compose({
      kind: group.kind ?? 'other',
      ids: group.exams.map((exam) => exam.id),
      initial: { series: group.series ?? '', kind: group.kind ?? 'other', papers: group.exams },
    });

  if (composing) {
    return (
      <StepLayout step={4} title={composing.initial ? `Edit ${composing.initial.series}` : `Add ${kindOf(composing.kind).label.toLowerCase()}`} lead="Switch on the subjects that have a paper, set the dates and tick each paper's syllabus.">
        <AsyncBoundary resource={syllabus}>
          {() => (
            <DatesheetBuilder
              subjects={chosen}
              today={today}
              isTaught={isTaught}
              kind={composing.kind}
              initial={composing.initial ?? null}
              existingSeries={existingSeries}
              schoolStart={timeToMinutes(draft.schoolStart ?? '07:45')}
              onSubmit={onSubmit}
              onCancel={() => setComposing(null)}
            />
          )}
        </AsyncBoundary>
      </StepLayout>
    );
  }

  return (
    <StepLayout
      step={4}
      title="Your datesheet"
      lead="Add your unit tests, half-yearly and any other exams with their syllabus. The planner works backwards from these dates."
      footer={<Button title={exams.length ? 'Continue' : 'Skip for now'} variant="primary" block onPress={() => navigation.navigate('SchoolDayStep')} testID="tests-continue" />}
    >
      <FieldHeading>{exams.length ? `${plural(existingSeries.length || 1, 'exam')}, ${plural(exams.length, 'paper')}` : 'Copy it from your school datesheet'}</FieldHeading>
      <Datesheet
        exams={exams}
        today={today}
        subjectOf={subjectOf}
        syllabusOf={syllabusOf}
        initialSection={shownSection}
        onAdd={(kind) => compose({ kind })}
        onEditGroup={editGroup}
        onRemoveGroup={(group) => {
          removeExams(group.exams.map((exam) => exam.id));
          toast(`${group.title} removed.`);
        }}
      />
    </StepLayout>
  );
}
