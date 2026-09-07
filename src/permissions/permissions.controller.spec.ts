// src/permissions/permissions.controller.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { PermissionsController } from './permissions.controller';
import { PermissionsService } from './permissions.service';
import { PermissionAction } from './enums/permission-action.enum';
import { PermissionScope } from './enums/permission-scope.enum';
import {
  NotFoundException,
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
} from '@nestjs/common';
describe('PermissionsController', () => {
  let controller: PermissionsController;

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
      controllers: [PermissionsController],
      providers: [
        {
          provide: PermissionsService,
          useValue: mockService,
        },
      ],
    }).compile();

    controller = module.get<PermissionsController>(PermissionsController);
    jest.clearAllMocks();
  });

  describe('create()', () => {
    const dto = {
      name: 'Test Permission',
      action: PermissionAction.CREATE,
      scope: PermissionScope.ANY,
      resourceId: 'res-1',
    };
    it('✅ Correct: Should call service.create with DTO', async () => {
      mockService.create.mockResolvedValue({ id: '1', ...dto });

      const result = await controller.create(dto);
      expect(mockService.create).toHaveBeenCalledWith(dto);
      expect(result.id).toBe('1');
    });

    it('❌ Wrong 1: Should bubble up NotFoundException if resource is missing', async () => {
      mockService.create.mockRejectedValue(
        new NotFoundException('Resource not found'),
      );
      await expect(controller.create(dto)).rejects.toThrow(NotFoundException);
    });

    it('❌ Wrong 2: Should bubble up BadRequestException if resource is drafted', async () => {
      mockService.create.mockRejectedValue(
        new BadRequestException('Cannot assign a drafted resource.'),
      );
      await expect(controller.create(dto)).rejects.toThrow(BadRequestException);
    });

    it('❌ Wrong 3: Should bubble up ConflictException if permission already exists', async () => {
      mockService.create.mockRejectedValue(
        new ConflictException('Permission already exists.'),
      );
      await expect(controller.create(dto)).rejects.toThrow(ConflictException);
    });
  });

  describe('findAll()', () => {
    const baseQuery = { page: 1, limit: 10 };

    it('✅ Correct: Should pass false for forceRefresh when missing', async () => {
      mockService.findAll.mockResolvedValue({
        data: [{ id: '1' }],
        meta: { total: 1 },
      });
      const result = await controller.findAll(baseQuery);

      expect(mockService.findAll).toHaveBeenCalledWith(baseQuery, false);
      expect(result.data.length).toBe(1);
    });

    it('✅ Correct: Should parse refresh=true and STRIP IT from the query object', async () => {
      mockService.findAll.mockResolvedValue({ data: [], meta: {} });
      const query = {
        isLive: true,
        refresh: 'true',
        page: 1,
        limit: 10,
      };

      await controller.findAll(query, 'true');

      // Ensure 'refresh' was deleted so it doesn't corrupt the JSON.stringify cache key
      expect(query.refresh).toBeUndefined();
      expect(mockService.findAll).toHaveBeenCalledWith(
        { isLive: true, page: 1, limit: 10 },
        true, // forceRefresh parsed correctly
      );
    });

    it('❌ Wrong 1: Should safely return empty arrays without error', async () => {
      mockService.findAll.mockResolvedValue({ data: [], meta: { total: 0 } });
      const result = await controller.findAll(baseQuery);
      expect(result.data).toEqual([]);
    });

    it('❌ Wrong 2: Should bubble up unexpected generic errors', async () => {
      mockService.findAll.mockRejectedValue(new InternalServerErrorException());
      await expect(controller.findAll(baseQuery)).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });

  describe('findAvailable()', () => {
    it('✅ Correct: Should pass false fallback when no refresh query provided', async () => {
      mockService.findAvailable.mockResolvedValue([{ id: '1' }]);
      await controller.findAvailable();
      expect(mockService.findAvailable).toHaveBeenCalledWith(false);
    });

    it('✅ Correct: Should pass true when refresh query is "true"', async () => {
      mockService.findAvailable.mockResolvedValue([{ id: '1' }]);
      await controller.findAvailable('true');
      expect(mockService.findAvailable).toHaveBeenCalledWith(true);
    });

    it('❌ Wrong 1: Should handle service returning empty array safely', async () => {
      mockService.findAvailable.mockResolvedValue([]);
      const result = await controller.findAvailable();
      expect(result.data).toEqual([]);
    });
  });

  describe('findOne()', () => {
    it('✅ Correct: Should call service.findOne with false fallback', async () => {
      mockService.findOne.mockResolvedValue({ id: '1' });
      await controller.findOne('1');
      expect(mockService.findOne).toHaveBeenCalledWith('1', false);
    });

    it('✅ Correct: Should parse refresh query to boolean', async () => {
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
    it('❌ Wrong 1: Should bubble up NotFoundException if permission missing', async () => {
      mockService.toggleStatus.mockRejectedValue(
        new NotFoundException('Permission not found'),
      );
      await expect(controller.toggleStatus('99', dto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('❌ Wrong 2: Should bubble up BadRequestException if permission is in use', async () => {
      mockService.toggleStatus.mockRejectedValue(
        new BadRequestException('Cannot draft. Assigned to 1 role(s)'),
      );
      await expect(controller.toggleStatus('1', dto)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('update()', () => {
    const dto = { resourceId: 'res-2' }; // ✅ 'resourceId' is a valid updatable field

    it('✅ Correct: Should call service.update with ID and DTO', async () => {
      mockService.update.mockResolvedValue({ id: '1', ...dto });

      await controller.update('1', dto);
      expect(mockService.update).toHaveBeenCalledWith('1', dto);
    });
    it('❌ Wrong 1: Should bubble up NotFoundException if permission is missing', async () => {
      mockService.update.mockRejectedValue(
        new NotFoundException('Permission not found'),
      );
      await expect(controller.update('99', dto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('❌ Wrong 2: Should bubble up NotFoundException if new resourceId is invalid', async () => {
      mockService.update.mockRejectedValue(
        new NotFoundException('Resource not found'),
      );
      await expect(
        controller.update('1', { resourceId: 'invalid-res' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('❌ Wrong 3: Should bubble up BadRequestException if toggling live status fails', async () => {
      // Simulating the internal toggleStatus check failing during an update payload
      mockService.update.mockRejectedValue(
        new BadRequestException('Cannot draft.'),
      );
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
    it('❌ Wrong 1: Should bubble up NotFoundException if missing', async () => {
      mockService.remove.mockRejectedValue(
        new NotFoundException('Permission not found'),
      );
      await expect(controller.remove('99')).rejects.toThrow(NotFoundException);
    });

    it('❌ Wrong 2: Should bubble up BadRequestException if deleting a default permission', async () => {
      mockService.remove.mockRejectedValue(
        new BadRequestException('Cannot delete default system permission.'),
      );
      await expect(controller.remove('1')).rejects.toThrow(BadRequestException);
    });

    it('❌ Wrong 3: Should bubble up BadRequestException if permission is assigned', async () => {
      mockService.remove.mockRejectedValue(
        new BadRequestException(
          'Cannot delete. Permission is currently assigned.',
        ),
      );
      await expect(controller.remove('1')).rejects.toThrow(BadRequestException);
    });
  });
});
