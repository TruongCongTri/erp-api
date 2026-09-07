// src/auth/types/jwt-user.type.ts
export interface JwtUser {
  id: string;
  email: string;
  roleSlug?: string;
  permissions: string[];
}
