import { useCallback } from 'react';
import { create } from 'zustand';
import { subjects as BUILT_IN } from '../theme/tokens';

const FALLBACK = { name: 'Subject', color: '#8E8E93' };

/**
 * Names and colours of the student's subjects. Boards and classes have their own subjects
 * (set by admins), and students can add their own during setup, so these come from the
 * profile rather than a fixed list. The five CBSE subjects stay as a fallback.
 */
export const useSubjectStore = create(() => ({ known: {} }));

/** Call with `profile.subjectInfo` whenever a profile arrives. */
export function setKnownSubjects(list = []) {
  useSubjectStore.setState({ known: Object.fromEntries(list.map((subject) => [subject.id, { name: subject.name, color: subject.color }])) });
}

/** `{ name, color }` for a subject id. Outside React, e.g. in stores and toasts. */
export function subjectInfo(id, known = useSubjectStore.getState().known) {
  return known[id] ?? BUILT_IN[id] ?? FALLBACK;
}

/** Same lookup for components; re-renders when the student's subjects arrive. */
export function useSubjectInfo() {
  const known = useSubjectStore((state) => state.known);
  return useCallback((id) => subjectInfo(id, known), [known]);
}
