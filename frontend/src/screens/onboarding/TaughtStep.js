import { useState } from 'react';
import { Button } from '../../components/ui/Button';
import { CheckRow, Chip, ChipGroup } from '../../components/ui/Controls';
import { Card, Divider, Muted } from '../../components/ui/Layout';
import { AsyncBoundary } from '../../components/ui/States';
import { useResource } from '../../hooks/useResource';
import { resources } from '../../services/resources';
import { useOnboardingStore } from '../../store/onboardingStore';
import { subjects as subjectInfo } from '../../theme/tokens';
import { StepLayout } from './StepLayout';

export function TaughtStep({ navigation }) {
  const draft = useOnboardingStore((state) => state.draft);
  const toggleTaught = useOnboardingStore((state) => state.toggleTaught);
  const syllabus = useResource(resources.syllabus(draft.cls ?? 9), { enabled: Boolean(draft.cls) });
  const [subject, setSubject] = useState(draft.subjects[0]);

  return (
    <StepLayout
      step={3}
      title="What’s been taught?"
      lead="Tick the chapters your school has already covered. You can change this later."
      footer={<Button title="Continue" variant="primary" block onPress={() => navigation.navigate('TestsStep')} testID="taught-continue" />}
    >
      <AsyncBoundary resource={syllabus}>
        {(catalog) => {
          const visible = catalog.filter((item) => draft.subjects.includes(item.id));
          const current = visible.find((item) => item.id === subject) ?? visible[0];
          const countFor = (item) => item.chapters.filter((chapter) => draft.taught[chapter.key]).length;
          return (
            <>
              <ChipGroup label="Subject">
                {visible.map((item) => (
                  <Chip key={item.id} label={`${subjectInfo[item.id].name}${countFor(item) ? ` ${countFor(item)}` : ''}`} color={item.color} selected={item.id === current?.id} onPress={() => setSubject(item.id)} />
                ))}
              </ChipGroup>
              <Card flush>
                {current?.chapters.map((chapter, index) => (
                  <ChapterCheck key={chapter.key} first={index === 0} chapter={chapter} checked={Boolean(draft.taught[chapter.key])} onToggle={toggleTaught} />
                ))}
              </Card>
              <Muted small>Ticked chapters start as Learning. Mark them Revised or Mastered from Progress.</Muted>
            </>
          );
        }}
      </AsyncBoundary>
    </StepLayout>
  );
}

function ChapterCheck({ chapter, checked, first, onToggle }) {
  return (
    <>
      {first ? null : <Divider />}
      <CheckRow label={chapter.name} checked={checked} onToggle={() => onToggle(chapter.key)} />
    </>
  );
}
