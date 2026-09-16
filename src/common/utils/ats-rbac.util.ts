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
 * Truy xuất an toàn departmentId của User với cơ chế fallback đa tầng và logging chẩn đoán.
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

  // 2. Tra cứu cột phòng ban trong bảng users (hỗ trợ cả snake_case và camelCase)
  const userQueries = [
    `SELECT department_id as "deptId" FROM users WHERE id = $1 LIMIT 1`,
    `SELECT "departmentId" as "deptId" FROM users WHERE id = $1 LIMIT 1`,
    `SELECT department_id as "deptId" FROM "user" WHERE id = $1 LIMIT 1`,
    `SELECT "departmentId" as "deptId" FROM "user" WHERE id = $1 LIMIT 1`,
  ];

  for (const queryStr of userQueries) {
    try {
      const rows = await manager.query<DeptIdRow[]>(queryStr, [userId]);
      if (
        Array.isArray(rows) &&
        rows.length > 0 &&
        rows[0]?.deptId &&
        rows[0].deptId !== 'GLOBAL'
      ) {
        return rows[0].deptId;
      }
    } catch {
      // Tiếp tục thử câu truy vấn tiếp theo
    }
  }

  // 3. Tra cứu bảng trung gian thành viên phòng ban
  const membershipQueries = [
    `SELECT department_id as "deptId" FROM department_members WHERE user_id = $1 LIMIT 1`,
    `SELECT "departmentId" as "deptId" FROM department_members WHERE "userId" = $1 LIMIT 1`,
    `SELECT department_id as "deptId" FROM user_departments WHERE user_id = $1 LIMIT 1`,
    `SELECT "departmentId" as "deptId" FROM user_departments WHERE "userId" = $1 LIMIT 1`,
    `SELECT department_id as "deptId" FROM staff_departments WHERE user_id = $1 LIMIT 1`,
  ];

  for (const queryStr of membershipQueries) {
    try {
      const rows = await manager.query<DeptIdRow[]>(queryStr, [userId]);
      if (
        Array.isArray(rows) &&
        rows.length > 0 &&
        rows[0]?.deptId &&
        rows[0].deptId !== 'GLOBAL'
      ) {
        return rows[0].deptId;
      }
    } catch {
      // Tiếp tục thử câu truy vấn tiếp theo
    }
  }

  // 4. Tra cứu bảng departments theo các trường quản lý (head, manager, leader)
  const deptQueries = [
    `SELECT id FROM departments WHERE head_id = $1 OR manager_id = $1 OR leader_id = $1 OR user_id = $1 LIMIT 1`,
    `SELECT id FROM departments WHERE "headId" = $1 OR "managerId" = $1 OR "leaderId" = $1 OR "userId" = $1 LIMIT 1`,
    `SELECT id FROM department WHERE head_id = $1 OR manager_id = $1 OR leader_id = $1 LIMIT 1`,
    `SELECT id FROM department WHERE "headId" = $1 OR "managerId" = $1 OR "leaderId" = $1 LIMIT 1`,
  ];

  for (const queryStr of deptQueries) {
    try {
      const rows = await manager.query<IdRow[]>(queryStr, [userId]);
      if (Array.isArray(rows) && rows.length > 0 && rows[0]?.id) {
        return rows[0].id;
      }
    } catch {
      // Tiếp tục thử câu truy vấn tiếp theo
    }
  }

  // 5. Khớp theo Role Slug của Trưởng phòng ban (Ví dụ: HEAD_ARCHITECTURE -> ARCHITECTURE / Kiến trúc)
  let roleSlug = '';
  if (typeof user.roleSlug === 'string') {
    roleSlug = user.roleSlug;
  } else if (
    typeof user.role === 'object' &&
    user.role !== null &&
    typeof user.role.slug === 'string'
  ) {
    roleSlug = user.role.slug;
  } else if (typeof user.role === 'string') {
    roleSlug = user.role;
  }

  const normalizedRole = roleSlug.toUpperCase();
  if (normalizedRole.startsWith('HEAD_')) {
    const rawKeyword = normalizedRole.replace('HEAD_', '');
    const keywordVariants: string[] = [rawKeyword];

    // Ánh xạ từ khóa tiếng Anh sang các tên phòng ban tiếng Việt tương ứng
    if (rawKeyword === 'ARCHITECTURE') {
      keywordVariants.push('KIẾN TRÚC', 'KIEN TRUC', 'ARCH', 'KT');
    } else if (rawKeyword === 'STRUCTURE') {
      keywordVariants.push('KẾT CẤU', 'KET CAU', 'KC');
    } else if (rawKeyword === 'MEP') {
      keywordVariants.push('CƠ ĐIỆN', 'CO DIEN');
    } else if (rawKeyword === 'HR' || rawKeyword === 'HUMAN_RESOURCE') {
      keywordVariants.push('NHÂN SỰ', 'NHAN SU');
    } else if (rawKeyword === 'ACCOUNTING' || rawKeyword === 'FINANCE') {
      keywordVariants.push('KẾ TOÁN', 'KE TOAN', 'TÀI CHÍNH');
    }

    for (const variant of keywordVariants) {
      const roleMatchQueries = [
        `SELECT id FROM departments WHERE UPPER(code) = $1 OR UPPER(name) LIKE $2 LIMIT 1`,
        `SELECT id FROM department WHERE UPPER(code) = $1 OR UPPER(name) LIKE $2 LIMIT 1`,
      ];

      for (const queryStr of roleMatchQueries) {
        try {
          const rows = await manager.query<Array<{ id?: string }>>(queryStr, [
            variant,
            `%${variant}%`,
          ]);
          if (Array.isArray(rows) && rows.length > 0 && rows[0]?.id) {
            return rows[0].id;
          }
        } catch {
          // Tiếp tục thử
        }
      }
    }
  }

  return undefined;
}
