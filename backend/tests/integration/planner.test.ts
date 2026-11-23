import { describe, expect, it } from 'vitest';
import { as, NOW, onboardedStudent, TODAY, useTestApp } from '../helpers/app.js';

const ctx = useTestApp('planner');

interface Task {
  id: string;
  date: string;
  status: string;
  done: boolean;
  title: string;
  homeworkId: string | null;
  chapterKey: string | null;
}

async function student() {
  const session = await onboardedStudent(ctx.app);
  const user = as(ctx.app, session.accessToken);
  const tasks = async (query = `from=${TODAY}`): Promise<Task[]> =>
    (await user.get(`/tasks?${query}&limit=100`).expect(200)).body.data as Task[];
  return { session, user, tasks };
}

const days = (count: number) => new Date(NOW.getTime() + count * 86_400_000);

describe('today and plan', () => {
  it('shows the day, the next test and suggested blocks waiting for review', async () => {
    const { user } = await student();
    const today = await user.get('/dashboard/today').expect(200);
    expect(today.body.data).toMatchObject({
      today: TODAY,
      nextExam: { name: 'Periodic test 2', daysLeft: 10 },
      suggestedBlocks: { count: 3, firstDate: TODAY },
      limitMins: 150, // Wednesday is a tuition day: 180 - 30
      tasks: [],
      streak: 0,
    });
  });

  it('builds a day strip and a timed day around school and tuition', async () => {
    const { user } = await student();
    const strip = await user.get('/plan/days').expect(200);
    expect(strip.body.data).toHaveLength(14);
    expect(strip.body.data[0]).toMatchObject({ date: TODAY, limitMins: 150, hasSuggested: true });
    expect(strip.body.data.find((day: { date: string }) => day.date === '2026-11-28').hasExam).toBe(
      true,
    );

    const day = await user.get(`/plan/days/${TODAY}`).expect(200);
    const kinds = day.body.data.rows.map(
      (row: { type: string; kind?: string }) => row.kind ?? row.type,
    );
    expect(kinds).toEqual(expect.arrayContaining(['school', 'tuition', 'rest', 'task']));
    expect(day.body.data).toMatchObject({ tuitionDay: true, suggestedCount: 3 });

    await user.get('/plan/days/2027-06-01').expect(400);
    await user.get('/plan/days/2026-02-30').expect(400);
  });

  it('accepts every suggestion at once and does not suggest twice', async () => {
    const { user, tasks } = await student();
    const accepted = await user.post('/plan/accept-all').expect(200);
    expect(accepted.body.data).toEqual({ accepted: 3 });
    expect((await tasks()).every((task) => task.status === 'accepted')).toBe(true);

    const again = await user.post('/plan/auto-schedule').expect(200);
    expect(again.body.data.added).toBe(0);
    const today = await user.get('/dashboard/today').expect(200);
    expect(today.body.data.tasks).toHaveLength(3);
    expect(today.body.data.plannedMins).toBeGreaterThan(0);
  });
});

describe('tasks', () => {
  it('marks done, moves, skips, accepts and swaps', async () => {
    const { user, tasks } = await student();
    const [first, second, third] = await tasks();

    const done = await user.patch(`/tasks/${first!.id}`, { done: true }).expect(200);
    expect(done.body.data.task.done).toBe(true);
    const progress = await user.get('/dashboard/progress').expect(200);
    expect(progress.body.data.weekMins).toBeGreaterThan(0);

    const moved = await user.patch(`/tasks/${second!.id}`, { date: '2026-11-21' }).expect(200);
    expect(moved.body.data.task.date).toBe('2026-11-21');
    const past = await user.patch(`/tasks/${second!.id}`, { date: '2026-11-17' }).expect(400);
    expect(past.body.error.code).toBe('DATE_IN_PAST');
    await user.patch(`/tasks/${second!.id}`, {}).expect(400);

    expect((await user.post(`/tasks/${third!.id}/skip`).expect(200)).body.data.status).toBe(
      'skipped',
    );
    expect((await user.post(`/tasks/${third!.id}/accept`).expect(200)).body.data.status).toBe(
      'accepted',
    );
    const swapped = await user.post(`/tasks/${third!.id}/swap`).expect(200);
    expect(swapped.body.data.date).not.toBe(third!.date);
    const best = await user.post(`/tasks/${second!.id}/move`).expect(200);
    expect(best.body.data.date >= TODAY).toBe(true);
  });

  it('paginates and filters the task list', async () => {
    const { user } = await student();
    const page = await user.get(`/tasks?from=${TODAY}&limit=2&status=suggested`).expect(200);
    expect(page.body.data).toHaveLength(2);
    expect(page.body.meta).toEqual({ page: 1, limit: 2, total: 3, hasNext: true });
    await user.get('/tasks?limit=1000').expect(400);
  });

  it('turns slipped tasks into "move it" suggestions that can be accepted, saved or skipped', async () => {
    const { user, tasks } = await student();
    await user.post('/plan/accept-all').expect(200);
    ctx.clock.set(days(2));

    const today = await user.get('/dashboard/today').expect(200);
    const moves = today.body.data.suggestions.filter(
      (item: { kind: string }) => item.kind === 'move',
    );
    expect(moves).toHaveLength(3);
    // Generating them again must not duplicate them.
    await user.get('/dashboard/today').expect(200);
    expect((await user.get('/suggestions').expect(200)).body.data).toHaveLength(3);

    const [acceptMe, laterMe, skipMe] = moves as { id: string; taskId: string; date: string }[];
    await user.post(`/suggestions/${acceptMe!.id}/accept`).expect(200);
    const movedTask = (await tasks('from=2026-11-01')).find((task) => task.id === acceptMe!.taskId);
    expect(movedTask!.date).toBe(acceptMe!.date);
    const closed = await user.post(`/suggestions/${acceptMe!.id}/accept`).expect(409);
    expect(closed.body.error.code).toBe('SUGGESTION_CLOSED');

    expect((await user.post(`/suggestions/${laterMe!.id}/later`).expect(200)).body.data.state).toBe(
      'later',
    );
    const sharing = await user.get('/dashboard/sharing').expect(200);
    expect(sharing.body.data.later).toHaveLength(1);
    expect((await user.post(`/suggestions/${laterMe!.id}/swap`).expect(200)).body.data.state).toBe(
      'accepted',
    );

    await user.post(`/suggestions/${skipMe!.id}/skip`).expect(200);
    const skippedTask = (await tasks('from=2026-11-01')).find((task) => task.id === skipMe!.taskId);
    expect(skippedTask!.status).toBe('skipped');
  });
});

describe('chapters', () => {
  it('proposes and schedules study steps before the test', async () => {
    const { user, tasks } = await student();
    const proposal = await user.get('/chapters/maths-3/schedule-proposal').expect(200);
    expect(proposal.body.data.exam).toMatchObject({ name: 'Periodic test 2' });
    const steps = proposal.body.data.steps as { index: number; proposedDate: string }[];
    expect(steps).toHaveLength(4);
    for (const step of steps) expect(step.proposedDate < '2026-11-28').toBe(true);

    const scheduled = await user
      .post('/chapters/maths-3/schedule', {
        steps: steps.map((step) => ({ index: step.index, date: step.proposedDate })),
      })
      .expect(201);
    expect(scheduled.body.data).toHaveLength(4);
    expect(
      (await tasks()).filter((task) => task.chapterKey === 'maths-3' && task.status === 'accepted'),
    ).toHaveLength(4);

    const duplicate = await user
      .post('/chapters/maths-3/schedule', {
        steps: [
          { index: 0, date: TODAY },
          { index: 0, date: TODAY },
        ],
      })
      .expect(400);
    expect(duplicate.body.error.code).toBe('INVALID_STEP');
    const far = await user
      .post('/chapters/maths-3/schedule', { steps: [{ index: 0, date: '2027-01-01' }] })
      .expect(400);
    expect(far.body.error.code).toBe('DATE_OUT_OF_RANGE');
    await user.get('/chapters/maths-99/schedule-proposal').expect(404);
  });

  it('updates status, adds spaced revisions and snoozes nudges', async () => {
    const { user } = await student();
    const status = await user.patch('/chapters/maths-5', { status: 'learning' }).expect(200);
    expect(status.body.data).toMatchObject({ status: 'learning', learnedOn: TODAY, revisions: 0 });
    await user.patch('/chapters/maths-5', { status: 'finished' }).expect(400);

    const revision = await user.post('/chapters/maths-5/revisions').expect(201);
    expect(revision.body.data.task).toMatchObject({ kind: 'revision', mins: 15, date: TODAY });
    expect(revision.body.data.chapter.revisions).toBe(1);
    const notDue = await user.post('/chapters/maths-6/revisions').expect(409);
    expect(notDue.body.error.code).toBe('NO_REVISION_DUE');

    const snoozed = await user.post('/chapters/maths-5/snooze').expect(200);
    expect(snoozed.body.data.snoozedUntil).toBe('2026-11-19');
  });
});

describe('tests (exams)', () => {
  it('adds and removes tests with validation', async () => {
    const { user } = await student();
    const created = await user
      .post('/exams', {
        subject: 'science',
        name: 'Unit test',
        date: '2026-12-02',
        weight: 10,
        chapterKeys: ['science-1', 'science-2'],
      })
      .expect(201);
    expect(created.body.data).toMatchObject({
      name: 'Unit test',
      chapterKeys: ['science-1', 'science-2'],
    });
    expect((await user.get('/exams').expect(200)).body.data).toHaveLength(2);

    const past = await user
      .post('/exams', {
        subject: 'science',
        name: 'Old',
        date: TODAY,
        weight: 10,
        chapterKeys: ['science-1'],
      })
      .expect(400);
    expect(past.body.error.code).toBe('EXAM_IN_PAST');
    const mixed = await user
      .post('/exams', {
        subject: 'science',
        name: 'Mixed',
        date: '2026-12-02',
        weight: 10,
        chapterKeys: ['maths-1'],
      })
      .expect(400);
    expect(mixed.body.error.code).toBe('UNKNOWN_CHAPTER');
    await user
      .post('/exams', {
        subject: 'science',
        name: 'None',
        date: '2026-12-02',
        weight: 10,
        chapterKeys: [],
      })
      .expect(400);

    await user.delete(`/exams/${created.body.data.id}`).expect(204);
    await user.delete(`/exams/${created.body.data.id}`).expect(404);
    await user.delete('/exams/not-an-id').expect(400);
  });
});

describe('homework', () => {
  const item = {
    subject: 'maths',
    title: 'Exercise 8.2',
    note: 'Odd numbers only',
    due: '2026-11-21',
    mins: 40,
    difficulty: 2,
  };

  it('adds homework with a task the day before it is due', async () => {
    const { user } = await student();
    const created = await user.post('/homework', item).expect(201);
    expect(created.body.data.homework).toMatchObject({ title: 'Exercise 8.2', done: false });
    expect(created.body.data.task).toMatchObject({
      date: '2026-11-20',
      kind: 'homework',
      mins: 40,
    });

    const open = await user.get('/homework?status=open').expect(200);
    expect(open.body.data).toHaveLength(1);
    const summary = await user.get('/homework/summary').expect(200);
    expect(summary.body.data).toEqual({
      today: TODAY,
      dueThisWeek: 1,
      overdue: 0,
      doneThisWeek: 0,
    });

    const past = await user.post('/homework', { ...item, due: '2026-11-17' }).expect(400);
    expect(past.body.error.code).toBe('DUE_IN_PAST');
  });

  it('marks homework done and pending again', async () => {
    const { user } = await student();
    const { homework } = (await user.post('/homework', item).expect(201)).body.data;
    const done = await user.patch(`/homework/${homework.id}`, { done: true }).expect(200);
    expect(done.body.data).toMatchObject({ done: true, doneOn: TODAY });
    expect((await user.get('/homework?status=done').expect(200)).body.data).toHaveLength(1);
    expect((await user.get('/homework/summary').expect(200)).body.data.doneThisWeek).toBe(1);
    const undone = await user.patch(`/homework/${homework.id}`, { done: false }).expect(200);
    expect(undone.body.data).toMatchObject({ done: false, doneOn: null });
  });

  it('deletes homework with its open task but keeps minutes already studied', async () => {
    const { user, tasks } = await student();
    const first = (await user.post('/homework', item).expect(201)).body.data;
    const second = (
      await user.post('/homework', { ...item, title: 'Essay', due: '2026-11-18' }).expect(201)
    ).body.data;
    await user.patch(`/tasks/${second.task.id}`, { done: true }).expect(200);

    await user.delete(`/homework/${first.homework.id}`).expect(204);
    await user.delete(`/homework/${second.homework.id}`).expect(204);
    await user.delete(`/homework/${first.homework.id}`).expect(404);

    const remaining = await tasks();
    expect(remaining.find((task) => task.id === first.task.id)).toBeUndefined();
    expect(remaining.find((task) => task.id === second.task.id)).toMatchObject({
      done: true,
      homeworkId: null,
    });
    expect((await user.get('/homework?status=open').expect(200)).body.data).toHaveLength(0);
  });
});

describe('habits', () => {
  it('logs focus sessions up to a daily cap', async () => {
    const { user } = await student();
    const session = await user
      .post('/focus-sessions', { subject: 'science', mins: 25 })
      .expect(201);
    expect(session.body.data).toMatchObject({ date: TODAY, subject: 'science', mins: 25 });
    const habits = await user.get('/dashboard/habits').expect(200);
    expect(habits.body.data).toMatchObject({ focusTodayMins: 25, streak: 1, canRestToday: false });

    for (let i = 0; i < 2; i += 1)
      await user.post('/focus-sessions', { subject: 'maths', mins: 240 }).expect(201);
    const capped = await user.post('/focus-sessions', { subject: 'maths', mins: 240 }).expect(422);
    expect(capped.body.error.code).toBe('FOCUS_LIMIT_REACHED');
    await user.post('/focus-sessions', { subject: 'maths', mins: 0 }).expect(400);
  });

  it('takes rest days only before studying and at most twice a week', async () => {
    const { user } = await student();
    const rest = await user.post('/daily-logs/today/rest').expect(200);
    expect(rest.body.data).toMatchObject({ date: TODAY, rest: true });
    expect((await user.post('/daily-logs/today/rest').expect(409)).body.error.code).toBe(
      'ALREADY_RESTING',
    );

    ctx.clock.set(days(1));
    await user.post('/daily-logs/today/rest').expect(200);
    ctx.clock.set(days(2));
    expect((await user.post('/daily-logs/today/rest').expect(409)).body.error.code).toBe(
      'REST_LIMIT_REACHED',
    );

    ctx.clock.set(days(3));
    await user.post('/focus-sessions', { subject: 'maths', mins: 10 }).expect(201);
    expect((await user.post('/daily-logs/today/rest').expect(409)).body.error.code).toBe(
      'ALREADY_STUDIED',
    );
  });

  it('saves the check-in and routines', async () => {
    const { user } = await student();
    const checkin = await user
      .put('/daily-logs/today/checkin', { sleep: 7.5, breaks: 3, screen: '1 to 2 h' })
      .expect(200);
    expect(checkin.body.data.checkin).toEqual({
      sleep: 7.5,
      breaks: 3,
      screen: '1 to 2 h',
      saved: true,
    });
    await user
      .put('/daily-logs/today/checkin', { sleep: 7.3, breaks: 3, screen: '1 to 2 h' })
      .expect(400);

    await user
      .put('/daily-logs/today/routines', {
        morning: [true, false, true],
        evening: [false, false, true],
      })
      .expect(200);
    const habits = await user.get('/dashboard/habits').expect(200);
    expect(habits.body.data.routines.morning.map((item: { done: boolean }) => item.done)).toEqual([
      true,
      false,
      true,
    ]);
    await user.put('/daily-logs/today/routines', { morning: [true], evening: [] }).expect(400);
  });

  it('builds the school bag for the next school day and ticks items', async () => {
    const { user } = await student();
    const bag = await user.get('/bag').expect(200);
    expect(bag.body.data.date).toBe('2026-11-19');
    expect(bag.body.data.items.length).toBeGreaterThan(2);

    const itemId = bag.body.data.items[0].id as string;
    const ticked = await user.put(`/bag/2026-11-19/items/${itemId}`, { checked: true }).expect(200);
    expect(ticked.body.data.packed).toBe(1);
    expect(
      (await user.put('/bag/2026-11-19/items/rocket', { checked: true }).expect(400)).body.error
        .code,
    ).toBe('UNKNOWN_BAG_ITEM');
    await user.put('/bag/2026-11-19/items/$where', { checked: true }).expect(400);
    await user.get('/bag?date=2026-12-30').expect(400);
  });
});

describe('dashboards', () => {
  it('serves every screen read model', async () => {
    const { user } = await student();
    const progress = await user.get('/dashboard/progress').expect(200);
    expect(progress.body.data.coverage.total).toBeGreaterThan(50);
    expect(progress.body.data.last7).toHaveLength(7);
    const habits = await user.get('/dashboard/habits').expect(200);
    expect(habits.body.data.calendar).toHaveLength(28);
    const sharing = await user.get('/dashboard/sharing').expect(200);
    expect(sharing.body.data.preview).toMatchObject({ streak: 0, coveragePercent: 0 });
  });
});

describe('data isolation between students', () => {
  it('never lets one student read or change another student’s records', async () => {
    const owner = await student();
    const intruder = await student();
    const [task] = await owner.tasks();
    const homework = (
      await owner.user
        .post('/homework', {
          subject: 'maths',
          title: 'Mine',
          due: '2026-11-21',
          mins: 30,
          difficulty: 1,
        })
        .expect(201)
    ).body.data.homework;
    const exam = (await owner.user.get('/exams').expect(200)).body.data[0];

    await intruder.user.patch(`/tasks/${task!.id}`, { done: true }).expect(404);
    await intruder.user.post(`/tasks/${task!.id}/skip`).expect(404);
    await intruder.user.patch(`/homework/${homework.id}`, { done: true }).expect(404);
    await intruder.user.delete(`/homework/${homework.id}`).expect(404);
    await intruder.user.delete(`/exams/${exam.id}`).expect(404);
    expect((await owner.tasks()).find((item) => item.id === task!.id)!.done).toBe(false);
  });
});
