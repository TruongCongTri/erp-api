import {
  defineRole,
  grant,
  forDeptHead,
  forDeputyHead,
  forStaff,
  ATS_HR_FULL_PERMS,
  ATS_VIEWER_PERMS,
  DEPT_HEAD_COMMON_PERMS,
  STAFF_COMMON_PERMS,
} from '../auth/utils/permission-builder';

export const rolesMatrix = [
  // =====================================
  // 1. EXECUTIVE & SYSTEM ADMIN
  // =====================================
  defineRole('SUPER_ADMIN', 'Super Admin', '*:*:any'),
  defineRole('EXEC_DIRECTOR', 'Tổng Giám đốc', '*:*:any'),

  defineRole(
    'DEP_EXEC_DIRECTOR',
    'Phó Tổng Giám đốc',
    '*:create:any',
    '*:update:any',
    '*:read:any',
    'ats_requisition:approve:any',
    'ats_job_post:approve:any',
  ),

  defineRole(
    'EXEC_ASSISTANT',
    'Trợ lý Điều hành',
    '*:read:any',
    'crm:update:dept',
    'meeting:*:any',
    'report:create:own',
    'document:*:dept',
    'task:*:any',
    ATS_VIEWER_PERMS,
  ),

  defineRole(
    'EXEC_ASSISTANT_DESIGN',
    'Thư ký TGĐ (Khối Thiết kế)',
    grant('design', 'read', 'any'),
    grant('mep', 'read', 'any'),
    grant('estimation', 'read', 'any'),
    grant('hr', 'read', 'dept'),
    grant('ats_requisition', 'read', 'dept'),
    grant('ats_job_post', 'read', 'dept'),
    'meeting:*:dept',
    'report:create:own',
    'document:*:dept',
    'task:*:dept',
    'leave_request:create:own',
    'policy:read:any',
  ),

  defineRole(
    'SYSTEM_ADMIN',
    'Quản trị Hệ thống (IT/AI)',
    'it_system:*:any',
    '*:read:any',
    'audit_log:read:any',
    'policy:manage:any',
    'task:*:any',
  ),

  // =====================================
  // 2. HUMAN RESOURCES (HR PILLAR)
  // =====================================
  defineRole(
    'DIR_HR_ADMIN',
    'Giám Đốc Hành chính Nhân sự',
    'hr:*:any',
    // Toàn quyền vận hành Publishing Automation: quản lý tài khoản Facebook
    // (bao gồm xác minh lại checkpoint), duyệt/điều phối đăng tin đa kênh.
    'publishing_automation:*:any',
    grant('asset', 'read', 'any'),
    grant('audit_log', 'read', 'dept'),
    grant('audit_log', 'read', 'own'),
    DEPT_HEAD_COMMON_PERMS,
    ATS_HR_FULL_PERMS,
  ),

  defineRole(
    'DEP_DIR_HR_ADMIN',
    'Phó Giám Đốc Hành chính Nhân sự',
    grant('hr', ['create', 'update', 'read'], 'dept'),
    // Cùng quyền vận hành như Giám đốc: đăng tin tuyển dụng đa kênh không bị
    // giới hạn theo phòng ban.
    'publishing_automation:*:any',
    grant('asset', 'read', 'any'),
    grant('audit_log', 'read', 'dept'),
    grant('audit_log', 'read', 'own'),
    DEPT_HEAD_COMMON_PERMS,
    ATS_HR_FULL_PERMS,
  ),

  defineRole(
    'STAFF_HR',
    'Nhân viên Hành chính Nhân sự',
    grant('hr', 'create', 'dept'),
    grant('hr', 'update', 'own'),
    grant('hr', 'read', 'dept'),
    grant('ats_requisition', ['read', 'update'], 'any'),
    grant('audit_log', 'read', 'own'),
    'ats_job_post:*:any',
    'ats_candidate:*:any',
    // Chuyên viên tuyển dụng: được tạo/xem/chỉnh sửa lịch đăng tin & nhóm
    // Facebook hằng ngày, nhưng không có quyền "manage" cấp cao (ví dụ: các
    // thao tác vận hành nhạy cảm nên dành cho cấp Giám đốc/Phó Giám đốc).
    grant('publishing_automation', ['create', 'read', 'update'], 'any'),
    STAFF_COMMON_PERMS,
  ),

  // =====================================
  // 3. FINANCE & ACCOUNTING
  // =====================================
  defineRole(
    'DIR_ACCOUNTING',
    'Giám đốc Tài chính',
    forDeptHead(grant('finance', '*', 'any'), [
      ...grant('contract', 'read', 'any'),
      ...grant('supply', 'read', 'any'),
      ...grant('hr', 'read', 'any'),
    ]),
  ),

  defineRole(
    'DEP_HEAD_ACCOUNTING',
    'Phó phòng Tài chính Kế toán',
    forDeputyHead(
      [
        ...grant('finance', ['create', 'update'], 'dept'),
        ...grant('finance', 'read', 'any'),
      ],
      { canApproveLeave: false },
    ),
  ),

  defineRole(
    'STAFF_ACCOUNTING',
    'Nhân viên Kế toán',
    forStaff([
      ...grant('finance', 'create', 'dept'),
      ...grant('finance', 'update', 'own'),
      ...grant('finance', 'read', 'dept'),
    ]),
  ),

  // =====================================
  // 4. PROCUREMENT & ASSETS
  // =====================================
  defineRole(
    'HEAD_SUPPLY',
    'Trưởng phòng Cung ứng',
    forDeptHead(grant('supply', '*', 'dept'), [
      ...grant('asset', 'update', 'any'),
      ...grant('finance', 'read', 'own'),
      ...grant('design', 'read', 'any'),
      ...grant('estimation', 'read', 'any'),
      ...grant('construction', 'read', 'any'),
    ]),
  ),

  defineRole(
    'DEP_HEAD_SUPPLY',
    'Phó phòng Cung ứng',
    forDeputyHead(grant('supply', ['create', 'update', 'read'], 'dept'), {
      canApproveLeave: false,
      extra: grant('asset', 'update', 'dept'),
    }),
  ),

  defineRole(
    'STAFF_SUPPLY',
    'Nhân viên Cung ứng & Thủ kho',
    forStaff([
      ...grant('supply', ['create', 'update'], 'own'),
      ...grant('supply', 'read', 'dept'),
      ...grant('asset', 'update', 'dept'),
      ...grant('asset', 'read', 'dept'),
    ]),
  ),

  defineRole(
    'HEAD_ASSET',
    'Trưởng phòng Vật lực',
    forDeptHead(grant('asset', '*', 'dept'), grant('supply', 'read', 'dept')),
  ),

  defineRole(
    'DEP_HEAD_ASSET',
    'Phó phòng Vật lực',
    forDeputyHead(grant('asset', ['create', 'update', 'delete'], 'dept'), {
      canApproveLeave: true,
      extra: [
        ...grant('supply', 'read', 'dept'),
        ...grant('report', 'read', 'dept'),
      ],
    }),
  ),

  defineRole(
    'OPERATOR',
    'Khối Vận hành & Hậu cần',
    grant('asset', ['read', 'update'], 'own'),
    grant('hr', 'read', 'own'),
    'leave_request:create:own',
    'task:*:own',
    'policy:read:any',
  ),

  // =====================================
  // 5. SALES, CRM & MEDIA
  // =====================================
  defineRole(
    'HEAD_SALES',
    'Trưởng phòng Kinh doanh / CSKH',
    forDeptHead([
      ...grant('crm', '*', 'dept'),
      ...grant('contract', '*', 'dept'),
    ]),
  ),

  defineRole(
    'DEP_HEAD_SALES',
    'Phó phòng Kinh doanh / CSKH',
    forDeputyHead(
      [
        ...grant('crm', ['create', 'update', 'read'], 'dept'),
        ...grant('contract', ['create', 'update', 'read'], 'dept'),
      ],
      { canApproveLeave: true, extra: grant('report', 'read', 'dept') },
    ),
  ),

  defineRole(
    'STAFF_SALES',
    'Nhân viên Kinh doanh & CSKH',
    forStaff([
      ...grant('crm', ['create', 'update'], 'own'),
      ...grant('crm', 'read', 'dept'),
      ...grant('contract', 'create', 'own'),
      ...grant('contract', 'read', 'dept'),
    ]),
  ),

  defineRole(
    'HEAD_MEDIA',
    'Trưởng TT Truyền thông',
    forDeptHead(grant('media', '*', 'dept'), grant('crm', 'read', 'dept')),
  ),

  defineRole(
    'DEP_HEAD_MEDIA',
    'Phó TT Truyền thông',
    forDeputyHead(grant('media', ['create', 'update', 'read'], 'dept'), {
      canApproveLeave: true,
      extra: [
        ...grant('crm', 'read', 'dept'),
        ...grant('report', 'read', 'dept'),
      ],
    }),
  ),

  defineRole(
    'STAFF_MEDIA',
    'Nhân viên Truyền thông',
    forStaff([
      ...grant('media', ['create', 'update'], 'own'),
      ...grant('media', 'read', 'dept'),
    ]),
  ),

  // =====================================
  // 6. PRE-CONSTRUCTION (Design, MEP, Estimation)
  // =====================================
  defineRole(
    'DIR_DESIGN',
    'Giám đốc Khối Thiết kế',
    forDeptHead(grant('design', '*', 'dept'), [
      ...grant('mep', 'read', 'any'),
      ...grant('estimation', 'read', 'any'),
      ...grant('construction', 'read', 'any'),
    ]),
  ),

  defineRole(
    'DEP_DIR_DESIGN',
    'Phó Giám đốc Khối Thiết kế',
    forDeputyHead(grant('design', ['create', 'update', 'read'], 'dept'), {
      canApproveLeave: true,
      extra: [
        ...grant('mep', 'read', 'any'),
        ...grant('estimation', 'read', 'any'),
        ...grant('construction', 'read', 'any'),
        ...grant('report', 'read', 'dept'),
      ],
    }),
  ),

  defineRole(
    'HEAD_ARCHITECTURE',
    'Trưởng phòng Kiến trúc',
    forDeptHead(
      grant('design', ['create', 'update', 'delete', 'read'], 'dept'),
      grant('mep', 'read', 'any'),
    ),
  ),

  defineRole(
    'DEP_HEAD_ARCHITECTURE',
    'Phó phòng Kiến trúc',
    forDeputyHead(grant('design', ['create', 'update', 'delete'], 'dept'), {
      canApproveLeave: true,
      extra: grant('mep', 'read', 'any'),
    }),
  ),

  defineRole(
    'STAFF_ARCHITECTURE',
    'Nhân viên Kiến trúc',
    forStaff([
      ...grant('design', ['create', 'update'], 'own'),
      ...grant('design', 'read', 'dept'),
      ...grant('mep', 'read', 'dept'),
    ]),
  ),

  defineRole(
    'STAFF_INTERIOR',
    'Nhân viên Thiết kế nội thất',
    forStaff([
      ...grant('design', ['create', 'update'], 'own'),
      ...grant('design', 'read', 'dept'),
    ]),
  ),

  defineRole(
    'HEAD_STRUCTURE',
    'Trưởng phòng Kết cấu',
    forDeptHead(
      grant('design', ['create', 'update', 'read'], 'dept'),
      grant('estimation', 'read', 'dept'),
    ),
  ),

  defineRole(
    'DEP_HEAD_STRUCTURE',
    'Phó phòng Kết cấu',
    forDeputyHead(grant('design', ['create', 'update', 'read'], 'dept'), {
      canApproveLeave: true,
      extra: grant('estimation', 'read', 'dept'),
    }),
  ),

  defineRole(
    'STAFF_STRUCTURE',
    'Nhân viên Kết cấu',
    forStaff([
      ...grant('design', ['create', 'update'], 'own'),
      ...grant('design', 'read', 'dept'),
    ]),
  ),

  defineRole(
    'DIR_MEP',
    'Giám đốc Khối Cơ điện',
    forDeptHead(grant('mep', '*', 'dept'), [
      ...grant('design', 'read', 'any'),
      ...grant('supply', 'read', 'any'),
      ...grant('construction', 'read', 'any'),
    ]),
  ),

  defineRole(
    'DEP_DIR_MEP',
    'Phó Giám đốc Khối Cơ điện',
    forDeputyHead(grant('mep', ['create', 'update', 'read'], 'dept'), {
      canApproveLeave: true,
      extra: [
        ...grant('design', 'read', 'any'),
        ...grant('supply', 'read', 'any'),
        ...grant('construction', 'read', 'any'),
        ...grant('report', 'read', 'dept'),
      ],
    }),
  ),

  defineRole(
    'STAFF_MEP',
    'Nhân viên Cơ điện',
    forStaff([
      ...grant('mep', ['create', 'update'], 'own'),
      ...grant('mep', 'read', 'dept'),
      ...grant('design', 'read', 'dept'),
    ]),
  ),

  defineRole(
    'HEAD_ESTIMATION',
    'Trưởng phòng Dự toán',
    forDeptHead(grant('estimation', '*', 'dept'), [
      ...grant('design', 'read', 'any'),
      ...grant('mep', 'read', 'any'),
      ...grant('construction', 'read', 'any'),
    ]),
  ),

  defineRole(
    'DEP_HEAD_ESTIMATION',
    'Phó phòng Dự toán',
    forDeputyHead(grant('estimation', ['create', 'update', 'read'], 'dept'), {
      canApproveLeave: true,
      extra: [
        ...grant('design', 'read', 'any'),
        ...grant('mep', 'read', 'any'),
        ...grant('construction', 'read', 'any'),
        ...grant('report', 'read', 'dept'),
      ],
    }),
  ),

  defineRole(
    'STAFF_ESTIMATION',
    'Nhân viên Dự toán',
    forStaff([
      ...grant('estimation', ['create', 'update'], 'own'),
      ...grant('estimation', 'read', 'dept'),
      ...grant('design', 'read', 'dept'),
      ...grant('mep', 'read', 'dept'),
    ]),
  ),

  // =====================================
  // 7. CONSTRUCTION (Execution)
  // =====================================
  defineRole(
    'DIR_CONSTRUCTION',
    'Giám đốc Khối Thi công',
    forDeptHead(grant('construction', '*', 'dept'), [
      ...grant('design', 'read', 'any'),
      ...grant('mep', 'read', 'any'),
      ...grant('estimation', 'read', 'any'),
      ...grant('asset', 'read', 'any'),
      ...grant('finance', 'read', 'any'),
    ]),
  ),

  defineRole(
    'DEP_DIR_CONSTRUCTION',
    'Phó Giám đốc Khối Thi công',
    forDeputyHead(grant('construction', ['create', 'update', 'read'], 'dept'), {
      canApproveLeave: true,
      extra: [
        ...grant('design', 'read', 'dept'),
        ...grant('mep', 'read', 'dept'),
      ],
    }),
  ),

  defineRole(
    'STAFF_SITE_ENGINEER',
    'Kỹ sư Xây dựng / Thi công',
    forStaff([
      ...grant('construction', ['create', 'update'], 'own'),
      ...grant('construction', 'read', 'dept'),
      ...grant('design', 'read', 'dept'),
      ...grant('mep', 'read', 'dept'),
    ]),
  ),

  // =====================================
  // 8. GUEST / ONBOARDING
  // =====================================
  defineRole('GUEST', 'Khách / Chờ phân quyền', 'news_feed:read:any'),
];
