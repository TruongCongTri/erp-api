// src/resources/system-resources.controller.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { SystemResourcesController } from './system-resources.controller';
import { SystemResourcesService } from './system-resources.service';
import {
  NotFoundException,
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
} from '@nestjs/common';
import { MESSAGES } from 'src/common/constants/messages.constant';
import { RESOURCES } from 'src/common/constants/resources.constant';

describe('SystemResourcesController', () => {
  let controller: SystemResourcesController;

  const mockService = {
    create: jest.fn(),
    findAll: jest.fn(),
    findAvailable: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    toggleStatus: jest.fn(),
    remove: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SystemResourcesController],
      providers: [
        {
          provide: SystemResourcesService,
          useValue: mockService,
        },
      ],
    }).compile();

    controller = module.get<SystemResourcesController>(
      SystemResourcesController,
    );
    jest.clearAllMocks();
  });

  describe('create()', () => {
    const dto = { slug: 'test', name: 'Test' };

    it('✅ Correct: Should call service.create with DTO', async () => {
      mockService.create.mockResolvedValue({ id: '1', ...dto });

      const result = await controller.create(dto);
      expect(mockService.create).toHaveBeenCalledWith(dto);
      expect(result.data.id).toBe('1');
      expect(result.message).toBe(
        MESSAGES.SUCCESS.CREATED(RESOURCES.RESOURCE.SYSTEM),
      );
    });
    it('❌ Wrong 1: Should bubble up ConflictException if slug already exists', async () => {
      mockService.create.mockRejectedValue(
        new ConflictException(`Resource slug '${dto.slug}' already exists.`),
      );
      await expect(controller.create(dto)).rejects.toThrow(ConflictException);
    });

    it('❌ Wrong 2: Should bubble up InternalServerErrorException on unexpected DB failure', async () => {
      mockService.create.mockRejectedValue(
        new InternalServerErrorException('Database connection lost'),
      );
      await expect(controller.create(dto)).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });

  describe('findAll()', () => {
    const baseQuery = { page: 1, limit: 10 };
    it('✅ Correct: Should pass false for forceRefresh when refresh query is missing', async () => {
      const mockResult = { data: [{ id: '1' }], meta: { total: 1 } };
      mockService.findAll.mockResolvedValue(mockResult);

      const result = await controller.findAll(baseQuery);

      expect(mockService.findAll).toHaveBeenCalledWith(baseQuery, false);
      expect(result.data).toEqual(mockResult.data);
    });

    it('✅ Correct: Should parse refresh=true and STRIP IT from the query object', async () => {
      mockService.findAll.mockResolvedValue({ data: [], meta: {} });
      const query = { isLive: true, refresh: 'true', page: 1, limit: 10 };

      await controller.findAll(query, 'true');

      // The controller must delete 'refresh' so it doesn't pollute the Cache Key
      expect(query.refresh).toBeUndefined();
      expect(mockService.findAll).toHaveBeenCalledWith(
        { isLive: true, page: 1, limit: 10 },
        true,
      );
    });

    it('❌ Wrong 1: Should safely return empty arrays without crashing', async () => {
      mockService.findAll.mockResolvedValue({ data: [], meta: { total: 0 } });
      const result = await controller.findAll({ page: 1, limit: 10 });
      expect(result.data).toEqual([]);
    });

    it('❌ Wrong 2: Should bubble up InternalServerException on timeout', async () => {
      mockService.findAll.mockRejectedValue(new InternalServerErrorException());
      await expect(controller.findAll({ page: 1, limit: 10 })).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });

  describe('findAvailable()', () => {
    it('✅ Correct: Should fetch available resources with forceRefresh=false', async () => {
      mockService.findAvailable.mockResolvedValue([{ id: '1' }]);
      await controller.findAvailable();
      expect(mockService.findAvailable).toHaveBeenCalledWith(false);
    });

    it('✅ Correct: Should pass forceRefresh=true to bypass cache', async () => {
      mockService.findAvailable.mockResolvedValue([{ id: '1' }]);
      await controller.findAvailable('true');
      expect(mockService.findAvailable).toHaveBeenCalledWith(true);
    });

    it('❌ Wrong 1: Should handle service returning empty array', async () => {
      mockService.findAvailable.mockResolvedValue([]);
      const result = await controller.findAvailable();
      expect(result.data).toEqual([]);
    });

    it('❌ Wrong 2: Should bubble up InternalServerErrorException', async () => {
      mockService.findAvailable.mockRejectedValue(
        new InternalServerErrorException(),
      );
      await expect(controller.findAvailable()).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });

  describe('findOne()', () => {
    it('✅ Correct: Should call service.findOne with ID and false refresh', async () => {
      mockService.findOne.mockResolvedValue({ id: '1' });
      await controller.findOne('1');
      expect(mockService.findOne).toHaveBeenCalledWith('1', false);
    });

    it('✅ Correct: Should call service.findOne and bypass cache', async () => {
      mockService.findOne.mockResolvedValue({ id: '1' });
      await controller.findOne('1', 'true');
      expect(mockService.findOne).toHaveBeenCalledWith('1', true);
    });

    it('❌ Wrong 1: Should bubble up NotFoundException', async () => {
      mockService.findOne.mockRejectedValue(new NotFoundException());
      await expect(controller.findOne('99')).rejects.toThrow(NotFoundException);
    });
  });

  describe('toggleStatus()', () => {
    const dto = { isLive: false };
    it('✅ Correct: Should call service.toggleStatus with ID and DTO', async () => {
      mockService.toggleStatus.mockResolvedValue({ id: '1', isLive: false });

      const result = await controller.toggleStatus('1', dto);
      expect(mockService.toggleStatus).toHaveBeenCalledWith('1', dto);
      expect(result.data.isLive).toBe(false);
    });
    it('❌ Wrong 1: Should bubble up NotFoundException if resource not found', async () => {
      mockService.toggleStatus.mockRejectedValue(
        new NotFoundException('Resource not found'),
      );
      await expect(controller.toggleStatus('99', dto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('❌ Wrong 2: Should bubble up BadRequestException if resource has permissions attached', async () => {
      mockService.toggleStatus.mockRejectedValue(
        new BadRequestException(
          'Cannot draft. Resource is used by permissions.',
        ),
      );
      await expect(controller.toggleStatus('1', dto)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('update()', () => {
    const dto = { name: 'Updated Name', slug: 'updated-slug' };
    it('✅ Correct: Should call service.update with ID and DTO', async () => {
      mockService.update.mockResolvedValue({ id: '1', ...dto });

      await controller.update('1', dto);
      expect(mockService.update).toHaveBeenCalledWith('1', dto);
    });
    it('❌ Wrong 1: Should bubble up NotFoundException if resource does not exist', async () => {
      mockService.update.mockRejectedValue(
        new NotFoundException('Resource not found'),
      );
      await expect(controller.update('99', dto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('❌ Wrong 2: Should bubble up ConflictException if new slug is taken', async () => {
      mockService.update.mockRejectedValue(
        new ConflictException(`Resource slug '${dto.slug}' already exists.`),
      );
      await expect(controller.update('1', dto)).rejects.toThrow(
        ConflictException,
      );
    });

    it('❌ Wrong 3: Should bubble up BadRequestException if attempting to draft a resource in use', async () => {
      mockService.update.mockRejectedValue(
        new BadRequestException(
          'Cannot draft. Resource is used by 1 permission(s).',
        ),
      );
      // Using type casting only because the controller expects an UpdateSystemResourceDto which might not strictly have isLive depending on your DTO setup
      await expect(
        controller.update('1', { isLive: false } as any),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('remove()', () => {
    it('✅ Correct: Should call service.remove with ID', async () => {
      mockService.remove.mockResolvedValue(undefined);

      await controller.remove('1');
      expect(mockService.remove).toHaveBeenCalledWith('1');
    });
    it('❌ Wrong 1: Should bubble up NotFoundException if resource does not exist', async () => {
      mockService.remove.mockRejectedValue(
        new NotFoundException(`Resource with ID 99 not found`),
      );
      await expect(controller.remove('99')).rejects.toThrow(NotFoundException);
    });

    it('❌ Wrong 2: Should bubble up BadRequestException if resource has attached permissions', async () => {
      mockService.remove.mockRejectedValue(
        new BadRequestException(
          'Cannot delete resource because it has permissions attached to it.',
        ),
      );
      await expect(controller.remove('1')).rejects.toThrow(BadRequestException);
    });
  });
});
