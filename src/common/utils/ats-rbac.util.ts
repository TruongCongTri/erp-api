import { EntityManager } from 'typeorm';
import type { ActiveUserData } from 'src/common/decorators/current-user.decorator';

export interface RoleObject {
  id?: string;
  name?: string;
  code?: string;
  slug?: string;
}

export type ExtendedUser = ActiveUserData & {
  departmentId?: string | null;
  department_id?: string | null;
  deptId?: string | null;
  department?: { id?: string | null } | null;
  role?: string | RoleObject | null;
  roleCode?: string | null;
  roleSlug?: string | null;
  roleLevel?: string | null;
  roles?: Array<string | RoleObject> | null;
  fullName?: string | null;
  sub?: string;
  userId?: string;
};

export type RbacScope = 'any' | 'dept' | 'own';

// interface RawDeptRow {
//   id?: string;
//   department_id?: string;
//   departmentId?: string;
// }
interface DeptIdRow {
  deptId?: string;
}

interface IdRow {
  id?: string;
}

/**
 * Kiểm tra xem người dùng có phải là Quản trị viên cấp cao (Super Admin / System Admin) hay không
 */
export function isSuperAdmin(user: ExtendedUser): boolean {
  let roleStr = '';

  if (typeof user.roleSlug === 'string') {
    roleStr = user.roleSlug;
  } else if (typeof user.roleCode === 'string') {
    roleStr = user.roleCode;
  } else if (typeof user.role === 'string') {
    roleStr = user.role;
  } else if (typeof user.role === 'object' && user.role !== null) {
    const r = user.role;
    roleStr = r.slug ?? r.code ?? r.name ?? '';
  } else if (Array.isArray(user.roles) && user.roles.length > 0) {
    const firstRole = user.roles[0];
    if (typeof firstRole === 'string') {
      roleStr = firstRole;
    } else if (typeof firstRole === 'object' && firstRole !== null) {
      roleStr = firstRole.slug ?? firstRole.code ?? firstRole.name ?? '';
    }
  }

  const normalizedRole = roleStr.toUpperCase();

  if (
    normalizedRole === 'SUPER_ADMIN' ||
    normalizedRole === 'SYSTEM_ADMIN' ||
    normalizedRole === 'ADMIN' ||
    normalizedRole.includes('SUPER')
  ) {
    return true;
  }

  const perms = Array.isArray(user.permissions) ? user.permissions : [];
  return perms.includes('*:*:any') || perms.includes('*');
}

/**
 * Kiểm tra quyền hạn theo chuẩn `resource:action:scope`
 * Quy tắc kế thừa: scope `any` bao hàm cả `dept` và `own`.
 */
export function hasPermission(
  user: ExtendedUser,
  resource: string,
  action: string,
  scope: RbacScope,
): boolean {
  if (isSuperAdmin(user)) return true;

  const perms = Array.isArray(user.permissions) ? user.permissions : [];
  if (perms.length === 0) return false;

  return perms.some((perm) => {
    if (typeof perm !== 'string') return false;
    if (perm === '*:*:any' || perm === '*') return true;
    const parts = perm.split(':');
    if (parts.length < 3) return false;
    const [r, a, s] = parts;

    const matchResource = r === '*' || r === resource;
    const matchAction = a === '*' || a === action;

    let matchScope = s === '*' || s === scope;
    if (!matchScope && (scope === 'dept' || scope === 'own') && s === 'any') {
      matchScope = true;
    }
    if (!matchScope && scope === 'own' && s === 'dept') {
      matchScope = true;
    }

    return matchResource && matchAction && matchScope;
  });
}

/**
 * Truy xuất departmentId của User dựa trên schema thực tế:
 * - `users.department_id` (User.department, xem src/users/entities/users.entity.ts)
 * - `departments.head_user_id` cho trường hợp user là Trưởng bộ phận nhưng
 *   chưa được gán department_id trực tiếp (xem src/departments/entities/department.entity.ts)
 */
export async function getUserDepartmentId(
  manager: EntityManager,
  user: ExtendedUser,
): Promise<string | undefined> {
  const userId = user.id || user.sub || user.userId;

  // 1. Kiểm tra trực tiếp trên user context / JWT payload
  let rawDeptId: string | undefined;
  if (typeof user.departmentId === 'string' && user.departmentId.length > 0) {
    rawDeptId = user.departmentId;
  } else if (
    typeof user.department_id === 'string' &&
    user.department_id.length > 0
  ) {
    rawDeptId = user.department_id;
  } else if (typeof user.deptId === 'string' && user.deptId.length > 0) {
    rawDeptId = user.deptId;
  } else if (
    typeof user.department?.id === 'string' &&
    user.department.id.length > 0
  ) {
    rawDeptId = user.department.id;
  }

  if (rawDeptId && rawDeptId !== 'GLOBAL') {
    return rawDeptId;
  }

  if (!userId) {
    return undefined;
  }

  // 2. Tra cứu department_id trực tiếp trên bảng users
  const userRows = await manager.query<DeptIdRow[]>(
    `SELECT department_id as "deptId" FROM users WHERE id = $1 LIMIT 1`,
    [userId],
  );
  const directDeptId = userRows?.[0]?.deptId;
  if (directDeptId && directDeptId !== 'GLOBAL') {
    return directDeptId;
  }

  // 3. Fallback: user là Trưởng bộ phận (departments.head_user_id) nhưng chưa được
  // gán department_id trực tiếp trên hồ sơ của mình
  const headRows = await manager.query<IdRow[]>(
    `SELECT id FROM departments WHERE head_user_id = $1 LIMIT 1`,
    [userId],
  );
  return headRows?.[0]?.id ?? undefined;
}
