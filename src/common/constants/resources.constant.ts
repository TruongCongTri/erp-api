export const RESOURCES = {
  // Domain: Users
  USER: {
    BASE: 'User',
    PLURAL: 'Users',
    PROFILE: 'User profile',
  },

  // Domain: Address
  ADDRESS: {
    BASE: 'Address',
    PLURAL: 'Addresses',

    // Sub-resources
    PROVINCE: 'Province',
    PROVINCES: 'Provinces',

    DISTRICT: 'District',
    DISTRICTS: 'Districts',

    WARD: 'Ward',
    WARDS: 'Wards',

    SUGGESTION: 'Address suggestion',
    SUGGESTIONS: 'Address suggestions',
  },

  // Domain: Auth
  AUTH: {
    BASE: 'Authentication',
    SESSION: 'Session',
  },

  NOTI: {
    BASE: 'Notification',
    PLURAL: 'Notifications',
  },

  PERMISSION: {
    BASE: 'Permission',
    PLURAL: 'Permissions',
    GROUP: 'Grouped permission',
    GROUP_PLURAL: 'Grouped permissions',
  },
  RESOURCE: {
    BASE: 'Resource',
    PLURAL: 'Resources',
    SYSTEM: 'System resource',
    SYSTEM_PLURAL: 'System resources',
  },
  ROLE: {
    BASE: 'Role',
    PLURAL: 'Roles',
    SYSTEM: 'System role',
    SYSTEM_PLURAL: 'System roles',
  },
  EMPLOYEE: {
    BASE: 'Employee',
  },
} as const;
