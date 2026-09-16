// audit.config.ts
export interface AuditLogOptions {
  recordNavigations: boolean;
  recordSuccesses: boolean;
  recordErrors: boolean;
  recordUnauthorized: boolean;
}

// Default configuration (can be mapped to process.env in your ConfigModule)
export const defaultAuditOptions: AuditLogOptions = {
  recordNavigations: process.env.AUDIT_LOG_NAV === 'true', // Next.js FE routing
  recordSuccesses: process.env.AUDIT_LOG_SUCCESS !== 'false', // Defaults to true
  recordErrors: process.env.AUDIT_LOG_ERRORS !== 'false', // Defaults to true
  recordUnauthorized: process.env.AUDIT_LOG_UNAUTH !== 'false', // Defaults to true
};
