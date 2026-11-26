import { useMemo } from 'react';
import { useResource } from '../../hooks/useResource';
import { resources } from '../../services/resources';
import { chosenSubjects, draftCatalog, examChosen, useOnboardingStore } from '../../store/onboardingStore';

/**
 * The chosen exam's syllabus (at the chosen level) plus the subjects the student added.
 * `all` is every subject (for the Subjects step), `chosen` only the ones switched on.
 */
export function useDraftSubjects() {
  const draft = useOnboardingStore((state) => state.draft);
  const syllabus = useResource(resources.examSyllabus(draft.board ?? '', draft.level?.key), { enabled: examChosen(draft) });
  const subjects = syllabus.data?.subjects;
  const all = useMemo(() => draftCatalog(draft, subjects), [draft, subjects]);
  const chosen = useMemo(() => chosenSubjects(draft, subjects), [draft, subjects]);
  return { draft, syllabus, all, chosen };
}
