// src/users/enums/user-status.enum.ts
export enum UserStatus {
  PENDING_VERIFICATION = 'PENDING_VERIFICATION', // Mới đăng ký, chờ xác thực OTP
  PENDING_APPROVAL = 'PENDING_APPROVAL', // Profile Claim approval
  ACTIVE = 'ACTIVE', // Đang làm việc / Đã xác thực
  ON_LEAVE = 'ON_LEAVE', // Nghỉ dài hạn / Thai sản
  RESIGNED = 'RESIGNED', // Đã nghỉ việc
}
