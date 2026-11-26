import { NotFoundError } from '../../common/errors/app-error.js';
import type { StudentContext } from '../planner/student-context.js';
import type { UserRepository } from '../users/user.repository.js';
import type { ProfilePatchBody } from './profile.schemas.js';
import type { ProfileRecord, ProfileRepository } from './profile.repository.js';

export class ProfileService {
  constructor(
    private readonly profiles: ProfileRepository,
    private readonly users: UserRepository,
    private readonly context: StudentContext,
  ) {}

  async get(userId: string) {
    const [ctx, user] = await Promise.all([this.context.load(userId), this.users.findById(userId)]);
    if (!user) throw new NotFoundError('Account not found', 'USER_NOT_FOUND');
    return this.toDto(ctx.profile, user.name, ctx.today);
  }

  async update(userId: string, patch: ProfilePatchBody) {
    const { profile } = await this.context.load(userId);
    const sharing = patch.sharing
      ? {
          parent: patch.sharing.parent ?? profile.sharing.parent,
          groups: patch.sharing.groups ?? profile.sharing.groups,
          items: { ...profile.sharing.items, ...patch.sharing.items },
        }
      : undefined;
    await this.profiles.update(userId, {
      ...(patch.ageMode ? { ageMode: patch.ageMode } : {}),
      ...(patch.examSeason !== undefined ? { examSeason: patch.examSeason } : {}),
      ...(patch.timezone ? { timezone: patch.timezone } : {}),
      ...(sharing ? { sharing } : {}),
    });
    return this.get(userId);
  }

  private toDto(profile: ProfileRecord, name: string, today: string) {
    return {
      name,
      cls: profile.cls,
      board: profile.board,
      boardName: profile.boardName,
      timezone: profile.timezone,
      subjects: profile.subjects,
      subjectInfo: profile.subjectInfo,
      schoolStart: profile.schoolStart,
      schoolEnd: profile.schoolEnd,
      tuitionDays: profile.tuitionDays,
      tuitionStart: profile.tuitionStart,
      tuitionEnd: profile.tuitionEnd,
      dailyLimitMins: profile.dailyLimitMins,
      weeklyGoalMins: profile.weeklyGoalMins,
      ageMode: profile.ageMode,
      examSeason: profile.examSeason,
      sharing: profile.sharing,
      isDemo: profile.isDemo,
      today,
    };
  }
}
