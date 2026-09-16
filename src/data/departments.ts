// src/data/departments.ts

export interface DepartmentSeedData {
  slug: string;
  code: string;
  name: string;
  parentSlug: string | null;
}

export const departmentsData: DepartmentSeedData[] = [
  // ─── 1. Cấp Lãnh đạo & Khối Tham mưu ───
  {
    slug: 'administrative-council',
    code: 'AC',
    name: 'Hội đồng Quản trị',
    parentSlug: null,
  },
  {
    slug: 'board-of-internal-control',
    code: 'BIC',
    name: 'Ban Kiểm soát Nội bộ',
    parentSlug: 'administrative-council',
  },
  {
    slug: 'general-director',
    code: 'BGD',
    name: 'Tổng Giám đốc',
    parentSlug: 'administrative-council', // Chịu trách nhiệm trước HĐQT
  },
  {
    slug: 'assistant-executive-board',
    code: 'AEB',
    name: 'Trợ lý Ban Tổng Giám đốc',
    parentSlug: 'general-director',
  },

  // ─── 2. Các Phó Tổng Giám đốc Điều hành ───
  {
    slug: 'dgd-group-1',
    code: 'DGD-1',
    name: 'Phó Tổng Giám đốc (Nhóm 1)',
    parentSlug: 'general-director',
  },
  {
    slug: 'dgd-group-2',
    code: 'DGD-2',
    name: 'Phó Tổng Giám đốc (Nhóm 2)',
    parentSlug: 'general-director',
  },
  {
    slug: 'dgd-group-3',
    code: 'DGD-3',
    name: 'Phó Tổng Giám đốc (Nhóm 3)',
    parentSlug: 'general-director',
  },
  {
    slug: 'dgd-construction',
    code: 'DGD-CONST',
    name: 'Phó Tổng Giám đốc Khối Thi công',
    parentSlug: 'general-director',
  },
  {
    slug: 'dgd-branch-management',
    code: 'DGD-BRANCH',
    name: 'Phó Tổng Giám đốc Quản lý Chi nhánh',
    parentSlug: 'general-director',
  },

  // ─── 3. Các Phòng ban trực thuộc (Theo Nhánh Phó TGĐ) ───

  // Thuộc Nhóm 1
  {
    slug: 'material-resources',
    code: 'DEPT-MAT',
    name: 'Phòng Vật lực',
    parentSlug: 'dgd-group-1',
  },
  {
    slug: 'safety-quality',
    code: 'DEPT-SQ',
    name: 'Phòng An toàn & Quản lý Chất lượng',
    parentSlug: 'dgd-group-1',
  },
  {
    slug: 'hr-management',
    code: 'DEPT-HRM',
    name: 'Phòng Quản lý Nhân lực', // Chuyên về tuyển dụng, đào tạo, quản trị nhân tài
    parentSlug: 'dgd-group-1',
  },

  // Thuộc Nhóm 2
  {
    slug: 'customer-service',
    code: 'DEPT-CS',
    name: 'Phòng Chăm sóc Khách hàng',
    parentSlug: 'dgd-group-2',
  },
  {
    slug: 'sales-business-dev',
    code: 'DEPT-SALES',
    name: 'Phòng Kinh doanh',
    parentSlug: 'dgd-group-2',
  },
  {
    slug: 'design-division',
    code: 'DIV-DESIGN',
    name: 'Khối Thiết kế',
    parentSlug: 'dgd-group-2',
  },
  {
    slug: 'budgeting-estimation',
    code: 'DEPT-BUDGET',
    name: 'Phòng Dự toán',
    parentSlug: 'dgd-group-2',
  },
  {
    slug: 'communications-center',
    code: 'CTR-MEDIA',
    name: 'Trung tâm Truyền thông',
    parentSlug: 'dgd-group-2',
  },

  // Thuộc Nhóm 3
  {
    slug: 'finance-accounting',
    code: 'DEPT-FIN',
    name: 'Phòng Kế toán',
    parentSlug: 'dgd-group-3',
  },
  {
    slug: 'supply-chain',
    code: 'DEPT-SUPPLY',
    name: 'Phòng Cung ứng',
    parentSlug: 'dgd-group-3',
  },
  {
    slug: 'administration-hr',
    code: 'DEPT-ADMIN',
    name: 'Phòng Hành chính Nhân sự', // Chuyên về C&B, chấm công, hành chính văn phòng
    parentSlug: 'dgd-group-3',
  },
];
