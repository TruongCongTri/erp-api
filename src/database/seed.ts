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
import { resourcesData } from 'src/data/resources';
import { rolesMatrix } from 'src/data/roles-matrix';
import { employeeRoster } from 'src/data/users';
import { CitizenIdentityCard } from 'src/identity/entities/citizen-identity.entity';
import { Gender } from 'src/identity/enums/citizen-identity.enum';
import { EmployeeProfile } from 'src/employee-profiles/entities/employee-profile.entity';
import { User } from 'src/users/entities/users.entity';

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

  // 3. Seed Roles
  console.log('🛡️ Seeding Roles...');
  let superAdminRole: Role | null = null;

  for (const roleDef of rolesMatrix) {
    let role = await roleRepo.findOneBy({ slug: roleDef.slug });
    if (!role) {
      role = roleRepo.create({
        slug: roleDef.slug,
        name: roleDef.name,
        description: `System generated role for ${roleDef.name}`,
        isLive: true,
        isDefault: false,
      } as any) as unknown as Role;
    }

    role.permissions = rolePermissionMap[roleDef.slug];
    await roleRepo.save(role);

    if (role.slug === 'SUPER_ADMIN') {
      superAdminRole = role;
    }
  }

  // 4 & 5. Seed Profiles and the Single Super Admin Account
  console.log('👥 Seeding Employee Profiles (Waiting to be claimed)...');

  const defaultPassword = await bcrypt.hash('ChinhNam@2026', 10);
  let seededCount = 0;

  for (const emp of employeeRoster) {
    const assignedRole = await roleRepo.findOneBy({ slug: emp.roleSlug });
    const finalRole =
      assignedRole ||
      (await roleRepo.findOneBy({ slug: 'OPERATOR' })) ||
      superAdminRole;

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
      department: emp.department || 'Chưa phân bổ', // 👈 Hydrating Department
      isLive: true,
      designatedRole: finalRole as Role, // 👈 Hydrating Role for claim
      joinDate: new Date('2026-01-01'),

      // Core Demographics
      dateOfBirth: new Date('1990-01-01'),
      gender: 'Nam',
      phoneNumber: '0900000000',
      permanentAddress: 'TP. Hồ Chí Minh',
      identityCard: identityCard, // Cascades automatically
    });

    // 4. ONLY Create a User Account for the Super Admin
    if (emp.roleSlug === 'SUPER_ADMIN') {
      let user = await userRepo.findOneBy({ email: emp.email });
      if (!user) {
        user = userRepo.create({
          email: emp.email,
          fullName: emp.fullName,
          passwordHash: defaultPassword,
          status: UserStatus.ACTIVE,
          role: finalRole as Role,
        });

        // Link the profile to the Super Admin User
        user.profile = profile;
        await userRepo.save(user); // Cascades and saves the Profile & IdentityCard
        console.log(`✅ Super Admin created: ${emp.email}`);
      }
    } else {
      // 5. For everyone else, just save the Profile to the DB.
      // It sits waiting for a GUEST user to claim it.
      await profileRepo.save(profile);
    }

    seededCount++;
  }

  console.log(`✅ Successfully seeded ${seededCount} profiles for claiming!`);

  await dataSource.destroy();
  console.log('🎉 Seeding Complete!');
}

runSeed().catch((err) => {
  console.error('❌ Seeding failed', err);
  process.exit(1);
});
