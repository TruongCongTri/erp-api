// src/roles/roles.service.spec.ts
import { In } from 'typeorm';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { RolesService } from './roles.service';
import { Role } from './entities/role.entity';
import { Permission } from 'src/permissions/entities/permission.entity';
import { User } from 'src/users/entities/users.entity';
import { CacheService } from 'src/common/cache/cache.service';

describe('RolesService', () => {
  let service: RolesService;

  // Mock QueryBuilder for findAllRolesForTable
  const mockQueryBuilder = {
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    loadRelationIdAndMap: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    getMany: jest.fn(),
  };

  const mockRoleRepository = {
    findOneBy: jest.fn(),
    findOne: jest.fn(),
    find: jest.fn(),
    findAndCount: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    remove: jest.fn(),
    createQueryBuilder: jest.fn(() => mockQueryBuilder),
  };

  const mockPermissionRepository = {
    find: jest.fn(),
    findBy: jest.fn(),
  };

  const mockUserRepository = {
    update: jest.fn(),
  };

  const mockCacheService = {
    getOrSet: jest.fn(async (key: string, fetcher: () => Promise<unknown>) =>
      fetcher(),
    ),
    delPattern: jest.fn(),
    del: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RolesService,
        {
          provide: getRepositoryToken(Role),
          useValue: mockRoleRepository,
        },
        {
          provide: getRepositoryToken(Permission),
          useValue: mockPermissionRepository,
        },
        {
          provide: getRepositoryToken(User),
          useValue: mockUserRepository,
        },
        {
          provide: CacheService,
          useValue: mockCacheService, // Inject cache
        },
      ],
    }).compile();

    service = module.get<RolesService>(RolesService);
    jest.clearAllMocks();
  });

  describe('create()', () => {
    const createDto = { slug: 'admin', name: 'Admin', permissionIds: ['p1'] };

    it('✅ Correct: Should successfully create a new role and map permissions', async () => {
      mockRoleRepository.findOneBy.mockResolvedValue(null);
      mockRoleRepository.create.mockReturnValue({
        slug: 'admin',
        name: 'Admin',
      });
      mockPermissionRepository.find.mockResolvedValue([{ id: 'p1' }]);
      mockRoleRepository.save.mockResolvedValue({
        id: '1',
        slug: 'admin',
        permissions: [{ id: 'p1' }],
      });

      const result = await service.create(createDto);
      expect(result.id).toEqual('1');
      expect(mockPermissionRepository.find).toHaveBeenCalledWith({
        where: { id: In(['p1']), isLive: true },
      });
      expect(mockRoleRepository.save).toHaveBeenCalled();
    });

    it('❌ Wrong 1: Should throw ConflictException if slug already exists', async () => {
      mockRoleRepository.findOneBy.mockResolvedValue({ id: 'existing-id' });
      await expect(service.create(createDto)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('findAll()', () => {
    const baseQuery = { page: 1, limit: 10 };

    it('✅ Correct: Should retrieve paginated roles and map counts', async () => {
      const mockData = [
        {
          id: '1',
          name: 'Admin',
          users: [{ id: 'u1' }],
          permissions: [{ id: 'p1' }],
        },
        { id: '2', name: 'Empty', users: [], permissions: [] },
      ];
      mockRoleRepository.findAndCount.mockResolvedValue([mockData, 2]);

      const result = await service.findAll(baseQuery);

      expect(mockRoleRepository.findAndCount).toHaveBeenCalled();
      expect(result.meta.total).toBe(2);
      expect(result.data[0].userCount).toBe(1);
      expect(result.data[0].permissionCount).toBe(1);
      expect(result.data[1].userCount).toBe(0);
    });

    it('✅ Correct: Should bypass cache gracefully', async () => {
      mockRoleRepository.findAndCount.mockResolvedValue([[], 0]);
      await service.findAll(baseQuery, true);
      expect(mockRoleRepository.findAndCount).toHaveBeenCalled();
    });

    it('❌ Wrong 1: Should throw Error if database fails', async () => {
      mockRoleRepository.findAndCount.mockRejectedValue(new Error('DB Error'));
      await expect(service.findAll(baseQuery)).rejects.toThrow(Error);
    });
  });

  describe('findOne()', () => {
    it('✅ Correct: Should return the role if it exists', async () => {
      mockRoleRepository.findOne.mockResolvedValue({ id: '1', name: 'Admin' });
      const result = await service.findOne('1');
      expect(result.name).toEqual('Admin');
    });

    it('❌ Wrong 1: Should throw NotFoundException if ID does not exist', async () => {
      mockRoleRepository.findOne.mockResolvedValue(null);
      await expect(service.findOne('99')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update()', () => {
    const updateDto = { name: 'Super Admin', permissionIds: ['p2'] };

    it('✅ Correct: Should update data and map new permissions safely', async () => {
      const existingRole = { id: '1', isLive: true };
      mockRoleRepository.findOne.mockResolvedValue(existingRole);
      mockPermissionRepository.find.mockResolvedValue([{ id: 'p2' }]);
      mockRoleRepository.save.mockResolvedValue({
        ...existingRole,
        name: 'Super Admin',
        permissions: [{ id: 'p2' }],
      });

      const result = await service.update('1', updateDto);
      expect(result.name).toEqual('Super Admin');
      expect(mockRoleRepository.save).toHaveBeenCalled();
    });

    it('❌ Wrong 1: Should throw NotFoundException if role does not exist', async () => {
      mockRoleRepository.findOne.mockResolvedValue(null);
      await expect(service.update('99', updateDto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('❌ Wrong 2: Should throw BadRequestException if trying to draft a role assigned to users', async () => {
      const existingRole = { id: '1', isLive: true, users: [{ id: 'u1' }] };
      mockRoleRepository.findOne.mockResolvedValue(existingRole);

      await expect(service.update('1', { isLive: false })).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('remove()', () => {
    it('✅ Correct: Should delete an unused, non-default role', async () => {
      const role = { id: '1', isDefault: false, users: [] };
      mockRoleRepository.findOne.mockResolvedValue(role);
      mockRoleRepository.remove.mockResolvedValue(role);

      await service.remove('1');
      expect(mockRoleRepository.remove).toHaveBeenCalledWith(role);
    });

    it('❌ Wrong 1: Should throw NotFoundException if missing', async () => {
      mockRoleRepository.findOne.mockResolvedValue(null);
      await expect(service.remove('99')).rejects.toThrow(NotFoundException);
    });

    it('❌ Wrong 2: Should throw BadRequestException if it is a default system role', async () => {
      const role = { id: '1', isDefault: true, users: [] };
      mockRoleRepository.findOne.mockResolvedValue(role);
      await expect(service.remove('1')).rejects.toThrow(BadRequestException);
    });

    it('❌ Wrong 3: Should throw BadRequestException if assigned to users', async () => {
      const role = { id: '1', isDefault: false, users: [{ id: 'u1' }] };
      mockRoleRepository.findOne.mockResolvedValue(role);
      await expect(service.remove('1')).rejects.toThrow(BadRequestException);
    });
  });

  describe('findAllPermissionsGrouped()', () => {
    it('✅ Correct: Should group permissions by resource name', async () => {
      mockPermissionRepository.find.mockResolvedValue([
        { id: 'p1', resource: { name: 'Finance' } },
        { id: 'p2', resource: { name: 'Finance' } },
        { id: 'p3', resource: null }, // Fallback case
      ]);

      const result = await service.findAllPermissionsGrouped();
      expect(result['Finance'].length).toBe(2);
      expect(result['Chung'].length).toBe(1);
    });
    it('✅ Correct: Should handle bypass cache gracefully', async () => {
      mockPermissionRepository.find.mockResolvedValue([]);
      await service.findAllPermissionsGrouped(true);
      expect(mockPermissionRepository.find).toHaveBeenCalled();
    });
  });

  describe('updateRolePermissions()', () => {
    it('✅ Correct: Should update role permissions and record updater', async () => {
      const role = { id: '1' };
      mockRoleRepository.findOneBy.mockResolvedValue(role);
      mockPermissionRepository.findBy.mockResolvedValue([{ id: 'p1' }]);
      mockRoleRepository.save.mockResolvedValue({
        ...role,
        permissions: [{ id: 'p1' }],
      });

      const result = await service.updateRolePermissions(
        '1',
        ['p1'],
        'updater-1',
      );
      expect(mockRoleRepository.save).toHaveBeenCalled();
      expect(result.permissions).toBeDefined();
    });

    it('❌ Wrong 1: Should throw NotFoundException if role not found', async () => {
      mockRoleRepository.findOneBy.mockResolvedValue(null);
      await expect(
        service.updateRolePermissions('99', ['p1'], 'updater-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('assignUsersToRole()', () => {
    it('✅ Correct: Should update users to the new role', async () => {
      mockRoleRepository.findOneBy.mockResolvedValue({ id: '1', isLive: true });
      mockUserRepository.update.mockResolvedValue(undefined);

      const result = await service.assignUsersToRole('1', ['u1', 'u2']);
      expect(mockUserRepository.update).toHaveBeenCalledWith(
        { id: In(['u1', 'u2']) },
        { role: { id: '1', isLive: true } },
      );
      expect(result.success).toBe(true);
      expect(result.updatedCount).toBe(2);
    });

    it('❌ Wrong 1: Should throw NotFoundException if role missing', async () => {
      mockRoleRepository.findOneBy.mockResolvedValue(null);
      await expect(service.assignUsersToRole('99', ['u1'])).rejects.toThrow(
        NotFoundException,
      );
    });

    it('❌ Wrong 2: Should throw BadRequestException if role is drafted', async () => {
      mockRoleRepository.findOneBy.mockResolvedValue({
        id: '1',
        isLive: false,
      });
      await expect(service.assignUsersToRole('1', ['u1'])).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('toggleStatus()', () => {
    it('✅ Correct: Should safely toggle status', async () => {
      const role = { id: '1', isLive: false, users: [] };
      mockRoleRepository.findOne.mockResolvedValue(role);
      mockRoleRepository.save.mockResolvedValue({ ...role, isLive: true });

      const result = await service.toggleStatus('1', { isLive: true });
      expect(result.isLive).toBe(true);
    });

    it('❌ Wrong 1: Should throw BadRequestException if drafting a role assigned to users', async () => {
      const role = { id: '1', isLive: true, users: [{ id: 'u1' }] };
      mockRoleRepository.findOne.mockResolvedValue(role);

      await expect(
        service.toggleStatus('1', { isLive: false }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
