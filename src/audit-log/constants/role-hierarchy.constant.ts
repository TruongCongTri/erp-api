// src/modules/audit-log/constants/role-hierarchy.constant.ts
import { ActorRoleLevel } from '../audit-log.types';

export const ROLE_SLUG_TO_LEVEL: Record<string, ActorRoleLevel> = {
  // Global & IT
  SUPER_ADMIN: ActorRoleLevel.SUPER_ADMIN,
  SYSTEM_ADMIN: ActorRoleLevel.SYSTEM_ADMIN,

  // 1. Executive & Support
  EXEC_DIRECTOR: ActorRoleLevel.EXECUTIVE,
  DEP_EXEC_DIRECTOR: ActorRoleLevel.EXECUTIVE,
  EXEC_ASSISTANT: ActorRoleLevel.EXECUTIVE,
  EXEC_ASSISTANT_DESIGN: ActorRoleLevel.EXECUTIVE,
  DIR_HR_ADMIN: ActorRoleLevel.DIRECTOR,
  DEP_DIR_HR_ADMIN: ActorRoleLevel.DIRECTOR,
  STAFF_HR: ActorRoleLevel.STAFF,

  // 2. Finance & Accounting
  DIR_ACCOUNTING: ActorRoleLevel.DIRECTOR,
  DEP_HEAD_ACCOUNTING: ActorRoleLevel.HEAD_DEPT,
  STAFF_ACCOUNTING: ActorRoleLevel.STAFF,

  // 3. Procurement & Assets
  HEAD_SUPPLY: ActorRoleLevel.HEAD_DEPT,
  DEP_HEAD_SUPPLY: ActorRoleLevel.HEAD_DEPT,
  STAFF_SUPPLY: ActorRoleLevel.STAFF,
  HEAD_ASSET: ActorRoleLevel.HEAD_DEPT,
  DEP_HEAD_ASSET: ActorRoleLevel.HEAD_DEPT,
  OPERATOR: ActorRoleLevel.STAFF,

  // 4. Sales, CRM & Media
  HEAD_SALES: ActorRoleLevel.HEAD_DEPT,
  DEP_HEAD_SALES: ActorRoleLevel.HEAD_DEPT,
  STAFF_SALES: ActorRoleLevel.STAFF,
  HEAD_MEDIA: ActorRoleLevel.HEAD_DEPT,
  DEP_HEAD_MEDIA: ActorRoleLevel.HEAD_DEPT,
  STAFF_MEDIA: ActorRoleLevel.STAFF,

  // 5. Pre-Construction (Design, MEP, Estimation)
  DIR_DESIGN: ActorRoleLevel.DIRECTOR,
  DEP_DIR_DESIGN: ActorRoleLevel.DIRECTOR,
  HEAD_ARCHITECTURE: ActorRoleLevel.HEAD_DEPT,
  DEP_HEAD_ARCHITECTURE: ActorRoleLevel.HEAD_DEPT,
  STAFF_ARCHITECTURE: ActorRoleLevel.STAFF,
  STAFF_INTERIOR: ActorRoleLevel.STAFF,
  HEAD_STRUCTURE: ActorRoleLevel.HEAD_DEPT,
  DEP_HEAD_STRUCTURE: ActorRoleLevel.HEAD_DEPT,
  STAFF_STRUCTURE: ActorRoleLevel.STAFF,
  DIR_MEP: ActorRoleLevel.DIRECTOR,
  DEP_DIR_MEP: ActorRoleLevel.DIRECTOR,
  STAFF_MEP: ActorRoleLevel.STAFF,
  HEAD_ESTIMATION: ActorRoleLevel.HEAD_DEPT,
  DEP_HEAD_ESTIMATION: ActorRoleLevel.HEAD_DEPT,
  STAFF_ESTIMATION: ActorRoleLevel.STAFF,

  // 6. Construction
  DIR_CONSTRUCTION: ActorRoleLevel.DIRECTOR,
  DEP_DIR_CONSTRUCTION: ActorRoleLevel.DIRECTOR,
  STAFF_SITE_ENGINEER: ActorRoleLevel.STAFF,

  // 7. Guest
  GUEST: ActorRoleLevel.GUEST,
};

export function resolveActorRoleLevel(roleSlug?: string): ActorRoleLevel {
  if (!roleSlug) return ActorRoleLevel.GUEST;
  return ROLE_SLUG_TO_LEVEL[roleSlug.toUpperCase()] ?? ActorRoleLevel.STAFF;
}
