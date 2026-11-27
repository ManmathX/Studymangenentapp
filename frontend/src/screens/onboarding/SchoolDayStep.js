import { Text } from 'react-native';
import { useState } from 'react';
import { SchoolDayFields } from '../../components/domain/SchoolDayFields';
import { Button } from '../../components/ui/Button';
import { Muted } from '../../components/ui/Layout';
import { profileApi } from '../../data/api';
import { useAsyncAction } from '../../hooks/useAsyncAction';
import { useAuthStore } from '../../store/authStore';
import { useOnboardingStore } from '../../store/onboardingStore';
import { toast } from '../../store/toastStore';
import { useTheme } from '../../theme/ThemeProvider';
import { schoolDayProblem, tuitionsFromForm } from '../../utils/tuitions';
import { FieldHeading, StepLayout } from './StepLayout';
import { useDraftSubjects } from './useDraftSubjects';

export function SchoolDayStep() {
  const { colors } = useTheme();
  const { draft, syllabus, chosen } = useDraftSubjects();
  const update = useOnboardingStore((state) => state.update);
  const resetDraft = useOnboardingStore((state) => state.reset);
  const googleName = useAuthStore((state) => state.user?.name);
  const plannerChanged = useAuthStore((state) => state.plannerChanged);
  const [error, setError] = useState(null);

  const build = useAsyncAction(async () => {
    const problem = schoolDayProblem(draft);
    if (problem) {
      setError(problem);
      return;
    }
    if (!syllabus.data) {
      setError('Your subjects are still loading. Try again in a moment.');
      return;
    }
    setError(null);
    const subjects = chosen.map((subject) => subject.id);
    try {
      // The board's syllabus came from the server; the student's copy is saved only on this phone.
      const result = await profileApi.onboard({
        // The name typed on the first setup screen; the Google account name if they kept it.
        name: draft.name?.trim() || googleName,
        board: draft.board,
        boardName: draft.boardName,
        examShortName: draft.exam?.shortName,
        examCategory: draft.exam?.category,
        level: draft.level?.key,
        levelName: draft.level?.name,
        cls: draft.cls,
        syllabusVersion: syllabus.data.version?.id,
        syllabusYear: syllabus.data.version?.academicYear,
        catalog: syllabus.data.subjects,
        subjects,
        customSubjects: draft.customSubjects.map(({ id, name, color, chapters }) => ({ id, name, color, chapters })),
        taughtChapterKeys: Object.keys(draft.taught).filter((key) => draft.taught[key] && subjects.some((subject) => key.startsWith(`${subject}-`))),
        exams: draft.exams.filter((exam) => subjects.includes(exam.subject)).map(({ id: _id, ...exam }) => exam),
        schoolStart: draft.schoolStart,
        schoolEnd: draft.schoolEnd,
        saturday: draft.saturday ?? 'half',
        tuitions: tuitionsFromForm(draft.tuitions),
      });
      resetDraft();
      plannerChanged();
      toast(result.planned ? `Plan ready. ${result.planned} study slots added before your tests.` : 'Plan ready. Tap "Schedule from syllabus" in Plan to add your first chapter.');
    } catch (caught) {
      setError(caught.message);
    }
  });

  return (
    <StepLayout
      step={5}
      title="Your school day"
      lead="Add your school hours and every tuition. The planner only uses the time around them."
      footer={<Button title="Build my plan" icon="spark" variant="primary" block onPress={build.execute} loading={build.pending} testID="build-plan" />}
    >
      <SchoolDayFields value={draft} onChange={update} />
      <Muted small>You can change these later in Profile.</Muted>
      <FieldHeading>Your study time</FieldHeading>
      <Muted small>
        All the free time around school, tuition and meals is yours to study, up to 22:00 (change it in Profile). Every day gets self study and revision from your syllabus, and every night ends with revising what school, tuition and self study covered that day.
      </Muted>
      {error ? (
        <Text style={{ color: colors.danger }} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
    </StepLayout>
  );
}
