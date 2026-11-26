import type { Role } from './types.js';

/**
 * What each role may do. Routes ask for a permission rather than a role, so a new role only
 * needs a line here. The user DTO carries the list so the admin portal can hide what it can't do.
 */
export const PERMISSIONS = [
  /** See exams, categories, syllabus drafts and the dashboard in the admin portal. */
  'catalog:read',
  /** Create and edit exams and categories, and edit draft syllabi (import, duplicate, reorder). */
  'catalog:write',
  /** Publish and unpublish syllabi; delete exams, categories and syllabus versions. */
  'catalog:publish',
  /** List accounts and change roles. */
  'users:manage',
  /** Read the security audit log. */
  'audit:read',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const ROLES = ['student', 'editor', 'admin'] as const;

const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  student: [],
  editor: ['catalog:read', 'catalog:write'],
  admin: PERMISSIONS,
};

export function permissionsOf(role: Role): Permission[] {
  return [...ROLE_PERMISSIONS[role]];
}

export function can(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}
