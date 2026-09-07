export const MESSAGES = {
  SUCCESS: {
    OK: 'Operation successful',
    CREATED: (resource: string) => `${resource} created successfully`,
    UPDATED: (resource: string, field?: string) =>
      field
        ? `${resource} ${field.toLowerCase()} updated successfully`
        : `${resource} updated successfully`,

    DELETED: (resource: string) => `${resource} deleted successfully`,

    RETRIEVED: (resource: string, context?: 'details' | 'available') => {
      if (context === 'details')
        return `${resource} details retrieved successfully`;
      if (context === 'available')
        return `Available ${resource} retrieved successfully`;
      return `${resource} retrieved successfully`;
    },
    ASSIGN: (resource: string, field?: string) =>
      field
        ? `${resource} assigned to ${field.toLowerCase()} successfully`
        : `${resource} assigned successfully`,
    ADDRESS: {
      CONVERTED: 'Structured address converted successfully',
    },
    NOTI: {
      READ: 'Marked as read',
      ALL_READ: 'All marked as read',
    },
    USER: {
      REVOKE: 'User marked as resigned and access revoked',
    },
  },
  AUTH: {
    LOGIN_SUCCESS: 'Logged in successfully',
    LOGOUT_SUCCESS: 'Logged out successfully',
    OTP_SENT: 'Verification OTP has been sent',
    OTP_VERIFIED: 'OTP verified successfully',
  },
  TASKS: {
    STATUS_RETRIEVED: 'Cron jobs status retrieved',
    TRIGGER_STARTED: 'Background execution started',
  },
  ERROR: {
    NOT_FOUND: (resource: string, id?: string | number) =>
      id ? `${resource} with ID ${id} not found` : `${resource} not found`,
    ALREADY_EXISTS: (
      resource: string,
      field?: string,
      value?: string | number,
    ) =>
      field && value
        ? `${resource} ${field} '${value}' already exists.`
        : `${resource} already exists.`,
    IN_USE: (resource: string) =>
      `Cannot delete. ${resource} is currently assigned.`,
    DEFAULT: (resource: string) => `Cannot delete a default ${resource}.`,
    HAS_DEPENDENCIES: (
      resource: string,
      name: string,
      count: number,
      dependency: string,
    ) =>
      `Cannot delete ${resource} '${name}' because it has ${count} ${dependency}(s) attached to it.`,
    ACTION_DENIED_IN_USE: (
      action: string,
      resource: string,
      count: number,
      dependency: string,
    ) => `Cannot ${action}. ${resource} is used by ${count} ${dependency}(s).`,
    ASSIGNMENT_DENIED_STATE: (child: string, state: string, parent: string) =>
      `Cannot assign ${child.toLowerCase()} to a ${state} ${parent.toLowerCase()}.`,

    INVALID_REQUEST: 'Invalid request',
    TOO_MANY_REQUESTS: 'You are making requests too quickly. Please wait.',

    AUTH: {
      INVALID_CREDENTIALS: 'Invalid email or password',
      INVALID_OTP: 'Invalid or expired OTP',
      INVALID_REFRESH: 'Invalid refresh token',
      SESSION_REVOKED: 'Session revoked',
      INCORRECT_OLD_PASSWORD: 'Incorrect old password',
      ZALO_PHONE_REQUIRED: 'Phone number is required for Zalo OTP',
      REGISTERED: 'Email already registered.',
      ACC_DISABLE: 'Account disabled',
    },

    PERMISSIONS: {
      CANNOT_ASSIGN: 'Cannot assign a drafted resource.',
      CANNOT_DELETE: 'Cannot delete default system permission.',
    },
    USER: {
      NO_PROFILE: 'User does not have an attached HR profile.',
    },
    ROLE: {
      UNAVAILABLE: 'Role not found or is drafted.',
    },
    VALIDATION: {
      PARSE_FAILED: (resource: string) => `Could not parse ${resource}.`,
      TOO_SHORT: (field: string, minLength?: number) =>
        `${field} is too short${minLength ? ` (minimum ${minLength} characters)` : ''}.`,
      REQUIRED_FIELDS: (fields: string[]) =>
        `${fields.join(', ')} ${fields.length === 1 ? 'is' : 'are'} required.`,

      ADDRESS: {
        TOO_SHORT_TO_PARSE:
          'Address text is too short to reliably extract location components.',
        UNRESOLVABLE:
          'The provided address could not be resolved to a physical geographical location.',
      },
      AUTH: {},
    },
  },
} as const;
