import { NotFoundError } from '../../common/errors/app-error.js';
import type { Clock } from '../../common/utils/clock.js';
import { localNow, type DateKey } from '../../common/utils/dates.js';
import type { ProfileRecord, ProfileRepository } from '../profile/profile.repository.js';
import { startDay } from './planner.engine.js';

export interface StudentDay {
  profile: ProfileRecord;
  /** Today in the student's own time zone. */
  today: DateKey;
  /** First day new work may be planned on (tomorrow after 19:00). */
  start: DateKey;
}

/** Resolves the student's profile and their local "today" for every planner request. */
export class StudentContext {
  constructor(
    private readonly profiles: ProfileRepository,
    private readonly clock: Clock,
  ) {}

  async load(userId: string): Promise<StudentDay> {
    const profile = await this.profiles.findByUser(userId);
    if (!profile)
      throw new NotFoundError('Finish setting up your planner first', 'ONBOARDING_REQUIRED');
    return { profile, ...this.today(profile.timezone) };
  }

  today(timeZone: string): { today: DateKey; start: DateKey } {
    const local = localNow(this.clock.now(), timeZone);
    return { today: local.date, start: startDay(local) };
  }
}
