// src/common/interfaces/authenticated-user.interface.ts

import { ActorRoleLevel } from 'src/audit-log/audit-log.types';

export interface AuthenticatedUser {
  id: string;
  organizationId: string;
  departmentId: string;
  fullName: string;
  roleLevel: ActorRoleLevel;
  email: string;
}
