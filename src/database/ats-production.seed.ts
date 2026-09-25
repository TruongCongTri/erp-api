import 'tsconfig-paths/register';
import dataSource from '../config/typeorm.config'; // Direct import of the CLI DataSource

// un-comment for local use
// import { DataSource } from 'typeorm';
// import { ConfigService } from '@nestjs/config';
// import { typeOrmConfigFactory } from 'src/config/typeorm.config';

import * as fs from 'fs';
import * as path from 'path';

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
// const mockConfigService = {
//   get: <T>(key: string, defaultValue?: T): T => {
//     const envValue = process.env[key];
//     if (envValue !== undefined) {
//       if (typeof defaultValue === 'number') {
//         return parseInt(envValue, 10) as unknown as T;
//       }
//       return envValue as unknown as T;
//     }
//     return defaultValue as T;
//   },
// } as unknown as ConfigService;

// const dataSource = new DataSource(typeOrmConfigFactory(mockConfigService));

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

async function runAtsSeed() {
  console.log('🌱 Starting ATS Production Seed (TypeORM Standalone)...');

  await dataSource.initialize();
  console.log('✅ Database connected successfully!');

  const reqRepo = dataSource.getRepository(RecruitmentRequest);
  const jobPostRepo = dataSource.getRepository(JobPost);
  const candidateRepo = dataSource.getRepository(CandidateProfile);
  const appRepo = dataSource.getRepository(JobApplication);
  const submissionRepo = dataSource.getRepository(ApplicationSubmission);
  const deptRepo = dataSource.getRepository(Department);
  const userRepo = dataSource.getRepository(User);

  // 1. Resolve Admin User
  const adminUser =
    (await userRepo.findOne({ where: { email: 'superadmin@chinhnam.vn' } })) ||
    (await userRepo.findOne({ where: {} }));

  if (!adminUser) {
    console.warn(
      '⚠️ No user found in database. Run the primary seed.ts script first.',
    );
  }

  // 2. Pre-fetch all departments to prevent UUID parsing errors and remote N+1 queries
  const allDepartments = await deptRepo.find();
  if (allDepartments.length === 0) {
    throw new Error(
      'No departments found. Please run the primary seed.ts script first.',
    );
  }

  const findDepartment = (identifier: string): Department => {
    const cleanId = (identifier || '').trim().toLowerCase();
    const matched = allDepartments.find(
      (d) =>
        d.id.toLowerCase() === cleanId ||
        d.slug?.toLowerCase() === cleanId ||
        d.code?.toLowerCase() === cleanId ||
        d.name?.toLowerCase() === cleanId,
    );
    return matched || allDepartments[0];
  };

  // 3. Locate and Parse JSON Data File
  const possiblePaths = [
    path.join(process.cwd(), 'src/data', 'ats.json'),
    path.join(process.cwd(), 'data', 'ats.json'),
  ];
  const dataPath = possiblePaths.find((p) => fs.existsSync(p));

  if (!dataPath) {
    throw new Error(
      `Could not locate ats.json in: ${possiblePaths.join(' or ')}`,
    );
  }

  const seedRaw = fs
    .readFileSync(dataPath, 'utf-8')
    .replace(/^\uFEFF/, '')
    .trim();
  let seedData: AtsSeedFileContent;
  try {
    seedData = JSON.parse(seedRaw) as AtsSeedFileContent;
  } catch (parseErr) {
    throw new Error(
      `JSON syntax error in ${dataPath}: ${(parseErr as Error).message}`,
    );
  }

  const savedJobPostMap: Record<string, JobPost> = {};

  // 4. Seed Recruitment Requests & Published Job Posts
  console.log('🏢 [1/2] Seeding Recruitment Requests & Published Job Posts...');
  for (const item of seedData.recruitmentRequests) {
    const randHex = Math.random().toString(36).substring(2, 7).toUpperCase();
    const requestCode = `REQ-2026-${randHex}`;
    const jobCode = `JOB-2026-${randHex}`;

    const targetDept = findDepartment(item.departmentId);

    let reqEntity = reqRepo.create({
      requestCode,
      rawRequestNote: item.rawRequestNote,
      departmentId: targetDept.id,
      status: RecruitmentRequestStatus.APPROVED,
      requesterId: adminUser?.id,
      createdBy: adminUser?.id,
      createdByName: adminUser?.fullName || 'Super Admin',
    });
    reqEntity = await reqRepo.save(reqEntity);

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
      // applicationsCount: 0,
    });

    jobEntity = await jobPostRepo.save(jobEntity);
    savedJobPostMap[item.key] = jobEntity;

    console.log(`  ✅ Published: [${jobCode}] ${item.jobPost.publicTitle}`);
  }

  // 5. Seed Candidates & Applications
  console.log(
    '🧑‍💻 [2/2] Seeding Candidates, Cross-Platform Applications & AI Scoring...',
  );

  const submissionsToInsert: ApplicationSubmission[] = [];

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
          internalHrNotes: `AI Screening evaluation: ${appItem.aiScore}/100. Tier: ${appItem.aiTier}`,
        });
        application = await appRepo.save(application);

        const uniqueSuffix = `${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
        submissionsToInsert.push(
          submissionRepo.create({
            applicationId: application.id,
            platformSource: appItem.platformSource,
            cvUrl: appItem.cvUrl,
            externalApplicationId: `ext_${uniqueSuffix}`,
            coverLetter: `Kính gửi Ban Tuyển dụng Chính Nam, tôi là ${cData.fullName}, rất mong muốn được đóng góp năng lực vào dự án.`,
          }),
        );

        // Increment in-memory (bulk saved after loop)
        (
          targetJob as JobPost & { applicationsCount?: number }
        ).applicationsCount =
          ((targetJob as JobPost & { applicationsCount?: number })
            .applicationsCount ?? 0) + 1;

        console.log(
          `  🎯 [${cData.fullName}] -> Applied to "${targetJob.publicTitle}" via [${appItem.platformSource}] | Score: ${appItem.aiScore}`,
        );
      }
    }
  }

  // Bulk save submissions and updated application counts
  if (submissionsToInsert.length > 0) {
    await submissionRepo.save(submissionsToInsert, { chunk: 50 });
  }

  const jobsToUpdate = Object.values(savedJobPostMap);
  if (jobsToUpdate.length > 0) {
    await jobPostRepo.save(jobsToUpdate, { chunk: 50 });
  }

  await dataSource.destroy();
  console.log('🎉 ATS Production Seeding Complete!');
}

runAtsSeed().catch((err) => {
  console.error('❌ ATS Seeding failed:', err);
  process.exit(1);
});
