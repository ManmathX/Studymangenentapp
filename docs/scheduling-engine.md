# How the planner fills the calendar

The planner runs on the phone (`frontend/src/data/core/`). It is deterministic: the same plan, settings and date always give the same calendar. There is no AI in it.

This page explains how a day is built, how tests and exams are planned into it, and which rules are tested on every change.

## 1. Every day starts from its frame

`dayFrame(profile, date, exams)` in `dayFrame.js` decides what a day looks like before any study is placed on it.

**What kind of day it is**

| Day type | When | School block |
| --- | --- | --- |
| `school` | A weekday with school | School hours |
| `halfDay` | A Saturday in `half` mode, or a school Saturday in `alternate` mode | School start + 4 h 45 min |
| `noSchool` | Sunday, a holiday or break, a Saturday in `off` mode, the 2nd and 4th Saturday in `alternate` mode | None; study from 09:00 |
| `paper` | A half-yearly or final paper with a time | The paper replaces school |
| `studyLeave` | A school day between the first and last paper of a half-yearly or final with "Only go to school for papers" on | None |

**There is no daily study limit.** A day can hold as much study as it has free time, up to the student's sleep time. Days without school therefore hold much more than school days.

**School timings** can change in four ways, highest first:

1. A holiday: no school.
2. A timing change from the calendar for a day, a week or a month: new hours, or no school. A week or month change only alters days that have school. The latest change wins.
3. A weekday's own times (for example, Tuesdays end at 15:00).
4. The usual times, with Saturdays following their mode.

One day's tuition can also be replaced or cancelled.

**Sleep, meals and breaks** come from Profile:

- Wake-up and sleep times, with at least 7 hours between them. Nothing is ever planned while the student sleeps.
- Breakfast and dinner at their own times.
- Lunch right after school or a paper; on days without school, at the lunch time.
- After lunch, a snack and play break on school days (30 min by default) or an afternoon rest on days without school.

**Habits.** A habit with a set time sits at that time. A habit without one (5 min by default) is placed at the first free moment in its part of the day: the morning after waking, after school, or the evening after dinner. It can be ticked from the calendar.

**Editing slots.** From the calendar, the student can move, resize or remove a meal, the after-lunch break, a habit, or the Homework or Night revision slot, for one day or every day.

- Self study can only be removed: it is the free time that is left.
- A moved slot takes its new time, or the next free stretch after it that is long enough.
- During a half-yearly or final there is still no Homework slot.

**Fixed blocks.** These are hard constraints: study never overlaps them. They are added in this order of precedence:

1. sleep
2. exam paper
3. school
4. tuition (any day, Sunday included)
5. habits with a set time
6. meals and breaks

If two blocks overlap, the lower one is dropped for that day and listed in `dropped`. The day plan tells the student, for example "Swimming is off today: it clashes with Half-yearly: Maths". Meals are trimmed to fit instead of dropped. Saving settings refuses clashes up front (tuition with school, a timed habit with school, tuition or another habit), so `dropped` only happens on exam days or after a Saturday-mode change.

**Where study may go.** Study goes after school and lunch (from 09:00 on days without school) and in the student's own study sessions, up to their stop time (default 22:00, latest 23:00). Free stretches shorter than 15 min are ignored.

**Capacity** = the day's real free time. A plan never asks a day for more than that.

## 2. Slots: Homework, self study, Night revision

`routineSlots` gives every day:

- **Night revision.** The last minutes before the stop time: 15 min for what school taught (on a school day), 10 min for each tuition that day, and 10 min to recap the day's study. It is one sitting with no breaks. Nothing else may use this slot, so it always ends the day.
- **Homework slot.** The student's chosen length (30 to 90 min), straight after school and lunch. There is none between the first and last paper of a half-yearly or final.
- **Study.** All the other free time. It goes first into the student's own study sessions (up to two, for example 05:30–06:30 and 18:30–20:00), then into the free time after homework, over as many free stretches as the day has.
  - It is labelled **Test prep** in the two weeks before a unit test, or the four or six weeks before a half-yearly or final.
  - It is labelled **Exam revision** while the half-yearly or final is on.
  - Otherwise it is **Self study**.

**Breaks between tasks.** After each study task comes a 10-minute break. After about 90 minutes of study in a row the break is 20 minutes. Night revision is one sitting with no breaks. Breaks show on the timeline, and nothing else is placed in them.

`layoutDay` places tasks:

1. Each task goes in its own slots in time order, with a 10-minute break after the one before. Study never runs into the Homework slot.
2. If its slots are full, it goes in the earliest free time after them, then in any free time that day.
3. If tasks are still left over, the day is packed again from its earliest free time (a repair step), and whichever layout fits more is kept.
4. Anything that still has no place is overflow. The day plan offers "Move to another day".

## 3. Placing test work

**Unit and periodic tests** (`examPlan.js`):

- Each chapter gets self study, then homework, then revision, depending on how far along it is.
- Self study and homework go in the first half of the 14 days before the test; revision goes in the second half.
- The whole syllabus is revised the evening before the test.

**The daily plan** (`dailyPlan.js`). Opening Today fills the coming week once per day:

- **Daily revision** (20 min a chapter, up to two). Chapters whose spaced revision is due (1, 7 and 30 days after learning) come first, then what was self-studied the day before, then the most recently learnt. A chapter revised in the last three days is skipped. A finished daily revision counts as the chapter's spaced revision.
- **Self study,** on days without test preparation, filling the study slot. Chapters already in progress get their next step (one step per chapter per day). Then come chapters taught in class that still need practice, then new chapters, mixing subjects round by round. A step may be shortened by up to 15 min to use a gap. Finishing steps moves a chapter from not started, to studied, to practised, to revised.
- **Night revision** every night, in its own slot.
- Adding a test clears open self study from its preparation days. Removing the test brings it back. Tasks the student skips are never put back.
- A rest day (at most two a week, planned ahead from the calendar) keeps only night revision.
- Night revision names the day's lessons from the class timetable when the student has set one ("today's lessons: Maths, Science, English"). The school bag uses the same timetable.

**Half-yearly and final exams** (`examSeries.js`):

- Preparation starts 28 days (half-yearly) or 42 days (final) before the first paper. Each day mixes subjects, with at most one step per chapter and two per subject.
- Each chapter's work finishes at least two days before its paper.
- The evening before each paper revises that whole subject (20 to 90 min). On back-to-back exam days this is the afternoon after the previous paper.
- With no daily limit, the plan paces itself so preparation is spread out, not crammed into the first week. Each day takes up to a quarter more than an even share of the steps left over the days left. A step that would run out of days is always placed.

**The placement rule for every step:**

1. The earliest day that has room in its Test prep time (free time, less the Homework and night slots), where the step fits inside its own slot with its break. Minutes alone are not enough: free time comes in separate stretches.
2. Otherwise the step is not planned. It is counted, and the student is told "2 steps didn't fit in the free time before it: add a study session, stop studying later, or tick fewer chapters".

Moving, swapping and suggesting work (`bestDay`, `firstDay`) also check that the task fits on the new day's timeline.

## 4. Rules that are tested

`frontend/src/data/core/__tests__/scheduleInvariants.test.js` builds 150 random students, each with random:

- school hours and Saturday mode;
- tuitions (Sunday included) and timed habits;
- study sessions, stop time and holidays;
- unit tests, and a half-yearly or final on continuous or gapped days, with or without paper time and study leave;
- homework.

They all go through the real planner operations, and opening Today fills the coming week with the daily plan. Then, for every day up to the last paper, the test checks:

- Fixed blocks never overlap; tasks never overlap fixed blocks or each other; slots never overlap fixed blocks.
- No task runs past the student's stop time.
- Capacity is never more than the free time.
- No school block on Sundays, holidays, Saturdays off, study leave or paper days.
- No Homework slot during a half-yearly or final.
- Test prep on a day never exceeds its free time.
- No self study on a test-preparation day, a rest day, or a day where self study was removed.
- Nothing is planned while the student sleeps.
- Night revision is always inside its slot at the end of the day, and every planned night has some.
- A day holding only planned work has no overflow.
- No test work is on or after its test, or in the past.
- A chapter's steps come in order (self study, homework, revision).
- The number of slots the planner reports equals the number it stored.
- The same input gives the same plan.

A failure names its seed, so the case can be replayed exactly. The same file was also run with 1,000 students before release.

`dayFrame.test.js` covers each day type, Saturday modes, holidays, Sunday tuition, paper days and study leave, precedence and meal trimming, study sessions and the stop time. `calendar.test.js` covers the same features through the planner operations, including a half-yearly written on five days in a row and unit tests on consecutive days.

## 5. Research behind the rules

- **How other schedulers work.** Fixed events always win over flexible blocks. Work is ordered by priority and deadline, and long work is split into chunks. Anything that cannot fit is flagged rather than dropped, and habits have preferred windows that move on a clash. Sources: [Motion: how auto-scheduling works](https://www.usemotion.com/help/time-management/auto-scheduling/reference-auto-scheduling/how-auto-scheduling-works-behind-the-scenes) and [Reclaim habits](https://reclaim.ai/features/habits).
- **Timetabling.** Hard constraints define what is allowed and soft constraints define quality. The usual method is greedy construction with a repair step and a fallback when nothing fits ([QuikFix, PATAT 2008](https://www.comp.nus.edu.sg/%7Ehenz/publications/pdf/PATAT2008.pdf)). Here, fixed blocks, the night revision slot and the stop time are hard; how the free time is shared between subjects and days is soft.
- **Learning science.** Spaced practice and practice testing have the strongest evidence; interleaving is moderate ([Weinstein, Madan and Sumeracki 2018](https://link.springer.com/article/10.1186/s41235-017-0087-y), reviewing Dunlosky et al. 2013). The planner spaces revision (1, 7 and 30 days), mixes subjects before big exams, and ends with past-paper practice and revision.
- **Sleep.** Teenagers aged 13 to 18 need 8 to 10 hours ([AASM](https://aasm.org/advocacy/position-statements/teen-sleep-duration-health-advisory/)), so the latest stop time is 23:00 and the default is 22:00. With no daily limit, the stop time is what keeps evenings from running into sleep.
- **School calendars in India.**
  - Periodic tests fall around July and the half-yearly around September to October; the annual exam comes later ([KVS example](https://cdnbbsr.s3waas.gov.in/s3kv02941b0546140a3f7efba2ac723c57/uploads/2025/07/2025073037.pdf)).
  - Dates differ by school, so students enter their own datesheet.
  - Many schools run papers on back-to-back days, with no school on days between papers.
