import { DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';

import { typeOrmConfigFactory } from 'src/config/typeorm.config';
import { RecruitmentRequest } from 'src/ats/entities/recruitment-request.entity';
import { JobPost } from 'src/ats/entities/job-post.entity';
import { CandidateProfile } from 'src/ats/entities/candidate-profile.entity';
import { JobApplication } from 'src/ats/entities/job-application.entity';
import { ApplicationSubmission } from 'src/ats/entities/application-submission.entity';
import { Department } from 'src/departments/entities/department.entity';
import { User } from 'src/users/entities/users.entity';
import {
  RecruitmentRequestStatus,
  JobPostStatus,
  JobPostCreationMethod,
  ApplicationPhase,
  PlatformSource,
  JobLevel,
  JobType,
  WorkingModel,
  EducationLevel,
  CandidateGender,
  AiScreeningTier,
} from 'src/ats/enums/ats.enum';

// ─── 1. MOCK CONFIG SERVICE TƯƠNG TỰ SEED.TS ──────────────────────────────────
const mockConfigService = {
  get: <T>(key: string, defaultValue?: T): T => {
    const envValue = process.env[key];
    if (envValue !== undefined) {
      if (typeof defaultValue === 'number') {
        return parseInt(envValue, 10) as unknown as T;
      }
      return envValue as unknown as T;
    }
    return defaultValue as T;
  },
} as unknown as ConfigService;

const dataSource = new DataSource(typeOrmConfigFactory(mockConfigService));

// ─── 2. TYPE AN TOÀN CHO FILE DỮ LIỆU JSON ───────────────────────────────────
interface SeedJobPostData {
  publicTitle: string;
  specialization: string;
  domainKnowledge: string;
  level: JobLevel;
  jobType: JobType;
  workingModel: WorkingModel;
  salaryMin: number;
  salaryMax: number;
  isSalaryNegotiable: boolean;
  jobDescription: string;
  requirements: string;
  benefits: string;
  extraBenefits?: string;
  workLocations: { label: string; address: string }[];
  workingHoursStandard: string;
  workingHoursDetail: string;
  minEducation: EducationLevel;
  experienceYears: number;
  gender: CandidateGender;
  ageMin?: number;
  ageMax?: number;
  mustHaveSkills: string[];
  niceToHaveSkills: string[];
  languages: string[];
  headcount: number;
  targetPlatforms: PlatformSource[];
}

interface SeedRecruitmentRequestItem {
  key: string;
  departmentId: string;
  rawRequestNote: string;
  jobPost: SeedJobPostData;
}

interface SeedCandidateApplicationItem {
  jobKey: string;
  platformSource: PlatformSource;
  cvUrl: string;
  aiScore: number;
  aiTier: AiScreeningTier;
  aiReasoning: string;
  promotedPhase: ApplicationPhase;
}

interface SeedMockCandidateItem {
  fullName: string;
  email: string;
  phoneNumber: string;
  location?: string;
  headline?: string;
  experienceYears?: number;
  skills?: string[];
  bio?: string;
  applications: SeedCandidateApplicationItem[];
}

interface AtsSeedFileContent {
  recruitmentRequests: SeedRecruitmentRequestItem[];
  mockCandidates: SeedMockCandidateItem[];
}

// ─── 3. THỰC THI SEED ATS DATA ───────────────────────────────────────────────
async function runAtsSeed() {
  console.log('🌱 Khởi động ATS Production Seed (TypeORM Standalone)...');

  await dataSource.initialize();
  console.log('✅ Kết nối cơ sở dữ liệu thành công!');

  const reqRepo = dataSource.getRepository(RecruitmentRequest);
  const jobPostRepo = dataSource.getRepository(JobPost);
  const candidateRepo = dataSource.getRepository(CandidateProfile);
  const appRepo = dataSource.getRepository(JobApplication);
  const submissionRepo = dataSource.getRepository(ApplicationSubmission);
  const deptRepo = dataSource.getRepository(Department);
  const userRepo = dataSource.getRepository(User);

  // 1. Tìm tài khoản Super Admin làm người tạo mặc định
  const adminUser =
    (await userRepo.findOne({ where: { email: 'superadmin@chinhnam.vn' } })) ||
    (await userRepo.findOne({ where: {} }));

  // 2. Tìm và đọc file dữ liệu JSON
  let dataPath = path.join(process.cwd(), 'stc/data', 'ats.json');
  if (!fs.existsSync(dataPath)) {
    dataPath = path.join(process.cwd(), 'src/data', 'ats.json');
  }
  if (!fs.existsSync(dataPath)) {
    throw new Error(`Không tìm thấy file dữ liệu seed tại: ${dataPath}`);
  }

  const seedRaw = fs
    .readFileSync(dataPath, 'utf-8')
    .replace(/^\uFEFF/, '')
    .trim();

  let seedData: AtsSeedFileContent;
  try {
    seedData = JSON.parse(seedRaw) as AtsSeedFileContent;
  } catch (parseErr: unknown) {
    const message =
      parseErr instanceof Error ? parseErr.message : String(parseErr);
    throw new Error(`Lỗi cú pháp JSON trong file ${dataPath}: ${message}`);
  }

  const savedJobPostMap: Record<string, JobPost> = {};

  // 3. Khởi tạo Yêu cầu Tuyển dụng & Xuất bản Job Posts
  console.log('🏢 [1/2] Seeding Recruitment Requests & Published Job Posts...');
  for (const item of seedData.recruitmentRequests) {
    const randHex = Math.floor(1000 + Math.random() * 9000)
      .toString(16)
      .toUpperCase();
    const requestCode = `REQ-2026-${randHex}`;
    const jobCode = `JOB-2026-${randHex}`;

    // Đối chiếu phòng ban
    let dept: Department | null = await deptRepo.findOneBy({
      id: item.departmentId,
    });
    if (!dept) {
      dept = await deptRepo.findOneBy({});
    }

    const resolvedDepartmentId = dept?.id || item.departmentId;

    // Tạo Recruitment Request
    let reqEntity = reqRepo.create({
      requestCode,
      rawRequestNote: item.rawRequestNote,
      departmentId: resolvedDepartmentId,
      status: RecruitmentRequestStatus.APPROVED,
      requesterId: adminUser?.id,
      createdBy: adminUser?.id,
      createdByName: adminUser?.fullName || 'Super Admin',
    });
    reqEntity = await reqRepo.save(reqEntity);

    // Tạo Job Post (24 tiêu chuẩn + Đa kênh)
    let jobEntity = jobPostRepo.create({
      recruitmentRequestId: reqEntity.id,
      jobCode,
      creationMethod: JobPostCreationMethod.AI_SUGGESTION,
      status: JobPostStatus.PUBLISHED,
      isTemplate: true,
      publicTitle: item.jobPost.publicTitle,
      specialization: item.jobPost.specialization,
      domainKnowledge: item.jobPost.domainKnowledge,
      level: item.jobPost.level,
      jobType: item.jobPost.jobType,
      workingModel: item.jobPost.workingModel,
      salaryMin: item.jobPost.salaryMin,
      salaryMax: item.jobPost.salaryMax,
      isSalaryNegotiable: item.jobPost.isSalaryNegotiable,
      jobDescription: item.jobPost.jobDescription,
      requirements: item.jobPost.requirements,
      benefits: item.jobPost.benefits,
      extraBenefits: item.jobPost.extraBenefits ?? null,
      workLocations: item.jobPost.workLocations,
      workingHoursStandard: item.jobPost.workingHoursStandard,
      workingHoursDetail: item.jobPost.workingHoursDetail,
      minEducation: item.jobPost.minEducation,
      experienceYears: item.jobPost.experienceYears,
      gender: item.jobPost.gender,
      ageMin: item.jobPost.ageMin ?? null,
      ageMax: item.jobPost.ageMax ?? null,
      mustHaveSkills: item.jobPost.mustHaveSkills,
      niceToHaveSkills: item.jobPost.niceToHaveSkills,
      languages: item.jobPost.languages,
      headcount: item.jobPost.headcount,
      applicationDeadline: new Date(Date.now() + 30 * 86400000)
        .toISOString()
        .split('T')[0],
      hrRecipientName: 'TD Chính Nam',
      hrRecipientPhone: '0937546739',
      hrRecipientEmail: 'talent@chinhnambkd.vn',
      campaignName: 'Chiến dịch tuyển dụng Kỹ sư EPC 2026',
      targetPlatforms: item.jobPost.targetPlatforms,
      publishedAt: new Date(),
      externalMapping: {
        LINKEDIN: `ln_${jobCode.toLowerCase()}`,
        TOPCV: `topcv_${jobCode.toLowerCase()}`,
      },
      createdBy: adminUser?.id,
      createdByName: adminUser?.fullName || 'Super Admin',
    });
    jobEntity = await jobPostRepo.save(jobEntity);
    savedJobPostMap[item.key] = jobEntity;

    console.log(`  ✅ Đã xuất bản: [${jobCode}] ${item.jobPost.publicTitle}`);
  }

  // 4. Khởi tạo 4 Mock Candidates & Đơn ứng tuyển đa kênh & AI Evaluation
  console.log(
    '🧑‍💻 [2/2] Seeding Candidates, Cross-Platform Applications & AI Scoring...',
  );
  for (const cData of seedData.mockCandidates) {
    const normalizedEmail = cData.email.trim().toLowerCase();
    const normalizedPhone = cData.phoneNumber.trim().replace(/\s+/g, '');

    let candidate = await candidateRepo.findOne({
      where: { email: normalizedEmail },
    });

    if (!candidate) {
      candidate = candidateRepo.create({
        fullName: cData.fullName.trim(),
        email: normalizedEmail,
        phoneNumber: normalizedPhone,
        linkedInUrl: `https://linkedin.com/in/${normalizedEmail.split('@')[0]}`,
        portfolioUrl: null,
      });
      candidate = await candidateRepo.save(candidate);
    }

    for (const appItem of cData.applications) {
      const targetJob = savedJobPostMap[appItem.jobKey];
      if (!targetJob) continue;

      let application = await appRepo.findOne({
        where: { candidateId: candidate.id, jobPostId: targetJob.id },
      });

      if (!application) {
        application = appRepo.create({
          candidateId: candidate.id,
          jobPostId: targetJob.id,
          status: appItem.promotedPhase,
          aiScore: appItem.aiScore,
          aiTier: appItem.aiTier,
          aiReasoning: appItem.aiReasoning,
          internalHrNotes: `Hồ sơ tự động đánh giá bởi AI Screening: ${appItem.aiScore}/100đ. Phân loại: ${appItem.aiTier}`,
        });
        application = await appRepo.save(application);

        const submission = submissionRepo.create({
          applicationId: application.id,
          platformSource: appItem.platformSource,
          cvUrl: appItem.cvUrl,
          externalApplicationId: `ext_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
          coverLetter: `Kính gửi Ban Tuyển dụng Chính Nam, tôi là ${cData.fullName}, rất mong muốn được đóng góp năng lực vào dự án.`,
        });
        await submissionRepo.save(submission);

        // await jobPostRepo.increment(
        //   { id: targetJob.id },
        //   'applicationsCount',
        //   1,
        // );
        targetJob.applicationsCount = (targetJob.applicationsCount || 0) + 1;
        await jobPostRepo.save(targetJob);
        console.log(
          `  🎯 [${cData.fullName}] -> Nộp "${targetJob.publicTitle}" qua [${appItem.platformSource}] | Điểm AI: ${appItem.aiScore} -> ${appItem.promotedPhase}`,
        );
      }
    }
  }

  await dataSource.destroy();
  console.log('🎉 Hoàn tất Seeding ATS Production thành công!');
}

runAtsSeed().catch((err) => {
  console.error('❌ ATS Seeding thất bại:', err);
  process.exit(1);
});
