// ==========================================
// 1. ATS PERMISSION BUNDLES
// ==========================================

/** Quyền ATS dành cho Trưởng/Phó phòng ban chuyên môn */
export const ATS_DEPT_HEAD_PERMS = [
  'ats_requisition:create:dept',
  'ats_requisition:update:dept',
  'ats_requisition:read:dept',
  'ats_job_post:approve:dept',
  'ats_job_post:read:dept',
  'ats_candidate:read:dept',
] as const;

/** Quyền ATS toàn quyền cho Ban Giám đốc Nhân sự & Tuyển dụng */
export const ATS_HR_FULL_PERMS = [
  'ats_requisition:*:any',
  'ats_job_post:*:any',
  'ats_candidate:*:any',
] as const;

/** Quyền ATS cơ bản cho Trợ lý / Thư ký theo dõi */
export const ATS_VIEWER_PERMS = [
  'ats_requisition:read:any',
  'ats_job_post:read:any',
  'ats_candidate:read:any',
] as const;

// ==========================================
// 2. CORE DEPARTMENT HEAD BUNDLE (Ngoại trừ ATS)
// ==========================================

/** Gói quyền quản trị hành chính chung mà mọi Trưởng phòng đều có */
export const DEPT_HEAD_COMMON_PERMS = [
  'leave_request:approve:dept',
  'document:*:dept',
  'meeting:*:dept',
  'report:read:dept',
  'task:*:dept',
  'policy:read:any',
] as const;

/** Gói quyền cơ bản của mọi Nhân viên (Staff) */
export const STAFF_COMMON_PERMS = [
  'document:create:own',
  'document:read:dept',
  'leave_request:create:own',
  'task:*:own',
  'meeting:read:dept',
  'policy:read:any',
] as const;
