import { Platform } from 'react-native';
import { backupApi, chaptersApi, examsApi, habitsApi, homeworkApi, profileApi, suggestionsApi, tasksApi } from '../data/api';
import { localToday } from '../data/queries';
import { useAuthStore } from '../store/authStore';
import { useResourceStore } from '../store/resourceStore';
import { setKnownSubjects } from '../store/subjectStore';
import { toast } from '../store/toastStore';
import { capitalize, dayName, duration, shortDate } from '../utils/format';
import { chapterStatus } from '../theme/tokens';
import { confirmAction } from '../utils/confirm';
import { backupFileName, pickBackupFile, saveBackupFile } from './backupFile';
import { shareText } from './share';

/**
 * Every change the app can make to the planner on this phone. Each action saves the change,
 * refreshes whatever is on screen, and tells the student what happened. Returns the result,
 * or null on failure.
 */
async function run(call, { success, invalidate = ['*'] } = {}) {
  try {
    const result = await call();
    useResourceStore.getState().invalidate(invalidate);
    const message = typeof success === 'function' ? success(result) : success;
    if (message) toast(message);
    return result ?? true;
  } catch (error) {
    toast(error.message || 'Something went wrong.', 'error');
    return null;
  }
}

export const taskActions = {
  toggleDone: (task) =>
    run(() => tasksApi.update(task.id, { done: !task.done }), {
      success: (result) => (result.task.done ? `Done. ${duration(task.mins)} added to today.` : 'Marked as not done.'),
    }),
  moveTo: (task, date, today) =>
    run(() => tasksApi.update(task.id, { date }), { success: `Moved to ${dayName(date, today)}.` }),
  accept: (task) => run(() => tasksApi.accept(task.id), { success: 'Added to your plan.' }),
  skip: (task) => run(() => tasksApi.skip(task.id), { success: 'Skipped.' }),
  edit: (task, changes, today) =>
    run(() => tasksApi.update(task.id, changes), {
      success: (result) => (result.task.date !== task.date ? `Saved and moved to ${dayName(result.task.date, today)}.` : 'Task saved.'),
    }),
  keep: (task) => run(() => tasksApi.accept(task.id), { success: 'Kept in your plan.' }),
  remove: (task) => run(() => tasksApi.skip(task.id), { success: 'Removed from your plan.' }),
  swap: (task, today) => run(() => tasksApi.swap(task.id), { success: (updated) => `Swapped to ${dayName(updated.date, today)} and added.` }),
  moveToBestDay: (task, today) => run(() => tasksApi.move(task.id), { success: (updated) => `Moved to ${dayName(updated.date, today)}.` }),
};

export const suggestionActions = {
  accept: (item, today) =>
    run(() => suggestionsApi.accept(item.id), {
      success: item.kind === 'move' ? `Moved to ${dayName(item.date, today)}.` : `Added to ${dayName(item.date, today)}.`,
    }),
  later: (item) => run(() => suggestionsApi.later(item.id), { success: 'Saved for later. Find it in Profile.' }),
  skip: (item) => run(() => suggestionsApi.skip(item.id), { success: 'Skipped. Your plan stays as it is.' }),
  swap: (item, today) => run(() => suggestionsApi.swap(item.id), { success: (updated) => `Swapped to ${dayName(updated.date, today)}.` }),
};

export const chapterActions = {
  setStatus: (chapter, status) =>
    run(() => chaptersApi.setStatus(chapter.key, status), { success: `${chapter.name}: ${chapterStatus[status].label}` }),
  schedule: (chapterKey, steps, today) =>
    run(() => chaptersApi.schedule(chapterKey, steps), {
      success: (tasks) => {
        const days = [...new Set(tasks.map((task) => task.date))].sort().map((date) => dayName(date, today));
        return `${tasks.length} step${tasks.length > 1 ? 's' : ''} added: ${days.join(', ')}.`;
      },
    }),
  addRevision: (chapter) => run(() => chaptersApi.addRevision(chapter.key), { success: '15 min revision added to today.' }),
  snooze: (chapter) => run(() => chaptersApi.snooze(chapter.key), { success: 'We’ll remind you tomorrow.' }),
};

const slotsPlanned = (count) => (count ? ` ${count} study slot${count > 1 ? 's' : ''} planned before it.` : '');
/** Steps that did not fit are never squeezed in; the student hears about them and what to do. */
const notPlanned = (count) =>
  count ? ` ${count} step${count > 1 ? 's' : ''} didn’t fit in the free time before it: add a study session, stop studying later, or tick fewer chapters.` : '';

export const examActions = {
  update: (id, changes) => run(() => examsApi.update(id, changes), { success: (exam) => `${exam.name} saved.` }),
  setResult: (exam, result) =>
    run(() => examsApi.setResult(exam.id, result), { success: result ? `Marks saved for ${exam.name}.` : `Marks removed from ${exam.name}.` }),
  async remove(exam) {
    const confirmed = await confirmAction({
      title: `Remove ${exam.name}?`,
      message: 'The test is removed from your plan. Study blocks you already added stay.',
      confirmLabel: 'Remove',
    });
    if (!confirmed) return null;
    return run(() => examsApi.remove(exam.id), { success: `${exam.name} removed.` });
  },
  /** Adds every paper of one exam (UT 1, Half-yearly…) to the datesheet. */
  createDatesheet: (body) =>
    run(() => examsApi.createDatesheet(body), {
      success: (result) =>
        `${body.series}: ${result.exams.length} paper${result.exams.length === 1 ? '' : 's'} on your datesheet.${slotsPlanned(result.planned.added)}${notPlanned(result.planned.unplaced)}`,
    }),
  /** Removes a whole exam (every paper of one datesheet group). */
  async removeGroup(group) {
    const confirmed = await confirmAction({
      title: `Remove ${group.title}?`,
      message: `All ${group.exams.length} paper${group.exams.length === 1 ? '' : 's'} are removed from your datesheet. Study blocks you already added stay.`,
      confirmLabel: 'Remove',
    });
    if (!confirmed) return null;
    return run(() => Promise.all(group.exams.map((exam) => examsApi.remove(exam.id))), { success: `${group.title} removed.` });
  },
};

export const homeworkActions = {
  create: (body, today) =>
    run(() => homeworkApi.create(body), {
      success: (result) =>
        result.tasks.length > 1
          ? `Added. Split into ${result.tasks.length} parts, from ${dayName(result.tasks[0].date, today)} to ${dayName(result.tasks.at(-1).date, today)}.`
          : `Added. A ${duration(result.task.mins)} task is in your plan for ${dayName(result.task.date, today)}.`,
    }),
  toggleDone: (item) =>
    run(() => homeworkApi.setDone(item.id, !item.done), { success: item.done ? 'Moved back to pending.' : 'Homework marked done.' }),
  async remove(item) {
    const confirmed = await confirmAction({
      title: 'Delete this homework?',
      message: `“${item.title}” and its unfinished study tasks will be deleted. Time you already studied stays in your history.`,
    });
    if (!confirmed) return null;
    return run(() => homeworkApi.remove(item.id), { success: 'Homework deleted.' });
  },
};

export const habitActions = {
  takeRestDay: () => run(habitsApi.takeRestDay, { success: 'Rest day logged. Your streak is safe.' }),
  saveCheckin: (body) => run(() => habitsApi.saveCheckin(body), { success: 'Check-in saved. Only you can see it.', invalidate: ['habits'] }),
  addHabit: (body) => run(() => habitsApi.addHabit(body), { success: (habit) => `${habit.name} added to your routine.`, invalidate: ['habits'] }),
  updateHabit: (id, changes) => run(() => habitsApi.updateHabit(id, changes), { success: (habit) => `${habit.name} saved.`, invalidate: ['habits'] }),
  moveHabit: (id, direction) => run(() => habitsApi.moveHabit(id, direction), { invalidate: ['habits'] }),
  setHabitDone: (id, done) => run(() => habitsApi.setHabitDone(id, done), { invalidate: ['habits', 'planDay', 'today'] }),
  /** Plans a rest day on the calendar, or takes it back. */
  setRestDay: (date, rest, today) =>
    run(() => habitsApi.setRestDay(date, rest), {
      success: rest ? `${capitalize(dayName(date, today))} is a rest day: only night revision.` : `${capitalize(dayName(date, today))} is a study day again.`,
    }),
  async removeHabit(habit) {
    const confirmed = await confirmAction({
      title: `Remove ${habit.name}?`,
      message: 'It leaves your routine. Days you already ticked stay in your history.',
      confirmLabel: 'Remove',
    });
    if (!confirmed) return null;
    return run(() => habitsApi.removeHabit(habit.id), { success: `${habit.name} removed from your routine.`, invalidate: ['habits'] });
  },
  setBagItem: (date, itemId, checked) => run(() => habitsApi.setBagItem(date, itemId, checked), { invalidate: ['bag'] }),
};

export const profileActions = {
  update: (patch, message) => run(() => profileApi.update(patch), { success: message }),
  /** Adds a holiday or break: no school on those days, so they plan like a Sunday. */
  addHoliday: (body) =>
    run(() => profileApi.addHoliday(body), {
      success: (holiday) => `${holiday.name} added. No school ${holiday.from === holiday.to ? `on ${shortDate(holiday.from)}` : `from ${shortDate(holiday.from)} to ${shortDate(holiday.to)}`}.`,
    }),
  /** Changes school (or one day's tuition) timings for a day, week, month, every such weekday, or always. */
  changeTimings: (body, message) => run(() => profileApi.changeTimings(body), { success: message }),
  async removeTimingChange(change) {
    const confirmed = await confirmAction({ title: 'Remove this change?', message: 'Those days follow your normal timetable again.', confirmLabel: 'Remove' });
    if (!confirmed) return null;
    return run(() => profileApi.removeTimingChange(change.id), { success: 'Back to the normal timetable for those days.' });
  },
  /** Moves, resizes or removes a slot or routine block, for one day or every day. */
  editSlot: (body, message) => run(() => profileApi.editSlot(body), { success: message }),
  resetSlot: (body, message) => run(() => profileApi.resetSlot(body), { success: message }),
  resetSchoolDay: (day, name) => run(() => profileApi.resetSchoolDay(day), { success: `${name} uses your normal school times again.` }),
  async removeHoliday(holiday) {
    const confirmed = await confirmAction({ title: `Remove ${holiday.name}?`, message: 'Those days have school again, and your plan follows.', confirmLabel: 'Remove' });
    if (!confirmed) return null;
    return run(() => profileApi.removeHoliday(holiday.id), { success: `${holiday.name} removed.` });
  },
  async addSubject(body) {
    const result = await run(() => profileApi.addSubject(body), {
      success: (subject) => `${subject.name} added with ${subject.chapters} chapter${subject.chapters > 1 ? 's' : ''}.`,
    });
    // Every screen needs the new subject's name and colour.
    if (result) setKnownSubjects((await profileApi.get()).subjectInfo);
    return result;
  },
  /** `name` is what the student typed at setup; defaults to their Google account name. */
  async loadDemo(name = useAuthStore.getState().user?.name) {
    const result = await run(() => profileApi.loadDemo(name), { success: 'Demo student loaded: Class 9 CBSE.' });
    if (result) useAuthStore.getState().plannerChanged();
    return result;
  },
  async startOver() {
    const result = await run(profileApi.wipe, { success: 'Everything was cleared. Let’s set up again.' });
    if (result) useAuthStore.getState().plannerChanged();
    return result;
  },
};

export const shareActions = {
  /** Shares a message from this phone. `success` is shown only if it was actually sent. */
  send: (message, success) => run(() => shareText(message), { success: (sent) => (sent ? success : null), invalidate: [] }),
};

export const backupActions = {
  /** Hands the student a file with everything on this phone, to keep or move to a new phone. */
  async save() {
    return run(
      async () => {
        await saveBackupFile(await backupApi.export(), backupFileName(localToday().today));
        return true;
      },
      { success: Platform.OS === 'web' ? 'Backup downloaded.' : null, invalidate: [] },
    );
  },
  /** Replaces the plan on this phone with a backup file the student picks. */
  async restore() {
    let summary;
    let text;
    try {
      text = await pickBackupFile();
      if (text === null) return null;
      summary = await backupApi.parse(text);
    } catch (error) {
      toast(error.message || 'That file couldn’t be opened.', 'error');
      return null;
    }
    const confirmed = await confirmAction({
      title: 'Restore this backup?',
      message: `${summary.name ? `${summary.name}’s plan` : 'The plan in this backup'} replaces everything on this phone. This can’t be undone.`,
      confirmLabel: 'Restore',
    });
    if (!confirmed) return null;
    const result = await run(() => backupApi.restore(text), { success: 'Backup restored.' });
    if (result) useAuthStore.getState().plannerChanged();
    return result;
  },
};

