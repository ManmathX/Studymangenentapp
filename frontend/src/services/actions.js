import { useAuthStore } from '../store/authStore';
import { useResourceStore } from '../store/resourceStore';
import { toast } from '../store/toastStore';
import { dayName, duration } from '../utils/format';
import { chaptersApi, examsApi, habitsApi, homeworkApi, planApi, profileApi, suggestionsApi, tasksApi } from './api/endpoints';
import { chapterStatus } from '../theme/tokens';
import { confirmAction } from '../utils/confirm';

/**
 * Every change the app can make. Each action calls the API, refreshes whatever is
 * on screen, and tells the student what happened. Returns the result, or null on failure.
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
  swap: (task, today) => run(() => tasksApi.swap(task.id), { success: (updated) => `Swapped to ${dayName(updated.date, today)} and added.` }),
  moveToBestDay: (task, today) => run(() => tasksApi.move(task.id), { success: (updated) => `Moved to ${dayName(updated.date, today)}.` }),
};

export const suggestionActions = {
  accept: (item, today) =>
    run(() => suggestionsApi.accept(item.id), {
      success: item.kind === 'move' ? `Moved to ${dayName(item.date, today)}.` : `Added to ${dayName(item.date, today)}.`,
    }),
  later: (item) => run(() => suggestionsApi.later(item.id), { success: 'Saved for later. Find it in Settings.' }),
  skip: (item) => run(() => suggestionsApi.skip(item.id), { success: 'Skipped. Your plan stays as it is.' }),
  swap: (item, today) => run(() => suggestionsApi.swap(item.id), { success: (updated) => `Swapped to ${dayName(updated.date, today)}.` }),
};

export const planActions = {
  autoSchedule: () =>
    run(planApi.autoSchedule, {
      success: (result) =>
        result.added
          ? `${result.added} study block${result.added > 1 ? 's' : ''} suggested. Accept the ones you want.`
          : 'Every chapter before your tests already has a slot.',
    }),
  acceptAll: () => run(planApi.acceptAll, { success: (result) => `${result.accepted} blocks added to your plan.` }),
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

export const examActions = {
  create: (body) => run(() => examsApi.create(body), { success: `${body.name} added.` }),
  update: (id, changes) => run(() => examsApi.update(id, changes), { success: (exam) => `${exam.name} saved.` }),
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
      success: (papers) => `${body.series}: ${papers.length} paper${papers.length === 1 ? '' : 's'} on your datesheet. Tap "Fill free slots before exams" to plan revision.`,
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
      success: (result) => `Added. A ${duration(result.task.mins)} task is in your plan for ${dayName(result.task.date, today)}.`,
    }),
  toggleDone: (item) =>
    run(() => homeworkApi.setDone(item.id, !item.done), { success: item.done ? 'Moved back to pending.' : 'Homework marked done.' }),
  async remove(item) {
    const confirmed = await confirmAction({
      title: 'Delete this homework?',
      message: `“${item.title}” and its unfinished study task will be deleted. Time you already studied stays in your history.`,
    });
    if (!confirmed) return null;
    return run(() => homeworkApi.remove(item.id), { success: 'Homework deleted.' });
  },
};

export const habitActions = {
  takeRestDay: () => run(habitsApi.takeRestDay, { success: 'Rest day logged. Your streak is safe.' }),
  saveCheckin: (body) => run(() => habitsApi.saveCheckin(body), { success: 'Check-in saved. Only you can see it.', invalidate: ['habits'] }),
  saveRoutines: (body) => run(() => habitsApi.saveRoutines(body), { invalidate: ['habits'] }),
  setBagItem: (date, itemId, checked) => run(() => habitsApi.setBagItem(date, itemId, checked), { invalidate: ['bag'] }),
};

export const profileActions = {
  update: (patch, message) => run(() => profileApi.update(patch), { success: message }),
  async loadDemo(timezone) {
    const result = await run(() => profileApi.loadDemo(timezone), { success: 'Demo student loaded: Class 9 CBSE.' });
    if (result) useAuthStore.getState().setOnboarded(true);
    return result;
  },
  async startOver() {
    const result = await run(profileApi.wipe, { success: 'Everything was cleared. Let’s set up again.' });
    if (result) useAuthStore.getState().setOnboarded(false);
    return result;
  },
};

