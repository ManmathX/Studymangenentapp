import { addDays } from '../dates';
import { layoutDay, limitFor, routineSlots, slotKindFor } from '../engine';

const profile = { dailyLimitMins: 180, ageMode: 'deeper', examSeason: false, tuitionDays: [1, 3, 5], schoolStart: 465, schoolEnd: 825 };
const WED = '2026-11-18'; // tuition day
const THU = '2026-11-19';
const SAT = '2026-11-21'; // half day
const SUN = '2026-11-22';
const at = (hours, minutes = 0) => hours * 60 + minutes;
const task = (id, kind, mins, order) => ({ id, kind, mins, order, status: 'accepted', score: 1, date: THU });

describe('daily homework and self study slots', () => {
  it('gives every day of the week both slots, inside the day’s study limit', () => {
    for (let offset = 0; offset < 7; offset += 1) {
      const date = addDays(WED, offset);
      const slots = routineSlots(profile, date);
      expect(slots.map((slot) => slot.kind)).toEqual(['homework', 'study']);
      const total = slots.reduce((sum, slot) => sum + slot.end - slot.start, 0);
      expect(total).toBe(limitFor(profile, date));
    }
  });

  it('puts homework right after school and lunch, and self study in the next free time', () => {
    expect(routineSlots(profile, THU)).toEqual([
      { kind: 'homework', label: 'Homework', start: at(15), end: at(16) },
      { kind: 'study', label: 'Self study', start: at(16), end: at(18) },
    ]);
    // Tuition 16:00 to 17:30 on Wednesdays pushes self study after it (and the limit is 30 min lower).
    expect(routineSlots(profile, WED)[1]).toMatchObject({ start: at(17, 30), end: at(19) });
    // Saturday is a half day, so the slots start earlier.
    expect(routineSlots(profile, SAT)[0]).toMatchObject({ start: at(13, 45), end: at(14, 45) });
    // Sunday: homework in the morning, the longer self study slot after lunch.
    expect(routineSlots(profile, SUN)).toEqual([
      { kind: 'homework', label: 'Homework', start: at(9), end: at(10) },
      { kind: 'study', label: 'Self study', start: at(15), end: at(18, 30) },
    ]);
  });

  it('follows the student’s homework length and always leaves self study at least 30 minutes', () => {
    const [homework, study] = routineSlots({ ...profile, homeworkMins: 90 }, THU);
    expect(homework.end - homework.start).toBe(90);
    expect(study.end - study.start).toBe(90);
    const simple = routineSlots({ ...profile, ageMode: 'simple', homeworkMins: 90 }, THU);
    expect(simple.map((slot) => slot.end - slot.start)).toEqual([90, 30]);
  });

  it('places homework tasks in the Homework slot and self study, revision and practice in the Self study slot', () => {
    const tasks = [task('rev', 'revision', 20, 1), task('hw', 'homework', 40, 2), task('study', 'study', 45, 3), task('prac', 'practice', 30, 4)];
    const { rows, slots } = layoutDay(profile, THU, tasks);
    const startOf = Object.fromEntries(rows.filter((row) => row.type === 'task').map((row) => [row.task.id, row.start]));
    expect(startOf.hw).toBe(at(15));
    expect(startOf.rev).toBe(at(16));
    expect(startOf.study).toBe(at(16, 30));
    expect(startOf.prac).toBe(at(17, 25));
    expect(rows.filter((row) => row.type === 'slot')).toHaveLength(2);
    expect(slots).toHaveLength(2);
    expect(slotKindFor({ kind: 'homework' })).toBe('homework');
    expect(slotKindFor({ kind: 'revision' })).toBe('study');
  });

  it('never overlaps school, meals, tuition or another task', () => {
    const tasks = Array.from({ length: 8 }, (_, index) => task(`t${index}`, index % 2 ? 'homework' : 'study', 40, index));
    const { rows } = layoutDay(profile, WED, tasks);
    const busy = rows.filter((row) => row.type !== 'slot');
    for (const a of busy) {
      for (const b of busy) {
        if (a !== b) expect(a.start < b.end && b.start < a.end).toBe(false);
      }
    }
  });

  it('turns Self study into Test prep in the two weeks before a test', () => {
    const exams = [
      { id: 'later', name: 'Science UT', date: '2026-11-30', chapterKeys: [] },
      { id: 'soon', name: 'Maths UT', date: '2026-11-25', chapterKeys: [] },
      { id: 'far', name: 'Half yearly', date: '2027-01-20', chapterKeys: [] },
    ];
    const [, prep] = routineSlots(profile, THU, exams);
    expect(prep).toMatchObject({ kind: 'exam', label: 'Test prep', detail: 'Maths UT and 1 more', start: at(16), end: at(18) });
    expect(prep.exams.map((exam) => exam.id)).toEqual(['soon', 'later']);
    // On and after the test day, and more than two weeks before, it is Self study.
    expect(routineSlots(profile, '2026-11-30', exams)[1].kind).toBe('study');
    expect(routineSlots(profile, '2026-11-10', [exams[1]])[1].kind).toBe('study'); // 15 days before
    expect(routineSlots(profile, '2026-11-11', [exams[1]])[1].kind).toBe('exam'); // 14 days before
  });

  it('routes test work to Test prep, school homework to Homework, other study to the study slot', () => {
    const prepDay = [{ kind: 'homework' }, { kind: 'exam' }];
    const plainDay = [{ kind: 'homework' }, { kind: 'study' }];
    expect(slotKindFor({ kind: 'homework', examId: 'e1' }, prepDay)).toBe('exam');
    expect(slotKindFor({ kind: 'homework', examId: null }, prepDay)).toBe('homework');
    expect(slotKindFor({ kind: 'revision', examId: null }, prepDay)).toBe('exam');
    expect(slotKindFor({ kind: 'revision', examId: null }, plainDay)).toBe('study');
    expect(slotKindFor({ kind: 'homework', examId: 'e1' }, plainDay)).toBe('study');
  });

  it('shows both slots on a day with nothing planned', () => {
    const { rows, overflow } = layoutDay(profile, THU, []);
    expect(rows.filter((row) => row.type === 'slot').map((row) => row.label)).toEqual(['Homework', 'Self study']);
    expect(overflow).toEqual([]);
  });
});
