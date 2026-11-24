import { useMemo } from 'react';
import { useResource } from '../../hooks/useResource';
import { resources } from '../../services/resources';
import { chosenSubjects, draftCatalog, useOnboardingStore } from '../../store/onboardingStore';

/**
 * The class's syllabus from the chosen board plus the subjects the student added.
 * `all` is every subject (for the Subjects step), `chosen` only the ones switched on.
 */
export function useDraftSubjects() {
  const draft = useOnboardingStore((state) => state.draft);
  const syllabus = useResource(resources.syllabus(draft.board, draft.cls ?? 0), { enabled: Boolean(draft.cls) });
  const all = useMemo(() => draftCatalog(draft, syllabus.data), [draft, syllabus.data]);
  const chosen = useMemo(() => chosenSubjects(draft, syllabus.data), [draft, syllabus.data]);
  return { draft, syllabus, all, chosen };
}
