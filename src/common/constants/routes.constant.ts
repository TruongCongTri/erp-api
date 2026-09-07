export const ROUTES = {
  // Base prefixes
  API_V1: 'api/v1',
  GENERAL: {
    ID: ':id',
    SLUG: ':slug',
    AVAILABLE: 'available',
    TOGGLE_STATUS: ':id/status',
    RESTORE: ':id/restore',
    RECYCLE_BIN: 'recycle-bin',
  },
  AUTH: {
    BASE: 'auth',
    LOGIN: 'login',
    REGISTER: 'register',
    FORGOT_PASSWORD: 'forgot-password',
    RESET_PASSWORD: 'reset-password',
    CHANGE_PASSWORD: 'change-password',
    REFRESH: 'refresh',
    VERIFY_OTP: 'otp/verify',
    SEND_OTP: 'otp/send',
    GOOGLE: 'google',
    SESSION: 'sessions',
    SESSION_ID: 'sessions/:sessionId',
  },

  USERS: {
    BASE: 'users',
    GET_ME: 'me',
    UPDATE_PROFILE: ':id/profile',
    ACCESS: ':id/access',
  },

  ADMIN: {
    TASKS: {
      BASE: 'admin/tasks',
      STATUS: ':name/status',
      TRIGGER: ':name/trigger',
    },
  },

  ADDRESS: {
    BASE: 'address',
    SUGGEST: 'suggest', // GET
    CONVERT: 'convert-structured', // GET
    PROVINCES: 'provinces', // GET
    WARDS: 'provinces/:code/wards', // GET
  },

  NOTI: {
    BASE: 'notifications',
    READ_ALL: 'read-all',
    READ_DETAIL: ':id/read',
  },

  RESOURCE: {
    BASE: 'resources',
  },
  PERMISSION: {
    BASE: 'permissions',
    GROUP: 'permissions/grouped',
  },
  ROLE: {
    BASE: 'roles',
    PERMS: ':id/permissions',
    USERS: ':id/users',
  },
} as const; // 'as const' makes it strictly typed and immutable
