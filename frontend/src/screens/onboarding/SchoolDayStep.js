import { Text } from 'react-native';
import { useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Chip, ChipGroup, SegmentedControl, Stepper } from '../../components/ui/Controls';
import { Card, Divider, Muted } from '../../components/ui/Layout';
import { useAsyncAction } from '../../hooks/useAsyncAction';
import { profileApi } from '../../services/api/endpoints';
import { useAuthStore } from '../../store/authStore';
import { useOnboardingStore } from '../../store/onboardingStore';
import { toast } from '../../store/toastStore';
import { useTheme } from '../../theme/ThemeProvider';
import { deviceTimeZone, minutesToTime, timeToMinutes } from '../../utils/format';
import { FieldHeading, StepLayout } from './StepLayout';

const WEEKDAYS = [
  { day: 1, label: 'Mon' },
  { day: 2, label: 'Tue' },
  { day: 3, label: 'Wed' },
  { day: 4, label: 'Thu' },
  { day: 5, label: 'Fri' },
  { day: 6, label: 'Sat' },
];

export function SchoolDayStep() {
  const { colors } = useTheme();
  const draft = useOnboardingStore((state) => state.draft);
  const update = useOnboardingStore((state) => state.update);
  const toggleTuition = useOnboardingStore((state) => state.toggleTuition);
  const resetDraft = useOnboardingStore((state) => state.reset);
  const setOnboarded = useAuthStore((state) => state.setOnboarded);
  const [error, setError] = useState(null);

  const shift = (field, delta) => update({ [field]: minutesToTime(timeToMinutes(draft[field]) + delta) });

  const build = useAsyncAction(async () => {
    if (timeToMinutes(draft.schoolEnd) <= timeToMinutes(draft.schoolStart)) {
      setError('School has to end after it starts.');
      return;
    }
    setError(null);
    try {
      const result = await profileApi.onboard({
        cls: draft.cls,
        subjects: draft.subjects,
        taughtChapterKeys: Object.keys(draft.taught).filter((key) => draft.taught[key] && draft.subjects.some((subject) => key.startsWith(`${subject}-`))),
        exams: draft.exams.filter((exam) => draft.subjects.includes(exam.subject)).map(({ id: _id, ...exam }) => exam),
        schoolStart: draft.schoolStart,
        schoolEnd: draft.schoolEnd,
        tuitionDays: draft.tuitionDays,
        dailyLimitMins: draft.dailyLimitMins,
        timezone: deviceTimeZone(),
      });
      resetDraft();
      setOnboarded(true);
      toast(result.suggested ? `Plan ready. ${result.suggested} study blocks suggested before your tests.` : 'Plan ready. Tap "Schedule from syllabus" in Plan to add your first chapter.');
    } catch (caught) {
      setError(caught.message);
    }
  });

  return (
    <StepLayout
      step={5}
      title="Your school day"
      lead="The planner only uses time after school, tuition and dinner."
      footer={<Button title="Build my plan" icon="spark" variant="primary" block onPress={build.execute} loading={build.pending} testID="build-plan" />}
    >
      <Card flush>
        <Stepper label="School starts" valueLabel={draft.schoolStart} onDecrement={() => shift('schoolStart', -15)} onIncrement={() => shift('schoolStart', 15)} />
        <Divider />
        <Stepper label="School ends" valueLabel={draft.schoolEnd} onDecrement={() => shift('schoolEnd', -15)} onIncrement={() => shift('schoolEnd', 15)} />
      </Card>
      <FieldHeading>Tuition days, 16:00 to 17:30</FieldHeading>
      <ChipGroup label="Tuition days">
        {WEEKDAYS.map(({ day, label }) => (
          <Chip key={day} label={label} selected={draft.tuitionDays.includes(day)} onPress={() => toggleTuition(day)} />
        ))}
      </ChipGroup>
      <FieldHeading>Most study time on a school day</FieldHeading>
      <SegmentedControl
        label="Daily study limit"
        value={draft.dailyLimitMins}
        onChange={(value) => update({ dailyLimitMins: value })}
        options={[120, 180, 240].map((minutes) => ({ value: minutes, label: `${minutes / 60} hours` }))}
      />
      <Muted small>The planner warns you when a day goes over this. Sundays get 90 minutes more.</Muted>
      {error ? (
        <Text style={{ color: colors.danger }} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
    </StepLayout>
  );
}
