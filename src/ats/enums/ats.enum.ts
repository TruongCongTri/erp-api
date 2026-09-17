export enum RecruitmentRequestStatus {
  PENDING_HR = 'PENDING_HR',
  DRAFTED = 'DRAFTED',
  PENDING_HEAD_APPROVAL = 'PENDING_HEAD_APPROVAL',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

export enum JobPostStatus {
  DRAFT = 'DRAFT',
  PENDING_HEAD_APPROVAL = 'PENDING_HEAD_APPROVAL',
  PUBLISHED = 'PUBLISHED',
  CLOSED = 'CLOSED',
  ARCHIVED = 'ARCHIVED',
}

export enum JobPostCreationMethod {
  MANUAL = 'MANUAL',
  FROM_TEMPLATE = 'FROM_TEMPLATE',
  AI_SUGGESTION = 'AI_SUGGESTION',
}

export enum JobLevel {
  INTERN = 'INTERN',
  FRESHER = 'FRESHER',
  JUNIOR = 'JUNIOR',
  MIDDLE = 'MIDDLE',
  SENIOR = 'SENIOR',
  LEAD = 'LEAD',
  MANAGER = 'MANAGER',
  DIRECTOR = 'DIRECTOR',
}

export enum JobType {
  FULL_TIME = 'FULL_TIME',
  PART_TIME = 'PART_TIME',
  CONTRACT = 'CONTRACT',
  SEASONAL = 'SEASONAL',
}

export enum WorkingModel {
  ON_SITE = 'ON_SITE',
  HYBRID = 'HYBRID',
  REMOTE = 'REMOTE',
}

export enum EducationLevel {
  HIGH_SCHOOL = 'HIGH_SCHOOL',
  VOCATIONAL = 'VOCATIONAL',
  COLLEGE = 'COLLEGE',
  BACHELOR = 'BACHELOR',
  MASTER = 'MASTER',
  DOCTORATE = 'DOCTORATE',
  NOT_REQUIRED = 'NOT_REQUIRED',
}

export enum CandidateGender {
  ANY = 'ANY',
  MALE = 'MALE',
  FEMALE = 'FEMALE',
}

export enum PlatformSource {
  COMPANY_WEBSITE = 'COMPANY_WEBSITE',
  LINKEDIN = 'LINKEDIN',
  TOPCV = 'TOPCV',
  VIETNAMWORKS = 'VIETNAMWORKS',
  CAREERVIET = 'CAREERVIET',
  FACEBOOK = 'FACEBOOK',
  ZALO = 'ZALO',
  REFERRAL = 'REFERRAL',
  MANUAL_ENTRY = 'MANUAL_ENTRY',
}

export enum ApplicationPhase {
  APPLIED = 'APPLIED',
  AI_SCREENING = 'AI_SCREENING',
  SCREENING_FAILED = 'SCREENING_FAILED', // Lỗi kỹ thuật (S3/AI) khi sàng lọc - chờ HR bấm chấm điểm lại thủ công
  SHORTLISTED = 'SHORTLISTED', // High Tier (score >= 80)
  SAVED_POOL = 'SAVED_POOL', // Middle Tier (score 50 - 79)
  SCREENING_REJECTED = 'SCREENING_REJECTED', // Low Tier (score < 50)
  INTERVIEWING = 'INTERVIEWING',
  OFFERED = 'OFFERED',
  HIRED = 'HIRED',
  WITHDRAWN = 'WITHDRAWN',
}

export enum AiScreeningTier {
  HIGH = 'HIGH', // Auto-suggest to proceed
  MEDIUM = 'MEDIUM', // Reserved pool
  LOW = 'LOW', // Removed from active pipeline, kept for audit
  NOT_AVAILABLE = 'N/A', // AI không chấm được (lỗi kỹ thuật / JD không đủ tiêu chí) - KHÔNG bao giờ lưu điểm mặc định
}

export enum CvStorageLocation {
  S3 = 'S3',
  LOCAL_PENDING = 'LOCAL_PENDING', // Upload S3 thất bại, tệp đang tạm lưu trên đĩa cục bộ chờ retry
}
