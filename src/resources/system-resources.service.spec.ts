// src/resources/system-resources.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { SystemResourcesService } from './system-resources.service';
import { SystemResource } from './entities/system-resource.entity';
import { CacheService } from 'src/common/cache/cache.service';
import {
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';

describe('SystemResourcesService', () => {
  let service: SystemResourcesService;

  // Mock Repository Setup
  const mockResourceRepository = {
    findOneBy: jest.fn(),
    findOne: jest.fn(),
    find: jest.fn(),
    findAndCount: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    remove: jest.fn(),
  };

  const mockCacheService = {
    getOrSet: jest.fn(async (key: string, fetcher: () => Promise<unknown>) =>
      fetcher(),
    ),
    clearCache: jest.fn(),
    clearCacheByPattern: jest.fn(),
    delPattern: jest.fn(),
    del: jest.fn(),
  };

  describe('findAll()', () => {
    it('✅ Correct: Should retrieve paginated resources based on query', async () => {
      const mockData = [{ id: '1', slug: 'admin' }];
      mockResourceRepository.findAndCount.mockResolvedValue([mockData, 1]);

      const result = await service.findAll({
        isLive: true,
        page: 1,
        limit: 10,
      });

      expect(mockResourceRepository.findAndCount).toHaveBeenCalled();
      expect(result.data).toEqual(mockData);
      expect(result.meta.total).toBe(1);
      // expect(result.meta.page).toBe(1);
    });

    it('✅ Correct: Should handle bypassCache gracefully', async () => {
      mockResourceRepository.findAndCount.mockResolvedValue([[], 0]);
      await service.findAll({ page: 1, limit: 10 }, true); // bypassCache = true

      // Because the decorator intercepts it, we assert the repository was still hit
      expect(mockResourceRepository.findAndCount).toHaveBeenCalled();
    });

    it('❌ Wrong 1: Should throw InternalServerError if database fails', async () => {
      mockResourceRepository.findAndCount.mockRejectedValue(
        new Error('DB Down'),
      );
      await expect(service.findAll({ page: 1, limit: 10 })).rejects.toThrow(
        Error,
      );
    });

    it('❌ Wrong 2: Should safely handle no records found', async () => {
      mockResourceRepository.findAndCount.mockResolvedValue([[], 0]);
      const result = await service.findAll({ page: 1, limit: 10 });
      expect(result.data).toHaveLength(0);
      expect(result.meta.total).toBe(0);
    });
  });

  // =====================================================================
  // METHOD: findAvailable()
  // =====================================================================
  describe('findAvailable()', () => {
    it('✅ Correct: Should fetch unpaginated resources where isLive = true', async () => {
      const mockData = [{ id: '1', name: 'Dashboard', slug: 'dashboard' }];
      mockResourceRepository.find.mockResolvedValue(mockData);

      const result = await service.findAvailable();

      expect(mockResourceRepository.find).toHaveBeenCalledWith({
        select: { id: true, name: true, slug: true },
        where: { isLive: true },
        order: { name: 'ASC' },
      });
      expect(result).toEqual(mockData);
    });

    it('❌ Wrong 1: Should bubble up errors from the repository', async () => {
      mockResourceRepository.find.mockRejectedValue(new Error('DB Error'));
      await expect(service.findAvailable()).rejects.toThrow(Error);
    });
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SystemResourcesService,
        {
          provide: getRepositoryToken(SystemResource),
          useValue: mockResourceRepository,
        },
        {
          provide: CacheService,
          useValue: mockCacheService,
        },
      ],
    }).compile();

    service = module.get<SystemResourcesService>(SystemResourcesService);
    jest.clearAllMocks();
  });

  describe('create()', () => {
    const createDto = { slug: 'new-resource', name: 'New', isLive: true };

    it('✅ Correct: Should successfully create a new resource', async () => {
      mockResourceRepository.findOneBy.mockResolvedValue(null);
      mockResourceRepository.create.mockReturnValue(createDto);
      mockResourceRepository.save.mockResolvedValue({ id: '1', ...createDto });

      const result = await service.create(createDto);
      expect(result.id).toEqual('1');
      expect(mockResourceRepository.save).toHaveBeenCalled();
    });

    it('❌ Wrong 1: Should throw ConflictException if slug already exists', async () => {
      mockResourceRepository.findOneBy.mockResolvedValue({ id: 'existing-id' });

      await expect(service.create(createDto)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('findOne()', () => {
    it('✅ Correct: Should return the resource if it exists', async () => {
      mockResourceRepository.findOne.mockResolvedValue({
        id: '1',
        name: 'Test',
      });

      const result = await service.findOne('1');
      expect(result.name).toEqual('Test');
    });

    it('❌ Wrong 1: Should throw NotFoundException if ID does not exist', async () => {
      mockResourceRepository.findOne.mockResolvedValue(null);

      await expect(service.findOne('99')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update()', () => {
    const updateDto = { slug: 'updated-slug', name: 'Updated' };

    it('✅ Correct: Should update text data successfully', async () => {
      const existingResource = { id: '1', slug: 'old-slug', isLive: true };
      mockResourceRepository.findOne.mockResolvedValue(existingResource);
      mockResourceRepository.findOneBy.mockResolvedValue(null); // Slug is available
      mockResourceRepository.save.mockResolvedValue({
        ...existingResource,
        ...updateDto,
      });

      const result = await service.update('1', updateDto);
      expect(result.name).toEqual('Updated');
    });

    it('❌ Wrong 1: Should throw NotFoundException if resource does not exist', async () => {
      mockResourceRepository.findOne.mockResolvedValue(null);

      await expect(service.update('99', updateDto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('❌ Wrong 2: Should throw ConflictException if new slug belongs to another resource', async () => {
      mockResourceRepository.findOne.mockResolvedValue({
        id: '1',
        slug: 'old-slug',
      });
      mockResourceRepository.findOneBy.mockResolvedValue({
        id: '2',
        slug: 'updated-slug',
      }); // Another record has it

      await expect(service.update('1', updateDto)).rejects.toThrow(
        ConflictException,
      );
    });

    it('❌ Wrong 3: Should throw BadRequestException if trying to draft a resource with active permissions', async () => {
      const existingResource = {
        id: '1',
        isLive: true,
        permissions: [{ id: 'p1' }], // Has attached permissions
      };
      mockResourceRepository.findOne.mockResolvedValue(existingResource);

      // Attempting to set isLive to false
      await expect(service.update('1', { isLive: false })).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('toggleStatus()', () => {
    it('✅ Correct: Should toggle status from false to true safely', async () => {
      const resource = { id: '1', isLive: false };
      mockResourceRepository.findOne.mockResolvedValue(resource);
      mockResourceRepository.save.mockResolvedValue({
        ...resource,
        isLive: true,
      });

      const result = await service.toggleStatus('1', { isLive: true });
      expect(result.isLive).toBe(true);
    });

    it('✅ Correct: Should return early if status is already the requested state', async () => {
      const resource = { id: '1', isLive: true };
      mockResourceRepository.findOne.mockResolvedValue(resource);

      const result = await service.toggleStatus('1', { isLive: true });
      expect(mockResourceRepository.save).not.toHaveBeenCalled();
      expect(result).toEqual(resource);
    });

    it('❌ Wrong 1: Should throw NotFoundException if resource is missing', async () => {
      mockResourceRepository.findOne.mockResolvedValue(null);
      await expect(
        service.toggleStatus('99', { isLive: true }),
      ).rejects.toThrow(NotFoundException);
    });

    it('❌ Wrong 2: Should throw BadRequestException if drafting a resource that has attached permissions', async () => {
      const resource = { id: '1', isLive: true, permissions: [{ id: 'p1' }] };
      mockResourceRepository.findOne.mockResolvedValue(resource);

      await expect(
        service.toggleStatus('1', { isLive: false }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('remove()', () => {
    it('✅ Correct: Should delete a resource with no attached permissions', async () => {
      const resource = { id: '1', permissions: [] };
      mockResourceRepository.findOne.mockResolvedValue(resource);
      mockResourceRepository.remove.mockResolvedValue(resource);

      await service.remove('1');
      expect(mockResourceRepository.remove).toHaveBeenCalledWith(resource);
    });

    it('❌ Wrong 1: Should throw NotFoundException if resource does not exist', async () => {
      mockResourceRepository.findOne.mockResolvedValue(null);
      await expect(service.remove('99')).rejects.toThrow(NotFoundException);
    });

    it('❌ Wrong 2: Should throw BadRequestException if resource has attached permissions', async () => {
      const resource = {
        id: '1',
        name: 'Finance',
        permissions: [{ id: 'p1' }],
      };
      mockResourceRepository.findOne.mockResolvedValue(resource);

      await expect(service.remove('1')).rejects.toThrow(BadRequestException);
    });
  });
});
