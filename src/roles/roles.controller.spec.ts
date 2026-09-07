// src/roles/roles.controller.spec.ts
import { Request } from 'express';
import {
  NotFoundException,
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { RolesController } from './roles.controller';
import { RolesService } from './roles.service';

describe('RolesController', () => {
  let controller: RolesController;

  const mockService = {
    create: jest.fn(),
    findAllRolesForTable: jest.fn(),
    findAllPermissionsGrouped: jest.fn(),
    findAvailable: jest.fn(),
    findAll: jest.fn(),
    updateRolePermissions: jest.fn(),
    assignUsersToRole: jest.fn(),
    toggleStatus: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [RolesController],
      providers: [
        {
          provide: RolesService,
          useValue: mockService,
        },
      ],
    }).compile();

    controller = module.get<RolesController>(RolesController);
    jest.clearAllMocks();
  });

  describe('create()', () => {
    const dto = { slug: 'test', name: 'Test', permissionIds: [] };

    it('✅ Correct: Should call service.create with DTO', async () => {
      mockService.create.mockResolvedValue({ id: '1', ...dto });
      const result = await controller.create(dto);

      expect(mockService.create).toHaveBeenCalledWith(dto);
      expect(result.data.id).toBe('1');
    });

    it('❌ Wrong 1: Should bubble up ConflictException if slug exists', async () => {
      mockService.create.mockRejectedValue(new ConflictException());
      await expect(controller.create(dto)).rejects.toThrow(ConflictException);
    });

    it('❌ Wrong 2: Should bubble up InternalServerErrorException on DB error', async () => {
      mockService.create.mockRejectedValue(new InternalServerErrorException());
      await expect(controller.create(dto)).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });

  describe('getGroupedPermissions()', () => {
    it('✅ Correct: Should pass false for forceRefresh when missing', async () => {
      mockService.findAllPermissionsGrouped.mockResolvedValue({
        Finance: [{ id: 'p1' }],
      });
      const result = await controller.getGroupedPermissions();

      expect(mockService.findAllPermissionsGrouped).toHaveBeenCalledWith(false);
      expect(result.data['Finance'].length).toBe(1);
    });

    it('✅ Correct: Should parse refresh=true', async () => {
      mockService.findAllPermissionsGrouped.mockResolvedValue({});
      await controller.getGroupedPermissions('true');
      expect(mockService.findAllPermissionsGrouped).toHaveBeenCalledWith(true);
    });

    it('❌ Wrong 1: Should safely return empty object', async () => {
      mockService.findAllPermissionsGrouped.mockResolvedValue({});
      const result = await controller.getGroupedPermissions();
      expect(result.data).toEqual({});
    });
  });

  describe('findAvailable()', () => {
    it('✅ Correct: Should fetch available with forceRefresh parsing', async () => {
      mockService.findAvailable.mockResolvedValue([{ id: '1' }]);
      await controller.findAvailable('true');
      expect(mockService.findAvailable).toHaveBeenCalledWith(true);
    });

    it('❌ Wrong 1: Should safely handle empty arrays', async () => {
      mockService.findAvailable.mockResolvedValue([]);
      const result = await controller.findAvailable();
      expect(result.data).toEqual([]);
    });
  });

  describe('findAll()', () => {
    const baseQuery = { page: 1, limit: 10 };

    it('✅ Correct: Should call service.findAll and pass false fallback', async () => {
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

      expect(query.refresh).toBeUndefined(); // Crucial for cache key integrity
      expect(mockService.findAll).toHaveBeenCalledWith(
        { isLive: true, page: 1, limit: 10 },
        true,
      );
    });

    it('❌ Wrong 1: Should handle empty list gracefully', async () => {
      mockService.findAll.mockResolvedValue({ data: [], meta: { total: 0 } });
      const result = await controller.findAll(baseQuery);
      expect(result.data).toEqual([]);
    });
  });

  describe('updateRolePermissions()', () => {
    // Mock the Express request object with the custom user property
    const reqMock = {
      user: { id: 'updater-1' },
    } as unknown as Request & { user: { id: string } };

    it('✅ Correct: Should call service with extracted auth user ID', async () => {
      mockService.updateRolePermissions.mockResolvedValue({ id: '1' });

      await controller.updateRolePermissions('1', ['p1'], reqMock);
      expect(mockService.updateRolePermissions).toHaveBeenCalledWith(
        '1',
        ['p1'],
        'updater-1',
      );
    });

    it('❌ Wrong 1: Should bubble up NotFoundException if role missing', async () => {
      mockService.updateRolePermissions.mockRejectedValue(
        new NotFoundException(),
      );
      await expect(
        controller.updateRolePermissions('99', ['p1'], reqMock),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('assignUsersToRole()', () => {
    it('✅ Correct: Should call service to assign users', async () => {
      mockService.assignUsersToRole.mockResolvedValue({
        success: true,
        updatedCount: 2,
      });

      const result = await controller.assignUsersToRole('1', ['u1', 'u2']);
      expect(mockService.assignUsersToRole).toHaveBeenCalledWith('1', [
        'u1',
        'u2',
      ]);
      expect(result.data.updatedCount).toBe(2);
    });

    it('❌ Wrong 1: Should bubble up BadRequestException if drafted role', async () => {
      mockService.assignUsersToRole.mockRejectedValue(
        new BadRequestException(),
      );
      await expect(controller.assignUsersToRole('1', ['u1'])).rejects.toThrow(
        BadRequestException,
      );
    });

    it('❌ Wrong 2: Should bubble up NotFoundException if role missing', async () => {
      mockService.assignUsersToRole.mockRejectedValue(new NotFoundException());
      await expect(controller.assignUsersToRole('99', ['u1'])).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('toggleStatus()', () => {
    const dto = { isLive: false };

    it('✅ Correct: Should call service.toggleStatus', async () => {
      mockService.toggleStatus.mockResolvedValue({ id: '1', isLive: false });

      await controller.toggleStatus('1', dto);
      expect(mockService.toggleStatus).toHaveBeenCalledWith('1', dto);
    });

    it('❌ Wrong 1: Should bubble up BadRequestException if drafting an assigned role', async () => {
      mockService.toggleStatus.mockRejectedValue(new BadRequestException());
      await expect(controller.toggleStatus('1', dto)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('findOne()', () => {
    it('✅ Correct: Should parse refresh=true boolean', async () => {
      mockService.findOne.mockResolvedValue({ id: '1' });
      await controller.findOne('1', 'true');
      expect(mockService.findOne).toHaveBeenCalledWith('1', true);
    });
  });

  describe('update()', () => {
    const dto = { name: 'Updated' };

    it('✅ Correct: Should call service.update', async () => {
      mockService.update.mockResolvedValue({ id: '1', name: 'Updated' });
      await controller.update('1', dto);
      expect(mockService.update).toHaveBeenCalledWith('1', dto);
    });

    it('❌ Wrong 1: Should bubble up NotFoundException if role missing', async () => {
      mockService.update.mockRejectedValue(new NotFoundException());
      await expect(controller.update('99', dto)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('remove()', () => {
    it('✅ Correct: Should call service.remove', async () => {
      mockService.remove.mockResolvedValue(undefined);
      await controller.remove('1');
      expect(mockService.remove).toHaveBeenCalledWith('1');
    });

    it('❌ Wrong 1: Should bubble up BadRequestException if deleting an assigned role', async () => {
      mockService.remove.mockRejectedValue(new BadRequestException());
      await expect(controller.remove('1')).rejects.toThrow(BadRequestException);
    });
  });
});
