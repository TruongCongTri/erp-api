// ========================================================
// 1. TYPE DEFINITIONS
// ========================================================
export type PermAction =
  'create' | 'read' | 'update' | 'delete' | 'approve' | 'manage' | '*';
export type PermScope = 'any' | 'dept' | 'own';
export type PermissionString =
  `${string}:${PermAction}:${PermScope}` | '*:*:any' | `${string}:*:any`;

export interface RoleDefinition {
  slug: string;
  name: string;
  perms: string[];
}

// ========================================================
// 2. GRANULAR ATOMIC GENERATOR (CRUD Macro)
// ========================================================
/**
 * Sinh danh sách quyền theo cú pháp chuẩn resource:action:scope
 * @example grant('finance', ['create', 'update'], 'dept')
 * // => ['finance:create:dept', 'finance:update:dept']
 */
export const grant = (
  resource: string,
  actions: PermAction | PermAction[],
  scope: PermScope = 'dept',
): string[] => {
  const actionList = Array.isArray(actions) ? actions : [actions];
  return actionList.map((act) => `${resource}:${act}:${scope}`);
};

// ========================================================
// 3. BASE POSITION BUNDLES
// ========================================================

/** Quyền ATS cho Trưởng phòng (Có quyền duyệt JD) */
export const ATS_DEPT_HEAD_PERMS: string[] = [
  ...grant('ats_requisition', ['create', 'update', 'read'], 'dept'),
  'ats_job_post:approve:dept',
  'ats_job_post:read:dept',
  'ats_candidate:read:dept',
];

/** Quyền ATS cho Phó phòng (Theo dõi, không có quyền duyệt JD) */
export const ATS_DEP_HEAD_PERMS: string[] = [
  ...grant('ats_requisition', ['create', 'update', 'read'], 'dept'),
  'ats_job_post:read:dept',
  'ats_candidate:read:dept',
];

/** Quyền ATS toàn quyền cho Ban Giám đốc Nhân sự & Tuyển dụng */
export const ATS_HR_FULL_PERMS: string[] = [
  'ats_requisition:*:any',
  'ats_job_post:*:any',
  'ats_candidate:*:any',
];

/** Quyền ATS ở chế độ xem cho Ban Thư ký / Trợ lý Điều hành */
export const ATS_VIEWER_PERMS: string[] = [
  'ats_requisition:read:any',
  'ats_job_post:read:any',
  'ats_candidate:read:any',
];

/** Gói hành chính chuẩn của mọi Trưởng phòng */
export const DEPT_HEAD_COMMON_PERMS: string[] = [
  'leave_request:approve:dept',
  'document:*:dept',
  'meeting:*:dept',
  'report:read:dept',
  'task:*:dept',
  'policy:read:any',
];

/** Gói hành chính cơ bản của Phó phòng */
export const DEP_HEAD_COMMON_BASE: string[] = [
  'document:*:dept',
  'meeting:*:dept',
  'task:*:dept',
  'policy:read:any',
];

/** Gói hành chính chuẩn của mọi Nhân viên (Staff) */
export const STAFF_COMMON_PERMS: string[] = [
  'document:create:own',
  'document:read:dept',
  'leave_request:create:own',
  'task:*:own',
  'meeting:read:dept',
  'policy:read:any',
];

// ========================================================
// 4. POSITION COMPOSER HELPERS
// ========================================================

/**
 * Tổng hợp quyền chuẩn cho vị trí TRƯỞNG PHÒNG / GIÁM ĐỐC KHỐI
 * Tự động ghép: Quyền chuyên môn + Quyền quản lý chung + Quyền ATS Head
 */
export const forDeptHead = (
  domainPerms: string[] = [],
  extraPerms: string[] = [],
): string[] => [
  ...domainPerms,
  ...DEPT_HEAD_COMMON_PERMS,
  ...ATS_DEPT_HEAD_PERMS,
  ...extraPerms,
];

/**
 * Tổng hợp quyền chuẩn cho vị trí PHÓ PHÒNG / PHÓ GIÁM ĐỐC KHỐI
 * Tự động ghép: Quyền chuyên môn + Quyền hành chính + Quyền ATS Deputy
 */
export const forDeputyHead = (
  domainPerms: string[] = [],
  options: { canApproveLeave?: boolean; extra?: string[] } = {},
): string[] => [
  ...domainPerms,
  options.canApproveLeave
    ? 'leave_request:approve:dept'
    : 'leave_request:create:own',
  ...DEP_HEAD_COMMON_BASE,
  ...ATS_DEP_HEAD_PERMS,
  ...(options.extra || []),
];

/**
 * Tổng hợp quyền chuẩn cho vị trí NHÂN VIÊN CHUYÊN MÔN (STAFF)
 * Tự động ghép: Quyền thao tác cá nhân + Quyền dùng chung của Nhân viên
 */
export const forStaff = (
  domainPerms: string[] = [],
  extraPerms: string[] = [],
): string[] => [...domainPerms, ...STAFF_COMMON_PERMS, ...extraPerms];

/**
 * Helper định nghĩa Role sạch: Tự động gom mảng, làm phẳng (flatten) và lọc trùng lặp
 */
export const defineRole = (
  slug: string,
  name: string,
  ...permissionGroups: (string | string[])[]
): RoleDefinition => ({
  slug,
  name,
  perms: Array.from(new Set(permissionGroups.flat())),
});
