// src/permissions/enums/permission-action.enum.ts
export enum PermissionAction {
  CREATE = 'create',
  READ = 'read',
  UPDATE = 'update',
  DELETE = 'delete',

  // Custom ERP Actions
  MANAGE = 'manage', // Full control over a specific domain (e.g., policies)
  APPROVE = 'approve', // Workflow approvals (e.g., budgets, contracts, POs)
  AUDIT = 'audit', // Deep financial/system inspection
  PROCESS = 'process', // Executing workflows (e.g., invoices)
  ALL = '*', // Wildcard
}
