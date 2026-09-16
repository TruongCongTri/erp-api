import { CreateClientAuditEventDto } from './create-client-audit-event.dto';
import { ActorRoleLevel } from '../audit-log.types';

export class SaveAuditLogDto extends CreateClientAuditEventDto {
  // Injected from verified Request session / JWT
  actorId!: string;
  actorName!: string;
  actorInitials!: string;
  actorAvatarUrl?: string | null;
  actorDepartmentId!: string;
  actorRoleLevel!: ActorRoleLevel;
  roleSlug?: string | null;
  actorTitle!: string;
  impersonatedBy?: string | null;

  // Injected from TCP connection / Cloudflare headers
  ipAddress!: string;
  userAgent!: string;

  // Narrowing Inherited Properties
  declare trackingCode: string;
  declare correlationId: string;
}
