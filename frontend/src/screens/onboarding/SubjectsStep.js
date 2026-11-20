import { Button } from '../../components/ui/Button';
import { ToggleRow } from '../../components/ui/Controls';
import { Card, Divider } from '../../components/ui/Layout';
import { AsyncBoundary } from '../../components/ui/States';
import { useResource } from '../../hooks/useResource';
import { resources } from '../../services/resources';
import { useOnboardingStore } from '../../store/onboardingStore';
import { StepLayout } from './StepLayout';

export function SubjectsStep({ navigation }) {
  const draft = useOnboardingStore((state) => state.draft);
  const toggleSubject = useOnboardingStore((state) => state.toggleSubject);
  const syllabus = useResource(resources.syllabus(draft.cls ?? 9), { enabled: Boolean(draft.cls) });
  const total = (syllabus.data ?? []).filter((subject) => draft.subjects.includes(subject.id)).reduce((sum, subject) => sum + subject.chapters.length, 0);

  return (
    <StepLayout
      step={2}
      title="Your subjects"
      lead={`${total} chapters loaded for Class ${draft.cls}. Turn off any subject you don’t take.`}
      footer={<Button title="Continue" variant="primary" block disabled={!draft.subjects.length} onPress={() => navigation.navigate('TaughtStep')} testID="subjects-continue" />}
    >
      <AsyncBoundary resource={syllabus}>
        {(subjects) => (
          <Card flush>
            {subjects.map((subject, index) => (
              <SubjectToggle key={subject.id} subject={subject} first={index === 0} on={draft.subjects.includes(subject.id)} onToggle={toggleSubject} />
            ))}
          </Card>
        )}
      </AsyncBoundary>
    </StepLayout>
  );
}

function SubjectToggle({ subject, first, on, onToggle }) {
  return (
    <>
      {first ? null : <Divider />}
      <ToggleRow label={subject.name} hint={`${subject.chapters.length} chapters`} color={subject.color} value={on} onValueChange={() => onToggle(subject.id)} />
    </>
  );
}
