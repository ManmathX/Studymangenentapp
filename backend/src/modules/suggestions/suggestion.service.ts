import { ConflictError, NotFoundError } from '../../common/errors/app-error.js';
import { addDays } from '../../common/utils/dates.js';
import { shortDate } from '../../common/utils/format.js';
import type { TransactionRunner } from '../../database/transaction.js';
import { bestDay, DayLoad } from '../planner/planner.engine.js';
import type { StudentContext, StudentDay } from '../planner/student-context.js';
import type { TaskRepository } from '../tasks/task.repository.js';
import type { SuggestionState } from './suggestion.model.js';
import type { SuggestionRecord, SuggestionRepository } from './suggestion.repository.js';

/** How far back missed tasks still produce a "move it" suggestion. */
const MISSED_LOOKBACK_DAYS = 7;

export class SuggestionService {
  constructor(
    private readonly context: StudentContext,
    private readonly suggestions: SuggestionRepository,
    private readonly tasks: TaskRepository,
    private readonly transactions: TransactionRunner,
  ) {}

  list(userId: string, states: SuggestionState[]): Promise<SuggestionRecord[]> {
    return this.suggestions.listByStates(userId, states);
  }

  /** Turns tasks that slipped in the last week into one pending "move" suggestion each (idempotent). */
  async refreshMissedTasks(userId: string, ctx: StudentDay): Promise<void> {
    const slipped = await this.tasks.findSlipped(
      userId,
      addDays(ctx.today, -MISSED_LOOKBACK_DAYS),
      ctx.today,
    );
    if (!slipped.length) return;
    const load = new DayLoad(
      await this.tasks.findInRange(userId, ctx.today, addDays(ctx.today, 7)),
    );
    for (const task of slipped) {
      const date =
        bestDay(load, ctx.profile, task.mins, ctx.start, addDays(ctx.start, 5)) ?? ctx.start;
      load.add({ date, mins: task.mins, status: 'suggested' });
      await this.suggestions.ensureMoveSuggestion(userId, {
        from: 'app',
        who: 'Planner',
        role: 'Missed task',
        subject: task.subject,
        title: task.title,
        mins: task.mins,
        date,
        kind: 'move',
        taskId: task.id,
        chapterKey: task.chapterKey,
        note: `This slipped on ${shortDate(task.date)}. ${shortDate(date)} has room.`,
      });
    }
  }

  async accept(userId: string, id: string, date?: string): Promise<SuggestionRecord> {
    const suggestion = await this.requireOpen(userId, id);
    const target = date ?? suggestion.date;
    return this.transactions.run(async (tx) => {
      if (suggestion.kind === 'move' && suggestion.taskId) {
        await this.tasks.update(
          userId,
          suggestion.taskId,
          { date: target, status: 'accepted' },
          tx,
        );
      } else {
        await this.tasks.insertMany(
          userId,
          [
            {
              date: target,
              subject: suggestion.subject,
              title: suggestion.title,
              kind: suggestion.kind === 'move' ? 'revision' : suggestion.kind,
              mins: suggestion.mins,
              chapterKey: suggestion.chapterKey,
              deadline: target,
              source: suggestion.from,
              status: 'accepted',
              score: 5,
            },
          ],
          tx,
        );
      }
      return (await this.suggestions.setState(userId, id, 'accepted', tx))!;
    });
  }

  async later(userId: string, id: string): Promise<SuggestionRecord> {
    await this.requireOpen(userId, id);
    return (await this.suggestions.setState(userId, id, 'later'))!;
  }

  async skip(userId: string, id: string): Promise<SuggestionRecord> {
    const suggestion = await this.requireOpen(userId, id);
    return this.transactions.run(async (tx) => {
      if (suggestion.kind === 'move' && suggestion.taskId) {
        await this.tasks.update(userId, suggestion.taskId, { status: 'skipped' }, tx);
      }
      return (await this.suggestions.setState(userId, id, 'skipped', tx))!;
    });
  }

  /** Accepts the suggestion on the roomiest of the following six days instead. */
  async swap(userId: string, id: string): Promise<SuggestionRecord> {
    const ctx = await this.context.load(userId);
    const suggestion = await this.requireOpen(userId, id);
    const from = addDays(suggestion.date, 1) > ctx.today ? addDays(suggestion.date, 1) : ctx.today;
    const load = new DayLoad(await this.tasks.findInRange(userId, from, addDays(from, 6)));
    const date =
      bestDay(load, ctx.profile, suggestion.mins, from, addDays(suggestion.date, 6)) ?? from;
    return this.accept(userId, id, date);
  }

  private async requireOpen(userId: string, id: string): Promise<SuggestionRecord> {
    const suggestion = await this.suggestions.findById(userId, id);
    if (!suggestion) throw new NotFoundError('Suggestion not found', 'SUGGESTION_NOT_FOUND');
    if (suggestion.state !== 'pending' && suggestion.state !== 'later') {
      throw new ConflictError('This suggestion was already handled', 'SUGGESTION_CLOSED');
    }
    return suggestion;
  }
}
