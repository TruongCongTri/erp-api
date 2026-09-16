// ==========================================
// AUDIT LOG ENUMS & INTERFACES
// ==========================================
export type JsonPrimitive = string | number | boolean | null;
export type JsonValue =
  JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export enum ActorRoleLevel {
  SUPER_ADMIN = 'SUPER_ADMIN', // Toàn quyền hệ thống (SUPER_ADMIN)
  SYSTEM_ADMIN = 'SYSTEM_ADMIN', // Quản trị kỹ thuật IT/AI (SYSTEM_ADMIN)
  EXECUTIVE = 'EXECUTIVE', // Ban Tổng Giám đốc & Trợ lý cấp cao (EXEC_*)
  DIRECTOR = 'DIRECTOR', // Giám đốc / Phó Giám đốc Khối (DIR_*, DEP_DIR_*)
  HEAD_DEPT = 'HEAD_DEPT', // Trưởng / Phó phòng (HEAD_*, DEP_HEAD_*)
  STAFF = 'STAFF', // Nhân viên chuyên môn, Kỹ sư, Vận hành (STAFF_*, OPERATOR)
  GUEST = 'GUEST', // Người dùng chưa kích hoạt / Khách (GUEST)
  SYSTEM_SERVICE = 'SYSTEM_SERVICE', // Tiến trình nền, Cron, Worker, Webhook nội bộ
}

export enum AuditActionType {
  CREATE = 'CREATE',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE',
  APPROVE = 'APPROVE',
  REJECT = 'REJECT',
  EXPORT = 'EXPORT',
  IMPORT = 'IMPORT',
  LOGIN = 'LOGIN',
  LOGOUT = 'LOGOUT',
  REVOKE_ACCESS = 'REVOKE_ACCESS',
  PERMISSION_CHANGE = 'PERMISSION_CHANGE',
}

export enum AuditStatus {
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
  WARNING = 'WARNING',
  BLOCKED = 'BLOCKED',
}

export enum AuditClientApp {
  WEB_PORTAL = 'WEB_PORTAL',
  MOBILE_APP = 'MOBILE_APP',
  API_GATEWAY = 'API_GATEWAY',
  BACKGROUND_JOB = 'BACKGROUND_JOB',
}

export enum DiffChangeType {
  CREATED = 'CREATED',
  UPDATED = 'UPDATED',
  DELETED = 'DELETED',
  STATUS_TRANSITION = 'STATUS_TRANSITION',
}

export interface AuditDiffField {
  field: string; // Technical key: "status", "title", "salary"
  label: string; // Localized label: "Trạng thái", "Tiêu đề"
  oldValue: JsonValue;
  newValue: JsonValue;
  oldDisplay: string | null; // Human display: "Chờ duyệt", "15,000,000"
  newDisplay: string | null; // Human display: "Đã duyệt", "20,000,000"
  isSensitive?: boolean; // Masking indicator for payroll/credentials
}

export interface AuditDiffPayload {
  changeType: DiffChangeType;
  fields: AuditDiffField[];
}

export enum ExportJobStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  EXPIRED = 'EXPIRED',
}

export enum RetentionAction {
  COLD_STORAGE_S3 = 'COLD_STORAGE_S3',
  PURGE = 'PURGE',
}

export type AuditDataScope =
  | { type: 'ALL' }
  | { type: 'DEPARTMENT'; departmentId: string; excludeResourceSlug: string }
  | { type: 'OWN'; actorId: string };
