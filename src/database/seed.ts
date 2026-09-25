// src/database/seed.ts
import 'tsconfig-paths/register';
import * as dotenv from 'dotenv';
// Nạp biến môi trường cho quá trình seed CLI
dotenv.config({ path: ['.env.development.local', '.env.local', '.env'] });

import * as crypto from 'crypto';
import * as bcrypt from 'bcrypt';
import Redis from 'ioredis';
import dataSource from '../config/typeorm.config';

import { SystemResource } from '../resources/entities/system-resource.entity';
import { Permission } from '../permissions/entities/permission.entity';
import { Role } from '../roles/entities/role.entity';
import { UserStatus } from '../users/enums/user-status.enum';
import { PermissionAction } from '../permissions/enums/permission-action.enum';
import { PermissionScope } from '../permissions/enums/permission-scope.enum';
import {
  CitizenIdentityCard,
  IdentityCardStatus,
} from 'src/identity/entities/citizen-identity.entity';
import { Gender } from 'src/identity/enums/citizen-identity.enum';
import { EmployeeProfile } from 'src/employee-profiles/entities/employee-profile.entity';
import { EmployeeFinancial } from 'src/employee-profiles/entities/employee-financial.entity';
import { EmployeeSalaryHistory } from 'src/employee-profiles/entities/employee-salary-history.entity';
import { User } from 'src/users/entities/users.entity';
import { Department } from 'src/departments/entities/department.entity';
import { CryptoUtil } from 'src/common/utils/crypto.util';

import { resourcesData } from 'src/data/resources';
import { rolesMatrix } from 'src/data/roles-matrix';
import { employeeRoster } from 'src/data/users';
import { departmentsData } from 'src/data/departments';

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

  const encryptionKey =
    process.env.DATA_ENCRYPTION_KEY || 'chinhnam-ats-encryption-key-32ch';

  // A. Clear Redis Cache
  console.log('🧹 Clearing Redis cache to prevent stale UUIDs...');
  const isTls =
    process.env.REDIS_TLS === 'true' ||
    !!process.env.REDIS_URL?.startsWith('rediss://');

  const redis = process.env.REDIS_URL
    ? new Redis(process.env.REDIS_URL, {
        tls: isTls ? {} : undefined,
      })
    : new Redis({
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379', 10),
        password: process.env.REDIS_PASSWORD || undefined,
        tls: isTls ? {} : undefined,
      });

  try {
    await redis.flushdb();
    console.log('✨ Redis cache cleared!');
  } catch (err) {
    console.warn('⚠️ Redis flush skipped:', (err as Error).message);
  } finally {
    await redis.quit();
  }

  // B. Initialize Connection and Reset Public Schema
  await dataSource.initialize();
  console.log('🧹 Resetting public schema on Database...');

  await dataSource.query(`
    DROP SCHEMA public CASCADE; 
    CREATE SCHEMA public; 
    GRANT ALL ON SCHEMA public TO postgres;
    GRANT ALL ON SCHEMA public TO public;
    COMMENT ON SCHEMA public IS 'standard public schema';
    CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
  `);

  // C. Rebuild Schema from Entities
  console.log('🏗️ Rebuilding database schema from Entities...');
  await dataSource.synchronize();
  console.log('✅ Database schema rebuilt successfully!');

  const resourceRepo = dataSource.getRepository(SystemResource);
  const permissionRepo = dataSource.getRepository(Permission);
  const roleRepo = dataSource.getRepository(Role);
  const userRepo = dataSource.getRepository(User);
  const profileRepo = dataSource.getRepository(EmployeeProfile);
  const identityRepo = dataSource.getRepository(CitizenIdentityCard);
  const financialRepo = dataSource.getRepository(EmployeeFinancial);
  const salaryRepo = dataSource.getRepository(EmployeeSalaryHistory);
  const departmentRepo = dataSource.getRepository(Department);

  // 1. Bulk Seed Resources (Deduplicated by slug)
  console.log('📦 Deduplicating and bulk seeding System Resources...');
  const uniqueResourcesMap = new Map<string, (typeof resourcesData)[0]>();
  for (const r of resourcesData) {
    if (!uniqueResourcesMap.has(r.slug)) {
      uniqueResourcesMap.set(r.slug, r);
    }
  }

  const resourcesToCreate = Array.from(uniqueResourcesMap.values()).map((r) =>
    resourceRepo.create({ ...r, isLive: true }),
  );
  const savedResourcesList = await resourceRepo.save(resourcesToCreate, {
    chunk: 100,
  });

  const savedResources: Record<string, SystemResource> = {};
  for (const r of savedResourcesList) {
    savedResources[r.slug] = r;
  }
  const allResourceSlugs = Object.keys(savedResources);
  console.log(`✅ Seeded ${savedResourcesList.length} distinct resources.`);

  // 2. Pre-calculate and Bulk Seed Unique Permissions
  console.log('🔑 Pre-calculating distinct permissions across all roles...');
  const allUniquePermSlugs = new Set<string>();
  const roleSlugToPermSlugsMap: Record<string, string[]> = {};

  for (const roleDef of rolesMatrix) {
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

    roleSlugToPermSlugsMap[roleDef.slug] = Array.from(concreteSlugs);
    concreteSlugs.forEach((slug) => allUniquePermSlugs.add(slug));
  }

  console.log(
    `⚡ Bulk inserting ${allUniquePermSlugs.size} unique permissions...`,
  );
  const permissionsToInsert: Permission[] = [];

  for (const permSlug of allUniquePermSlugs) {
    const [rSlug, actionString, scopeString] = permSlug.split(':');
    const resource = savedResources[rSlug];
    if (!resource) continue;

    permissionsToInsert.push(
      permissionRepo.create({
        slug: permSlug,
        name: `${actionString} ${rSlug}`,
        description: `Allows ${actionString} on ${rSlug} (${scopeString})`,
        action: actionString as PermissionAction,
        scope: scopeString as PermissionScope,
        isLive: true,
        resource: resource,
      } as Permission),
    );
  }

  const savedPermissionsList = await permissionRepo.save(permissionsToInsert, {
    chunk: 100,
  });

  const permissionBySlugMap = new Map<string, Permission>();
  for (const p of savedPermissionsList) {
    permissionBySlugMap.set(p.slug, p);
  }
  console.log('✅ Permissions generated and indexed in memory!');

  // 3. Seed Roles with Mapped Permissions
  console.log('🛡️ Seeding Roles...');
  let superAdminRole: Role | null = null;
  const uniqueRolesMap = new Map<string, (typeof rolesMatrix)[0]>();
  for (const r of rolesMatrix) {
    if (!uniqueRolesMap.has(r.slug)) {
      uniqueRolesMap.set(r.slug, r);
    }
  }

  const rolesToSave: Role[] = [];
  for (const roleDef of uniqueRolesMap.values()) {
    const targetPermSlugs = roleSlugToPermSlugsMap[roleDef.slug] || [];
    const assignedPermissions: Permission[] = [];

    for (const slug of targetPermSlugs) {
      const matched = permissionBySlugMap.get(slug);
      if (matched) assignedPermissions.push(matched);
    }

    rolesToSave.push(
      roleRepo.create({
        slug: roleDef.slug,
        name: roleDef.name,
        isLive: true,
        isDefault: false,
        permissions: assignedPermissions,
      }),
    );
  }

  const savedRoles = await roleRepo.save(rolesToSave);
  for (const role of savedRoles) {
    if (role.slug === 'SUPER_ADMIN') {
      superAdminRole = role;
    }
  }
  console.log(`✅ Seeded ${savedRoles.length} roles with permissions.`);

  // 4. Seed Departments
  console.log('🏢 Seeding Departments...');
  const uniqueDeptsMap = new Map<string, (typeof departmentsData)[0]>();
  for (const d of departmentsData) {
    if (!uniqueDeptsMap.has(d.slug)) {
      uniqueDeptsMap.set(d.slug, d);
    }
  }

  const savedDepts: Record<string, Department> = {};
  for (const dData of uniqueDeptsMap.values()) {
    const dept = departmentRepo.create({
      slug: dData.slug,
      code: dData.code,
      name: dData.name,
      isActive: true,
    });
    const saved = await departmentRepo.save(dept);
    savedDepts[dData.slug] = saved;
  }

  for (const dData of uniqueDeptsMap.values()) {
    if (dData.parentSlug && savedDepts[dData.parentSlug]) {
      const child = savedDepts[dData.slug];
      child.parentId = savedDepts[dData.parentSlug].id;
      await departmentRepo.update(child.id, { parentId: child.parentId });
    }
  }
  console.log(`✅ Seeded ${Object.keys(savedDepts).length} Departments!`);

  // 5. Seed Profiles, Identity Cards, Financials, Salaries & Users
  console.log('👥 Seeding Employee Profiles, Identity & Financial Records...');
  const defaultPassword = await bcrypt.hash('ChinhNam@2026', 10);
  let seededCount = 0;

  const autoProvisionUserRoles = [
    'SUPER_ADMIN',
    'DIR_HR_ADMIN',
    'HEAD_ARCHITECTURE',
  ];

  for (let i = 0; i < employeeRoster.length; i++) {
    const emp = employeeRoster[i];
    const cleanEmployeeCode = emp.employeeCode.trim();

    const assignedRole = savedRoles.find((r) => r.slug === emp.roleSlug);
    const finalRole =
      assignedRole ||
      savedRoles.find((r) => r.slug === 'OPERATOR') ||
      superAdminRole;

    const targetDeptName = emp.department?.trim().toLowerCase();
    const matchedDept = Object.values(savedDepts).find(
      (d) =>
        d.name?.trim().toLowerCase() === targetDeptName ||
        d.slug?.trim().toLowerCase() === targetDeptName,
    );

    // Chuẩn bị dữ liệu CCCD mã hóa và Blind Index
    const deterministicCccd = `079${String(i + 1).padStart(9, '0')}`;
    const cccdLastFour = deterministicCccd.slice(-4);
    const cccdNumberHash = crypto
      .createHmac('sha256', encryptionKey)
      .update(deterministicCccd)
      .digest('hex');
    const cccdNumberEncrypted = CryptoUtil.encrypt(
      deterministicCccd,
      encryptionKey,
    );

    // 5.1. Tạo CitizenIdentityCard (Đã fix thuộc tính khớp Entity mới)
    const identityCard = identityRepo.create({
      cccdNumberHash,
      cccdNumberEncrypted,
      cccdLastFour,
      fullName: emp.fullName.trim(),
      dateOfBirth: new Date('1992-01-01'),
      gender: Gender.MALE,
      nationality: 'Việt Nam',
      placeOfOrigin: 'TP. Hồ Chí Minh',
      placeOfResidence: 'TP. Hồ Chí Minh',
      dateOfIssue: new Date('2024-01-01'),
      dateOfExpiry: new Date('2040-01-01'),
      placeOfIssue: 'Cục Cảnh sát QLHC về TTXH',
      status: IdentityCardStatus.VERIFIED,
    });
    const savedIdentity = await identityRepo.save(identityCard);

    // 5.2. Tạo EmployeeProfile
    const profile = profileRepo.create({
      employeeCode: cleanEmployeeCode,
      jobTitle: emp.jobTitle.trim(),
      designatedDepartment: matchedDept,
      designatedRole: finalRole as Role,
      isLive: true,
      joinDate: new Date('2026-01-01'),
      dateOfBirth: new Date('1992-01-01'),
      gender: 'Nam',
      phoneNumber: '0900000000',
      permanentAddress: 'TP. Hồ Chí Minh',
      identityCard: savedIdentity,
    });
    const savedProfile = await profileRepo.save(profile);

    // 5.3. Tạo EmployeeFinancial (Mã số thuế & BHXH mã hóa)
    const rawTaxCode = `031${String(i + 1).padStart(7, '0')}`;
    const rawSocialInsurance = `79${String(i + 1).padStart(8, '0')}`;

    const financial = financialRepo.create({
      profileId: savedProfile.id,
      taxCodeEncrypted: CryptoUtil.encrypt(rawTaxCode, encryptionKey),
      socialInsuranceNumberEncrypted: CryptoUtil.encrypt(
        rawSocialInsurance,
        encryptionKey,
      ),
    });
    await financialRepo.save(financial);

    // 5.4. Tạo EmployeeSalaryHistory (Lương cơ bản & phụ cấp mã hóa)
    const baseSalary = 18000000 + i * 500000;
    const extraSalary = 2000000;

    const salaryHistory = salaryRepo.create({
      profileId: savedProfile.id,
      baseSalaryEncrypted: CryptoUtil.encrypt(baseSalary, encryptionKey),
      extraSalaryEncrypted: CryptoUtil.encrypt(extraSalary, encryptionKey),
      currency: 'VND',
      effectiveDate: new Date('2026-01-01'),
      note: 'Mức lương khởi điểm theo hợp đồng lao động',
      isCurrent: true,
    });
    await salaryRepo.save(salaryHistory);

    // 5.5. Tự động cấp tài khoản đăng nhập cho các vị trí quản lý
    if (autoProvisionUserRoles.includes(emp.roleSlug)) {
      const user = userRepo.create({
        email: emp.email.trim(),
        fullName: emp.fullName.trim(),
        passwordHash: defaultPassword,
        status: UserStatus.ACTIVE,
        role: finalRole as Role,
        departmentId: matchedDept ? matchedDept.id : null,
        profile: savedProfile,
      });

      await userRepo.save(user);
      console.log(
        `✅ Auto-created account: [${cleanEmployeeCode}] ${emp.email}`,
      );
    }

    seededCount++;
  }

  console.log(
    `✅ Successfully seeded ${seededCount} profiles & financial data!`,
  );
  await dataSource.destroy();
  console.log('🎉 Seeding Complete!');
}

runSeed().catch((err) => {
  console.error('❌ Seeding failed', err);
  process.exit(1);
});
