// audit-action.decorator.ts
/**
 * This decorator allows attaching specific actions and resources
 * to route handlers so the interceptor knows exactly what business process is occurring.
 *
 * */
import { SetMetadata } from '@nestjs/common';
import { AuditActionType } from './audit-log.types';

export const AUDIT_ACTION_KEY = 'audit_action_meta';

export interface AuditActionMetadata {
  actionType: AuditActionType;
  actionLabel: string;
  resourceSlug: string;
  resourceLabel: string;
  /**
   * Tên tham số trong URL (Param) chứa ID của đối tượng mục tiêu. VD: 'id', 'requestId'
   */
  targetEntityIdParam?: string;
}

export const AuditAction = (metadata: AuditActionMetadata) =>
  SetMetadata(AUDIT_ACTION_KEY, metadata);
