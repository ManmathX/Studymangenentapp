/**
 * Which reminders a student gets. Each kind can be switched off in Profile; the choices are
 * saved with the plan on this phone (and in backups). Students start with the reminders tied
 * to their own plan; the morning plan and weekly review are extras they can turn on.
 */
export const REMINDER_KINDS = ['slots', 'tests', 'focus', 'bag', 'streak', 'morning', 'weekly'];

/** Minutes before a study slot that its reminder arrives. */
export const REMINDER_LEAD_OPTIONS = [0, 5, 10, 15];

export const DEFAULT_REMINDERS = {
  slots: true,
  tests: true,
  focus: true,
  bag: true,
  streak: true,
  morning: false,
  weekly: false,
  leadMins: 5,
};

/** The student's reminder choices, with the defaults filled in. */
export function remindersOf(profile) {
  const saved = profile?.reminders ?? {};
  const choices = { ...DEFAULT_REMINDERS };
  for (const kind of REMINDER_KINDS) if (typeof saved[kind] === 'boolean') choices[kind] = saved[kind];
  if (REMINDER_LEAD_OPTIONS.includes(saved.leadMins)) choices.leadMins = saved.leadMins;
  return choices;
}
