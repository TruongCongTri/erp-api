// ==========================================
// ENUMS & TYPES
// ==========================================

export enum NotificationCategory {
  TASK = 'TASK',
  APPROVAL = 'APPROVAL',
  SYSTEM = 'SYSTEM',
  ALERT = 'ALERT',
  ANNOUNCEMENT = 'ANNOUNCEMENT',
}

export enum NotificationPriority {
  LOW = 'LOW',
  NORMAL = 'NORMAL',
  HIGH = 'HIGH',
  URGENT = 'URGENT',
}

export enum ActorType {
  USER = 'USER',
  SYSTEM_CRON = 'SYSTEM_CRON',
  WORKFLOW_ENGINE = 'WORKFLOW_ENGINE',
  THIRD_PARTY_WEBHOOK = 'THIRD_PARTY_WEBHOOK',
}

export enum ActionState {
  NONE = 'NONE',
  PENDING = 'PENDING',
  RESOLVED = 'RESOLVED',
  EXPIRED = 'EXPIRED',
}

export enum DeliveryChannel {
  IN_APP = 'IN_APP',
  PUSH = 'PUSH',
  EMAIL = 'EMAIL',
  ZALO_ZNS = 'ZALO_ZNS',
}
