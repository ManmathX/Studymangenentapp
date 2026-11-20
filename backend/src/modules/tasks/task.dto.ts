import { z } from '../../common/zod.js';
import { SUBJECT_IDS } from '../syllabus/syllabus.data.js';
import { TASK_KINDS, TASK_SOURCES, TASK_STATUSES } from '../planner/planner.types.js';
import type { TaskRecord } from './task.repository.js';

export const taskSchema = z
  .object({
    id: z.string(),
    date: z.string(),
    subject: z.enum(SUBJECT_IDS),
    title: z.string(),
    kind: z.enum(TASK_KINDS),
    mins: z.number().int(),
    done: z.boolean(),
    source: z.enum(TASK_SOURCES),
    status: z.enum(TASK_STATUSES),
    score: z.number(),
    deadline: z.string(),
    why: z.string(),
    chapterKey: z.string().nullable(),
    homeworkId: z.string().nullable(),
  })
  .openapi('Task');

export type TaskDto = z.infer<typeof taskSchema>;

export function toTaskDto(task: TaskRecord): TaskDto {
  const { order: _order, ...dto } = task;
  return dto;
}
