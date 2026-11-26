import { useState } from 'react';
import { Button } from '../../components/ui/Button';
import { ChapterSeparator } from '../../components/domain/SyllabusBits';
import { CheckRow, Chip, ChipGroup } from '../../components/ui/Controls';
import { Card, Muted } from '../../components/ui/Layout';
import { AsyncBoundary } from '../../components/ui/States';
import { useOnboardingStore } from '../../store/onboardingStore';
import { StepLayout } from './StepLayout';
import { useDraftSubjects } from './useDraftSubjects';

export function TaughtStep({ navigation }) {
  const { draft, syllabus, chosen } = useDraftSubjects();
  const toggleTaught = useOnboardingStore((state) => state.toggleTaught);
  const [subject, setSubject] = useState(null);
  const current = chosen.find((item) => item.id === subject) ?? chosen[0];
  const countFor = (item) => item.chapters.filter((chapter) => draft.taught[chapter.key]).length;

  return (
    <StepLayout
      step={3}
      title="What have you covered?"
      lead="Tick the chapters already taught at school or coaching, or that you’ve studied. You can change this later."
      footer={<Button title="Continue" variant="primary" block onPress={() => navigation.navigate('TestsStep')} testID="taught-continue" />}
    >
      <AsyncBoundary resource={syllabus}>
        {() => (
          <>
            <ChipGroup label="Subject">
              {chosen.map((item) => (
                <Chip key={item.id} label={`${item.name}${countFor(item) ? ` ${countFor(item)}` : ''}`} color={item.color} selected={item.id === current?.id} onPress={() => setSubject(item.id)} />
              ))}
            </ChipGroup>
            <Card flush>
              {current?.chapters.map((chapter, index) => (
                <ChapterCheck key={chapter.key} index={index} previous={current.chapters[index - 1]} chapter={chapter} checked={Boolean(draft.taught[chapter.key])} onToggle={toggleTaught} />
              ))}
            </Card>
            <Muted small>Ticked chapters start as Studied. Mark them Practiced, Revised or Mastered from Progress.</Muted>
          </>
        )}
      </AsyncBoundary>
    </StepLayout>
  );
}

function ChapterCheck({ chapter, checked, index, previous, onToggle }) {
  return (
    <>
      <ChapterSeparator chapter={chapter} previous={previous} index={index} />
      <CheckRow label={chapter.name} checked={checked} onToggle={() => onToggle(chapter.key)} />
    </>
  );
}
