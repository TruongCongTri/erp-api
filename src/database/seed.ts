// src/database/seed.ts
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import Redis from 'ioredis';
import { typeOrmConfigFactory } from '../config/typeorm.config';
import { ConfigService } from '@nestjs/config';
import { SystemResource } from '../resources/entities/system-resource.entity';
import { Permission } from '../permissions/entities/permission.entity';
import { Role } from '../roles/entities/role.entity';
import { UserStatus } from '../users/enums/user-status.enum';
import { PermissionAction } from '../permissions/enums/permission-action.enum';
import { PermissionScope } from '../permissions/enums/permission-scope.enum';
import { CitizenIdentityCard } from 'src/identity/entities/citizen-identity.entity';
import { Gender } from 'src/identity/enums/citizen-identity.enum';
import { EmployeeProfile } from 'src/employee-profiles/entities/employee-profile.entity';
import { User } from 'src/users/entities/users.entity';

import { resourcesData } from 'src/data/resources';
import { rolesMatrix } from 'src/data/roles-matrix';
import { employeeRoster } from 'src/data/users';
import { departmentsData } from 'src/data/departments';
import { Department } from 'src/departments/entities/department.entity';

// A mock ConfigService to satisfy the TypeORM Factory outside of NestJS
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

function expandPermissionWildcards(
  permString: string,
  allResources: string[],
): string[] {
  const [res, act, scope] = permString.split(':');
  const targetResources = res === '*' ? allResources : [res];
  const targetActions =
    act === '*'
      ? [
          PermissionAction.CREATE,
          PermissionAction.READ,
          PermissionAction.UPDATE,
          PermissionAction.DELETE,
          PermissionAction.MANAGE,
          PermissionAction.APPROVE,
          PermissionAction.AUDIT,
          PermissionAction.PROCESS,
        ]
      : [act as PermissionAction];

  const expanded: string[] = [];
  for (const r of targetResources) {
    for (const a of targetActions) {
      expanded.push(`${r}:${a}:${scope}`);
    }
  }
  return expanded;
}

async function runSeed() {
  console.log('🌱 Starting Database Seed...');

  // A. Clear the Redis Cache
  console.log('🧹 Clearing Redis cache to prevent stale UUIDs...');
  const redis = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD || undefined,
  });

  await redis.flushdb();
  await redis.quit();
  console.log('✨ Redis cache completely cleared!');

  // B. Wipe and Rebuild PostgreSQL Database
  await dataSource.initialize();
  console.log('🧹 Dropping existing database schema...');

  await dataSource.query(`
    DROP SCHEMA public CASCADE; 
    CREATE SCHEMA public; 
    CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
  `);

  // 3. Rebuild schema directly from Entities
  console.log('🏗️ Rebuilding database schema from Entities...');
  await dataSource.synchronize(); // ✅ THE MAGIC FIX: Reads your TS Entities directly!
  console.log('✅ Database schema rebuilt successfully!');

  const resourceRepo = dataSource.getRepository(SystemResource);
  const permissionRepo = dataSource.getRepository(Permission);
  const roleRepo = dataSource.getRepository(Role);
  const userRepo = dataSource.getRepository(User);
  const profileRepo = dataSource.getRepository(EmployeeProfile);
  const identityRepo = dataSource.getRepository(CitizenIdentityCard);
  const departmentRepo = dataSource.getRepository(Department);

  // 1. Seed Resources
  console.log('📦 Seeding System Resources...');
  const savedResources: Record<string, SystemResource> = {};
  for (const rData of resourcesData) {
    let res = await resourceRepo.findOneBy({ slug: rData.slug });
    if (!res) {
      res = resourceRepo.create({ ...rData, isLive: true });
      await resourceRepo.save(res);
    }
    savedResources[res.slug] = res;
  }
  const allResourceSlugs = Object.keys(savedResources);

  // 2. Generate and Map Permissions
  console.log('🔑 Generating Permissions from Matrix...');
  const rolePermissionMap: Record<string, Permission[]> = {};

  for (const roleDef of rolesMatrix) {
    rolePermissionMap[roleDef.slug] = [];

    const enhancedPerms = [
      ...roleDef.perms,
      'news_feed:read:any',
      'news_feed:create:any',
      'news_feed:update:own',
      'news_feed:delete:own',
    ];

    const concreteSlugs = new Set<string>();
    enhancedPerms.forEach((p) =>
      expandPermissionWildcards(p, allResourceSlugs).forEach((cp) =>
        concreteSlugs.add(cp),
      ),
    );

    for (const permSlug of concreteSlugs) {
      const [rSlug, actionString, scopeString] = permSlug.split(':');
      const resource = savedResources[rSlug];
      if (!resource) continue;

      const actionEnum = actionString as PermissionAction;
      const scopeEnum = scopeString as PermissionScope;

      let perm = await permissionRepo.findOne({
        where: {
          action: actionEnum,
          scope: scopeEnum,
          resource: { id: resource.id },
        },
      });

      if (!perm) {
        perm = permissionRepo.create({
          slug: permSlug,
          name: `${actionString} ${rSlug}`,
          description: `Allows ${actionString} on ${rSlug} (${scopeString})`,
          action: actionEnum,
          scope: scopeEnum,
          isLive: true,
          resource: resource,
        } as Permission);

        await permissionRepo.save(perm);
      }
      rolePermissionMap[roleDef.slug].push(perm);
    }
  }

  // ==========================================
  // 3. Seed Roles
  // ==========================================
  console.log('🛡️ Seeding Roles...');
  let superAdminRole: Role | null = null;

  for (const roleDef of rolesMatrix) {
    let role = await roleRepo.findOneBy({ slug: roleDef.slug });
    if (!role) {
      role = roleRepo.create({
        slug: roleDef.slug,
        name: roleDef.name,
        // description: `System generated role for ${roleDef.name}`,
        isLive: true,
        isDefault: false,
      });
    }

    role.permissions = rolePermissionMap[roleDef.slug];
    await roleRepo.save(role);

    if (role.slug === 'SUPER_ADMIN') {
      superAdminRole = role;
    }
  }

  // ==========================================
  // 4. Seed Departments (Hierarchical)
  // ==========================================
  console.log('🏢 Seeding Departments (Organization Tree)...');
  const savedDepts: Record<string, Department> = {};

  // Pass 1: Insert all departments without parents to establish IDs
  for (const dData of departmentsData) {
    const dept = departmentRepo.create({
      slug: dData.slug,
      code: dData.code,
      name: dData.name,
      isActive: true,
      // createdBy: null,
    });
    const saved = await departmentRepo.save(dept);
    savedDepts[dData.slug] = saved;
  }

  // Pass 2: Re-link parents to build the hierarchy tree
  for (const dData of departmentsData) {
    if (dData.parentSlug && savedDepts[dData.parentSlug]) {
      const child = savedDepts[dData.slug];
      child.parentId = savedDepts[dData.parentSlug].id;
      // Tránh query TypeORM phức tạp, gán ID trực tiếp cho cột parent_id
      await departmentRepo.update(child.id, { parentId: child.parentId });
    }
  }
  console.log(`✅ Successfully seeded ${departmentsData.length} Departments!`);

  // ==========================================
  // 5. Seed Profiles and Users
  // ==========================================
  console.log('👥 Seeding Employee Profiles (Waiting to be claimed)...');

  const defaultPassword = await bcrypt.hash('ChinhNam@2026', 10);
  let seededCount = 0;

  const autoProvisionUserRoles = [
    'SUPER_ADMIN',
    'DIR_HR_ADMIN', // 1 HR user
    'HEAD_ARCHITECTURE', // 1 Department Head
  ];

  for (const emp of employeeRoster) {
    const assignedRole = await roleRepo.findOneBy({ slug: emp.roleSlug });
    const finalRole =
      assignedRole ||
      (await roleRepo.findOneBy({ slug: 'OPERATOR' })) ||
      superAdminRole;

    const matchedDept: Department | undefined = Object.values(savedDepts).find(
      (d) => d.name === emp.department || d.slug === emp.department,
    );

    // 1. Generate unique CCCD/CMND Number (Mocking a 12-digit ID)
    const numericPart = emp.employeeCode.replace(/[^0-9]/g, '');
    const randomPad = Math.floor(100000 + Math.random() * 900000).toString();
    const uniqueCccd = `${numericPart}${randomPad}`
      .padStart(12, '0')
      .slice(-12);

    // 2. Create the Identity Card
    const identityCard = identityRepo.create({
      cccdNumber: uniqueCccd,
      fullName: emp.fullName,
      dateOfBirth: new Date('1990-01-01'), // Generic for mock
      gender: Gender.MALE,
      nationality: 'Việt Nam',
      placeOfOrigin: 'TP. Hồ Chí Minh',
      placeOfResidence: 'TP. Hồ Chí Minh',
      dateOfIssue: new Date('2024-01-01'),
      dateOfExpiry: new Date('2040-01-01'),
      placeOfIssue: 'Cục Cảnh sát QLHC về TTXH',
    });

    // 3. Create the Employee Profile (Orphaned by default)
    // Note: Because we wipe the DB every time, we don't need random employeeCode suffixes anymore.
    const profile = profileRepo.create({
      employeeCode: emp.employeeCode, // Clean code (e.g. A00-000, CN-XD.2608)
      jobTitle: emp.jobTitle,
      designatedDepartment: matchedDept,
      designatedRole: finalRole as Role,
      isLive: true,
      joinDate: new Date('2026-01-01'),

      // Core Demographics
      dateOfBirth: new Date('1990-01-01'),
      gender: 'Nam',
      phoneNumber: '0900000000',
      permanentAddress: 'TP. Hồ Chí Minh',
      identityCard: identityCard, // Cascades automatically
    });

    // 4. Check if the employee's role is in our auto-provision list
    if (autoProvisionUserRoles.includes(emp.roleSlug)) {
      let user = await userRepo.findOneBy({ email: emp.email });
      if (!user) {
        user = userRepo.create({
          email: emp.email,
          fullName: emp.fullName,
          passwordHash: defaultPassword,
          status: UserStatus.ACTIVE,
          role: finalRole as Role,
          departmentId: matchedDept ? matchedDept.id : null,
        });

        // Link the profile to the User (Making them fully registered)
        user.profile = profile;
        await userRepo.save(user);
        console.log(
          `✅ Auto-created user account: ${emp.email} [${emp.roleSlug}]`,
        );
      }
    } else {
      // 5. For everyone else, just save the Profile to the DB.
      // It sits waiting for a GUEST user to claim it.
      await profileRepo.save(profile);
    }
    seededCount++;
  }

  console.log(`✅ Successfully seeded ${seededCount} profiles for claiming!`);

  // // 6. Seed ATS Data (Jobs & Requests)
  // console.log('🏢 Seeding ATS Job Requests and Job Posts...');

  // // Pre-fetch the HR Admin so we can assign them as the creator of the JobPosts
  // const hrAdmin = await userRepo.findOneBy({
  //   email: 'superadmin@chinhnam.vn',
  // });

  // if (hrAdmin) {
  //   for (const [index, data] of jobRequestSeedData.entries()) {
  //     // Find the specific requester based on the email in the mock data
  //     const requester =
  //       (await userRepo.findOneBy({ email: data.requesterEmail })) || hrAdmin;

  //     // 1. Create the Recruitment Request
  //     const request = requestRepo.create({
  //       jobTitle: data.jobTitle,
  //       department: data.department,
  //       headcount: data.headcount,
  //       targetSalaryMin: data.targetSalaryMin,
  //       targetSalaryMax: data.targetSalaryMax,
  //       rawRequirements: data.rawRequirements,
  //       reasonForHiring: data.reasonForHiring,
  //       companyBenefits: data.companyBenefits,
  //       aiDraftedDescription: data.aiDraftedDescription,
  //       deadline: data.deadline,
  //       level: data.level,
  //       jobType: data.jobType,
  //       workingModel: data.workingModel,
  //       location: data.location,
  //       workingHours: data.workingHours,
  //       experienceYears: data.experienceYears,
  //       educationLevel: data.educationLevel,
  //       gender: data.gender,
  //       ageRange: data.ageRange,
  //       mustHaveSkills: data.mustHaveSkills,
  //       niceToHaveSkills: data.niceToHaveSkills,
  //       languages: data.languages,

  //       status: RecruitmentRequestStatus.APPROVED, // All set to approved for easy testing
  //       requester: requester,
  //       createdBy: requester.id,
  //       createdByName: requester.fullName,
  //     });
  //     await requestRepo.save(request);

  //     // 2. Build the external mapping for job boards
  //     // Every job gets these 5 standard boards:
  //     const mapping: Record<string, string> = {
  //       linkedin: `ln-mock-${index}`,
  //       topcv: `topcv-mock-${index}`,
  //       careerviet: `cv-mock-${index}`,
  //       vietnamworks: `vnw-mock-${index}`,
  //       vieclam24h: `vl24h-mock-${index}`,
  //     };

  //     // If it's an IT job, append ITviec
  //     if (data.isItJob) {
  //       mapping['itviec'] = `itviec-mock-${index}`;
  //     }

  //     // Safe Salary Formatting
  //     const formattedSalary =
  //       data.targetSalaryMin && data.targetSalaryMax
  //         ? `${data.targetSalaryMin / 1000000} - ${data.targetSalaryMax / 1000000} Triệu VNĐ`
  //         : 'Thỏa thuận';

  //     // 3. Create the Published Job Post
  //     const jobPost = jobPostRepo.create({
  //       publicTitle: request.jobTitle,
  //       aiDraftedDescription: request.aiDraftedDescription,
  //       companyBenefits: request.companyBenefits,
  //       status: JobPostStatus.PUBLISHED,
  //       headcount: data.headcount,
  //       deadline: data.deadline,
  //       level: data.level,
  //       jobType: data.jobType,
  //       workingModel: data.workingModel,
  //       location: data.location,
  //       workingHours: data.workingHours,
  //       experienceYears: data.experienceYears,
  //       educationLevel: data.educationLevel,
  //       gender: data.gender,
  //       ageRange: data.ageRange,
  //       mustHaveSkills: data.mustHaveSkills,
  //       niceToHaveSkills: data.niceToHaveSkills,
  //       languages: data.languages,
  //       publicSalaryDisplay: formattedSalary,
  //       hrContactName: hrAdmin.fullName,
  //       hrContactEmail: hrAdmin.email,
  //       hrContactPhone: '0988777666', // Mock HR phone number

  //       externalMapping: mapping,
  //       request: request,
  //       createdBy: hrAdmin.id,
  //       createdByName: hrAdmin.fullName,
  //     });
  //     await jobPostRepo.save(jobPost);
  //   }
  //   console.log(
  //     `✅ Successfully seeded 10 Recruitment Requests & Job Posts with External Mappings!`,
  //   );
  // } else {
  //   console.warn('⚠️ Skipped ATS Seeding: Could not find HR Admin test user.');
  // }

  // ==========================================
  // 7. Seed Candidates, Applications & Submissions
  // ==========================================
  // console.log('🧑‍💻 Seeding Candidates and Job Applications across platforms...');

  // // 1. Fetch all the Job Posts we just created (Need the relations to know the department)
  // const allJobPosts = await jobPostRepo.find({
  //   relations: { request: true },
  // });

  // if (allJobPosts.length > 0) {
  //   // 2. Generate the massive JSON mock data using our helper
  //   const candidatesMocks = generateCandidateSeedData(allJobPosts);

  //   // 3. Save everything to the database
  //   for (const mockCand of candidatesMocks) {
  //     // A. Save the Candidate
  //     const candidate = candidateProfileRepo.create({
  //       fullName: mockCand.fullName,
  //       email: mockCand.email,
  //       phoneNumber: mockCand.phoneNumber,
  //       linkedInUrl: mockCand.linkedInUrl,
  //       cvReferences: mockCand.cvReferences,
  //     });
  //     const savedCandidate = await candidateProfileRepo.save(candidate);

  //     // B. Save their Applications
  //     for (const mockApp of mockCand.applications as unknown as SeedApplication[]) {
  //       // 1. Find the exact JobPost reference
  //       const jobPostRef = allJobPosts.find((j) => j.id === mockApp.jobPostId);

  //       // 2. Create the entity with ONLY standard columns
  //       const application = applicationRepo.create({
  //         status: mockApp.status,
  //         aiScore: mockApp.aiScore,
  //         aiReasoning: mockApp.aiReasoning,
  //       });

  //       // 3. FOOLPROOF RELATION ASSIGNMENT: Assign relations directly to the instance
  //       application.candidate = savedCandidate;
  //       if (jobPostRef) {
  //         application.jobPost = jobPostRef;
  //       }

  //       // 4. Save to database
  //       const savedApp = await applicationRepo.save(application);

  //       // C. Save the multiple Submissions (Platforms) for this application
  //       const submissions = mockApp.submissions.map((sub) => {
  //         const submission = submissionRepo.create({
  //           platformSource: sub.platformSource,
  //           externalApplicationId: sub.externalApplicationId,
  //           coverLetter: sub.coverLetter,
  //           cvUrl: sub.cvUrl,
  //           cvFileKey: sub.cvFileKey,
  //         });

  //         // Direct assignment for submission relation too
  //         submission.application = savedApp;
  //         return submission;
  //       });

  //       // Save all submissions for this application in bulk
  //       await submissionRepo.save(submissions);
  //     }
  //   }

  //   console.log(
  //     `✅ Successfully seeded 70 Candidates and thousands of cross-platform Submissions!`,
  //   );
  // } else {
  //   console.warn('⚠️ Skipped Candidate Seeding: No Job Posts found.');
  // }
  await dataSource.destroy();
  console.log('🎉 Seeding Complete!');
}

runSeed().catch((err) => {
  console.error('❌ Seeding failed', err);
  process.exit(1);
});
