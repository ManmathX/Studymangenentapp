import { addDays } from '../dates';
import { dayFrame } from '../dayFrame';
import { layoutDay, routineSlots, slotKindFor } from '../engine';

// An empty routine keeps habits out of these layouts (dayFrame.test.js covers where habits go).
const profile = { dailyLimitMins: 180, ageMode: 'deeper', examSeason: false, tuitionDays: [1, 3, 5], schoolStart: 465, schoolEnd: 825, routine: [] };
const WED = '2026-11-18'; // tuition day
const THU = '2026-11-19';
const SAT = '2026-11-21'; // half day
const SUN = '2026-11-22';
const at = (hours, minutes = 0) => hours * 60 + minutes;
const task = (id, kind, mins, order, extra = {}) => ({ id, kind, mins, order, status: 'accepted', score: 1, date: THU, ...extra });

describe('daily slots: homework, self study and night revision', () => {
  it('fills every day’s free time: Homework, then self study, then Night revision just before the stop time', () => {
    for (let offset = 0; offset < 7; offset += 1) {
      const date = addDays(WED, offset);
      const slots = routineSlots(profile, date);
      expect(slots[0].kind).toBe('homework');
      expect(slots.at(-1)).toMatchObject({ kind: 'night', label: 'Night revision', end: at(22) });
      expect(slots.slice(1, -1).every((slot) => slot.kind === 'study')).toBe(true);
      // No daily limit: together the slots take all the day's free time.
      expect(slots.reduce((sum, slot) => sum + slot.end - slot.start, 0)).toBe(dayFrame(profile, date).free);
    }
  });

  it('puts homework after school and lunch, self study in the free time after it, and night revision last', () => {
    expect(routineSlots(profile, THU)).toEqual([
      { kind: 'homework', label: 'Homework', key: 'homework', start: at(15), end: at(16) },
      { kind: 'study', label: 'Self study', key: 'study', start: at(16), end: at(20) },
      { kind: 'study', label: 'Self study', key: 'study', start: at(20, 45), end: at(21, 35) },
      { kind: 'night', label: 'Night revision', key: 'night', detail: 'School · Self study', start: at(21, 35), end: at(22) },
    ]);
    // Wednesday: tuition 16:00 to 17:30 pushes self study after it, and the tuition is revised at night too.
    const wednesday = routineSlots(profile, WED);
    expect(wednesday[1]).toMatchObject({ start: at(17, 30), end: at(20) });
    expect(wednesday.at(-1)).toMatchObject({ detail: 'School · Tuition · Self study', start: at(21, 25), end: at(22) });
    // Saturday is a half day, so the slots start earlier.
    expect(routineSlots(profile, SAT)[0]).toMatchObject({ start: at(13, 45), end: at(14, 45) });
    // Sunday: homework in the morning, self study through the day, a short recap at night.
    expect(routineSlots(profile, SUN).map(({ kind, start, end }) => [kind, start, end])).toEqual([
      ['homework', at(9), at(10)],
      ['study', at(10), at(13)],
      ['study', at(15), at(20)],
      ['study', at(20, 45), at(21, 50)],
      ['night', at(21, 50), at(22)],
    ]);
  });

  it('follows the student’s homework length', () => {
    const [homework] = routineSlots({ ...profile, homeworkMins: 90 }, THU);
    expect(homework.end - homework.start).toBe(90);
    const [short] = routineSlots({ ...profile, homeworkMins: 30 }, THU);
    expect(short.end - short.start).toBe(30);
  });

  it('places homework tasks in the Homework slot, study in Self study and night revision in its slot', () => {
    const tasks = [
      task('rev', 'revision', 20, 1),
      task('hw', 'homework', 40, 2),
      task('study', 'study', 45, 3),
      task('prac', 'practice', 30, 4),
      task('night', 'revision', 15, 5, { daily: { type: 'night', of: 'school' } }),
    ];
    const { rows, slots } = layoutDay(profile, THU, tasks);
    const startOf = Object.fromEntries(rows.filter((row) => row.type === 'task').map((row) => [row.task.id, row.start]));
    expect(startOf).toEqual({ hw: at(15), rev: at(16), study: at(16, 30), prac: at(17, 25), night: at(21, 35) });
    expect(slots.map((slot) => slot.kind)).toEqual(['homework', 'study', 'study', 'night']);
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
    expect(prep).toMatchObject({ kind: 'exam', label: 'Test prep', detail: 'Maths UT and 1 more', start: at(16), end: at(20) });
    expect(prep.exams.map((exam) => exam.id)).toEqual(['soon', 'later']);
    // On and after the test day, and more than two weeks before, it is Self study.
    expect(routineSlots(profile, '2026-11-30', exams)[1].kind).toBe('study');
    expect(routineSlots(profile, '2026-11-10', [exams[1]])[1].kind).toBe('study'); // 15 days before
    expect(routineSlots(profile, '2026-11-11', [exams[1]])[1].kind).toBe('exam'); // 14 days before
    // Night revision stays every night.
    expect(routineSlots(profile, THU, exams).at(-1).kind).toBe('night');
  });

  it('routes test work to Test prep, school homework to Homework, night revision to its slot, other study to the study slot', () => {
    const prepDay = [{ kind: 'homework' }, { kind: 'exam' }, { kind: 'night' }];
    const plainDay = [{ kind: 'homework' }, { kind: 'study' }, { kind: 'night' }];
    expect(slotKindFor({ kind: 'homework', examId: 'e1' }, prepDay)).toBe('exam');
    expect(slotKindFor({ kind: 'homework', examId: null }, prepDay)).toBe('homework');
    expect(slotKindFor({ kind: 'revision', examId: null }, prepDay)).toBe('exam');
    expect(slotKindFor({ kind: 'revision', examId: null }, plainDay)).toBe('study');
    expect(slotKindFor({ kind: 'homework', examId: 'e1' }, plainDay)).toBe('study');
    expect(slotKindFor({ kind: 'revision', daily: { type: 'night' } }, prepDay)).toBe('night');
  });

  it('shows the slots on a day with nothing planned', () => {
    const { rows, overflow } = layoutDay(profile, THU, []);
    expect(rows.filter((row) => row.type === 'slot').map((row) => row.label)).toEqual(['Homework', 'Self study', 'Self study', 'Night revision']);
    expect(overflow).toEqual([]);
  });
});
