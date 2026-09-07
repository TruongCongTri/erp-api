// src/permissions/permissions.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PermissionsService } from './permissions.service';
import { Permission } from './entities/permission.entity';
import { SystemResource } from 'src/resources/entities/system-resource.entity';
import { CacheService } from 'src/common/cache/cache.service';
import {
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PermissionAction } from './enums/permission-action.enum';
import { PermissionScope } from './enums/permission-scope.enum';

describe('PermissionsService', () => {
  let service: PermissionsService;

  const mockPermissionRepository = {
    findOneBy: jest.fn(),
    findOne: jest.fn(),
    find: jest.fn(),
    findAndCount: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    remove: jest.fn(),
  };

  const mockResourceRepository = {
    findOneBy: jest.fn(),
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
        PermissionsService,
        {
          provide: getRepositoryToken(Permission),
          useValue: mockPermissionRepository,
        },
        {
          provide: getRepositoryToken(SystemResource),
          useValue: mockResourceRepository,
        },
        {
          provide: CacheService,
          useValue: mockCacheService, // ✅ Provide cache service
        },
      ],
    }).compile();

    service = module.get<PermissionsService>(PermissionsService);
    jest.clearAllMocks();
  });

  describe('findAll()', () => {
    const baseQuery = { page: 1, limit: 10 };

    it('✅ Correct: Should retrieve paginated permissions and meta', async () => {
      const mockData = [{ id: '1', slug: 'admin' }];
      mockPermissionRepository.findAndCount.mockResolvedValue([mockData, 1]);

      const result = await service.findAll({
        isLive: true,
        resourceId: 'res-1',
        ...baseQuery,
      });

      expect(mockPermissionRepository.findAndCount).toHaveBeenCalled();
      expect(result.data).toEqual(mockData);
      expect(result.meta.total).toBe(1);
    });

    it('✅ Correct: Should bypass cache when forced', async () => {
      mockPermissionRepository.findAndCount.mockResolvedValue([[], 0]);
      await service.findAll(baseQuery, true); // bypassCache = true

      // Because we simulate getOrSet hitting the fetcher, this will still be called
      expect(mockPermissionRepository.findAndCount).toHaveBeenCalled();
    });

    it('❌ Wrong 1: Should throw Error if database fails', async () => {
      mockPermissionRepository.findAndCount.mockRejectedValue(
        new Error('DB Error'),
      );
      await expect(service.findAll(baseQuery)).rejects.toThrow(Error);
    });

    it('❌ Wrong 2: Should handle empty dataset gracefully', async () => {
      mockPermissionRepository.findAndCount.mockResolvedValue([[], 0]);
      const result = await service.findAll(baseQuery);
      expect(result.data).toHaveLength(0);
      expect(result.meta.total).toBe(0);
    });
  });

  describe('findAvailable()', () => {
    it('✅ Correct: Should return unpaginated partial payload', async () => {
      mockPermissionRepository.find.mockResolvedValue([
        { id: '1', slug: 'admin' },
      ]);
      const result = await service.findAvailable();
      expect(mockPermissionRepository.find).toHaveBeenCalled();
      expect(result[0].id).toBe('1');
    });

    it('❌ Wrong 1: Should propagate repository errors', async () => {
      mockPermissionRepository.find.mockRejectedValue(new Error());
      await expect(service.findAvailable()).rejects.toThrow(Error);
    });
  });

  describe('create()', () => {
    const createDto = {
      name: 'Create Finance',
      action: PermissionAction.CREATE,
      scope: PermissionScope.ANY,
      resourceId: 'res-1',
    };

    it('✅ Correct: Should create a non-default permission', async () => {
      const resource = { id: 'res-1', slug: 'finance', isLive: true };
      mockResourceRepository.findOneBy.mockResolvedValue(resource);
      mockPermissionRepository.findOneBy.mockResolvedValue(null); // No duplicates
      mockPermissionRepository.create.mockReturnValue({
        id: 'perm-1',
        slug: 'finance:create:any',
      });
      mockPermissionRepository.save.mockResolvedValue({
        id: 'perm-1',
        slug: 'finance:create:any',
      });

      const result = await service.create(createDto);
      expect(result.id).toEqual('perm-1');
      expect(mockPermissionRepository.save).toHaveBeenCalled();
    });

    it('❌ Wrong 1: Should throw NotFoundException if resource does not exist', async () => {
      mockResourceRepository.findOneBy.mockResolvedValue(null);
      await expect(service.create(createDto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('❌ Wrong 2: Should throw BadRequestException if resource is drafted (not live)', async () => {
      mockResourceRepository.findOneBy.mockResolvedValue({
        id: 'res-1',
        isLive: false,
      });
      await expect(service.create(createDto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('❌ Wrong 3: Should throw ConflictException if exact permission already exists', async () => {
      mockResourceRepository.findOneBy.mockResolvedValue({
        id: 'res-1',
        slug: 'finance',
        isLive: true,
      });
      mockPermissionRepository.findOneBy.mockResolvedValue({
        id: 'existing-perm',
      });

      await expect(service.create(createDto)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('findOne()', () => {
    it('✅ Correct: Should return the permission if it exists', async () => {
      mockPermissionRepository.findOne.mockResolvedValue({
        id: '1',
        name: 'Test',
      });
      const result = await service.findOne('1');
      expect(result.name).toEqual('Test');
    });

    it('❌ Wrong 1: Should throw NotFoundException if missing', async () => {
      mockPermissionRepository.findOne.mockResolvedValue(null);
      await expect(service.findOne('99')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update()', () => {
    const updateDto = { name: 'Updated Name', resourceId: 'res-2' };

    it('✅ Correct: Should update text data and relations safely', async () => {
      const existingPerm = { id: '1', resource: { id: 'res-1' }, isLive: true };
      const newResource = { id: 'res-2', slug: 'hr' };

      mockPermissionRepository.findOne.mockResolvedValue(existingPerm);
      mockResourceRepository.findOneBy.mockResolvedValue(newResource);
      mockPermissionRepository.save.mockResolvedValue({
        ...existingPerm,
        name: 'Updated Name',
      });

      const result = await service.update('1', updateDto);
      expect(result.name).toEqual('Updated Name');
      expect(mockPermissionRepository.save).toHaveBeenCalled();
    });

    it('❌ Wrong 1: Should throw NotFoundException if permission missing', async () => {
      mockPermissionRepository.findOne.mockResolvedValue(null);
      await expect(service.update('99', updateDto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('❌ Wrong 2: Should throw NotFoundException if the new resourceId does not exist', async () => {
      mockPermissionRepository.findOne.mockResolvedValue({
        id: '1',
        resource: { id: 'res-1' },
      });
      mockResourceRepository.findOneBy.mockResolvedValue(null); // Resource missing

      await expect(service.update('1', updateDto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('❌ Wrong 3: Should bubble up BadRequestException if toggling to draft fails', async () => {
      const existingPerm = {
        id: '1',
        isLive: true,
        resource: { id: 'res-1' },
        roles: [{ id: 'role-1' }],
      };
      mockPermissionRepository.findOne.mockResolvedValue(existingPerm);

      // Attempting to draft an assigned permission triggers the internal toggleStatus failure
      await expect(service.update('1', { isLive: false })).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('remove()', () => {
    it('✅ Correct: Should delete unused, non-default permission', async () => {
      const perm = { id: '1', isDefault: false, roles: [], users: [] };
      mockPermissionRepository.findOne.mockResolvedValue(perm);
      mockPermissionRepository.remove.mockResolvedValue(perm);

      await service.remove('1');
      expect(mockPermissionRepository.remove).toHaveBeenCalledWith(perm);
    });

    it('❌ Wrong 1: Should throw NotFoundException if missing', async () => {
      mockPermissionRepository.findOne.mockResolvedValue(null);
      await expect(service.remove('99')).rejects.toThrow(NotFoundException);
    });

    it('❌ Wrong 2: Should throw BadRequestException if it is a default system permission', async () => {
      const perm = { id: '1', isDefault: true, roles: [], users: [] };
      mockPermissionRepository.findOne.mockResolvedValue(perm);
      await expect(service.remove('1')).rejects.toThrow(BadRequestException);
    });

    it('❌ Wrong 3: Should throw BadRequestException if assigned to a Role', async () => {
      const perm = {
        id: '1',
        isDefault: false,
        roles: [{ id: 'r1' }],
        users: [],
      };
      mockPermissionRepository.findOne.mockResolvedValue(perm);
      await expect(service.remove('1')).rejects.toThrow(BadRequestException);
    });

    it('❌ Wrong 4: Should throw BadRequestException if assigned directly to a User', async () => {
      const perm = {
        id: '1',
        isDefault: false,
        roles: [],
        users: [{ id: 'u1' }],
      };
      mockPermissionRepository.findOne.mockResolvedValue(perm);
      await expect(service.remove('1')).rejects.toThrow(BadRequestException);
    });
  });

  describe('toggleStatus()', () => {
    it('✅ Correct: Should safely toggle status', async () => {
      const perm = { id: '1', isLive: false, roles: [], users: [] };
      mockPermissionRepository.findOne.mockResolvedValue(perm);
      mockPermissionRepository.save.mockResolvedValue({
        ...perm,
        isLive: true,
      });

      const result = await service.toggleStatus('1', { isLive: true });
      expect(result.isLive).toBe(true);
    });

    it('✅ Correct: Should return early if no change', async () => {
      const perm = { id: '1', isLive: true, roles: [], users: [] };
      mockPermissionRepository.findOne.mockResolvedValue(perm);

      const result = await service.toggleStatus('1', { isLive: true });
      expect(mockPermissionRepository.save).not.toHaveBeenCalled();
      expect(result.isLive).toBe(true);
    });

    it('❌ Wrong 1: Should throw BadRequestException if drafting while in use by roles', async () => {
      const perm = { id: '1', isLive: true, roles: [{ id: 'r1' }], users: [] };
      mockPermissionRepository.findOne.mockResolvedValue(perm);
      await expect(
        service.toggleStatus('1', { isLive: false }),
      ).rejects.toThrow(BadRequestException);
    });

    it('❌ Wrong 2: Should throw BadRequestException if drafting while in use by users', async () => {
      const perm = { id: '1', isLive: true, roles: [], users: [{ id: 'u1' }] };
      mockPermissionRepository.findOne.mockResolvedValue(perm);
      await expect(
        service.toggleStatus('1', { isLive: false }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
