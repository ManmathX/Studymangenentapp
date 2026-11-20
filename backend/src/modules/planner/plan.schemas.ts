import { z } from '../../common/zod.js';
import { dateKeySchema } from '../../common/utils/validators.js';
import { taskSchema } from '../tasks/task.dto.js';

export const stripQuerySchema = z.object({
  from: dateKeySchema.optional(),
  days: z.coerce.number().int().min(1).max(31).default(14),
});

export const dayParamsSchema = z.object({ date: dateKeySchema });

export const stripDaySchema = z
  .object({
    date: z.string(),
    plannedMins: z.number().int(),
    limitMins: z.number().int(),
    overloaded: z.boolean(),
    hasExam: z.boolean(),
    hasSuggested: z.boolean(),
  })
  .openapi('PlanStripDay');

const fixedRowSchema = z.object({
  type: z.literal('fixed'),
  start: z.number().int(),
  end: z.number().int(),
  label: z.string(),
  kind: z.enum(['school', 'rest', 'tuition']),
});
const taskRowSchema = z.object({ type: z.literal('task'), start: z.number().int(), end: z.number().int(), task: taskSchema });

export const planDaySchema = z
  .object({
    date: z.string(),
    today: z.string(),
    ageMode: z.enum(['simple', 'deeper']),
    plannedMins: z.number().int(),
    limitMins: z.number().int(),
    overloaded: z.boolean(),
    tuitionDay: z.boolean(),
    rows: z.array(z.union([fixedRowSchema, taskRowSchema])),
    overflow: z.array(taskSchema),
    moveSuggestion: z.object({ taskId: z.string(), title: z.string(), toDate: z.string() }).nullable(),
    suggestedCount: z.number().int(),
    dayOptions: z.array(z.string()),
  })
  .openapi('PlanDay');

export const scheduleResultSchema = z
  .object({ added: z.number().int(), firstDate: z.string().nullable() })
  .openapi('ScheduleResult');

export const acceptAllResultSchema = z.object({ accepted: z.number().int() }).openapi('AcceptAllResult');
