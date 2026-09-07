// src/users/users.controller.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import {
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
  ConflictException,
} from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateEmployeeProfileDto } from './dto/update-employee-profile.dto';
import { UserQueryDto } from './dto/user-query.dto';

jest.mock('vietnam-administrative-address', () => ({
  convertAddressText: jest.fn(),
  convertOldToNew: jest.fn(),
}));

jest.mock('vietnam-administrative-address/data', () => ({
  newProvinces: {},
  newWards: {},
}));

describe('UsersController', () => {
  let controller: UsersController;

  const mockService = {
    create: jest.fn(),
    findAll: jest.fn(),
    findAvailable: jest.fn(),
    updateUserAccess: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    updateProfile: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        {
          provide: UsersService,
          useValue: mockService,
        },
      ],
    }).compile();

    controller = module.get<UsersController>(UsersController);
    jest.clearAllMocks();
  });

  describe('create()', () => {
    const dto = { email: 'test@chinhnam.vn' } as unknown as CreateUserDto;

    it('✅ Correct: Should call service.create with DTO', async () => {
      mockService.create.mockResolvedValue({ id: '1', ...dto });

      const result = await controller.create(dto);
      expect(mockService.create).toHaveBeenCalledWith(dto);
      expect(result.data.id).toBe('1');
    });

    it('❌ Wrong 1: Should bubble up ConflictException for duplicates', async () => {
      mockService.create.mockRejectedValue(new ConflictException());
      await expect(controller.create(dto)).rejects.toThrow(ConflictException);
    });

    it('❌ Wrong 2: Should bubble up internal DB errors', async () => {
      mockService.create.mockRejectedValue(new InternalServerErrorException());
      await expect(controller.create(dto)).rejects.toThrow(
        InternalServerErrorException,
      );
    });

    it('❌ Wrong 3: Should bubble up validation exceptions', async () => {
      mockService.create.mockRejectedValue(new BadRequestException());
      await expect(controller.create(dto)).rejects.toThrow(BadRequestException);
    });
  });

  describe('findAvailable()', () => {
    it('✅ Correct: Should fetch available users with false fallback', async () => {
      mockService.findAvailable.mockResolvedValue([{ id: '1' }]);
      await controller.findAvailable();
      expect(mockService.findAvailable).toHaveBeenCalledWith(false);
    });

    it('✅ Correct: Should pass true when refresh query is explicitly "true"', async () => {
      mockService.findAvailable.mockResolvedValue([{ id: '1' }]);
      await controller.findAvailable('true');
      expect(mockService.findAvailable).toHaveBeenCalledWith(true);
    });

    it('❌ Wrong 1: Should handle empty list gracefully', async () => {
      mockService.findAvailable.mockResolvedValue([]);
      const result = await controller.findAvailable();
      expect(result.data).toEqual([]);
    });
  });

  describe('findAll()', () => {
    const baseQuery = { page: 1, limit: 10 };
    it('✅ Correct: Should call service.findAll with false refresh fallback', async () => {
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
        status: 'active',
        refresh: 'true',
        page: 1,
        limit: 10,
      } as unknown as UserQueryDto & { refresh?: string };

      await controller.findAll(query, 'true');

      // Crucial check: Controller must strip refresh so JSON.stringify cache key isn't poisoned
      expect(query.refresh).toBeUndefined();
      expect(mockService.findAll).toHaveBeenCalledWith(
        { status: 'active', page: 1, limit: 10 },
        true,
      );
    });

    it('❌ Wrong 1: Should handle empty array gracefully', async () => {
      mockService.findAll.mockResolvedValue({ data: [], meta: { total: 0 } });
      const result = await controller.findAll(baseQuery);
      expect(result.data).toEqual([]);
    });

    it('❌ Wrong 2: Should bubble up unexpected DB errors', async () => {
      mockService.findAll.mockRejectedValue(new InternalServerErrorException());
      await expect(controller.findAll(baseQuery)).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });

  describe('updateAccess()', () => {
    const accessDto = { roleId: 'r1', bonusPermissionIds: ['p1'] };

    it('✅ Correct: Should call service.updateUserAccess', async () => {
      mockService.updateUserAccess.mockResolvedValue({
        id: '1',
        role: { id: 'r1' },
      });

      await controller.updateAccess('1', accessDto);
      expect(mockService.updateUserAccess).toHaveBeenCalledWith(
        '1',
        accessDto.roleId,
        accessDto.bonusPermissionIds,
      );
    });

    it('❌ Wrong 1: Should bubble up NotFoundException if user is missing', async () => {
      mockService.updateUserAccess.mockRejectedValue(
        new NotFoundException('User not found'),
      );
      await expect(controller.updateAccess('99', accessDto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('❌ Wrong 2: Should bubble up BadRequestException if role is drafted/missing', async () => {
      mockService.updateUserAccess.mockRejectedValue(
        new BadRequestException('Role not found or is drafted.'),
      );
      await expect(controller.updateAccess('1', accessDto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('❌ Wrong 3: Should bubble up DB failure during update', async () => {
      mockService.updateUserAccess.mockRejectedValue(
        new InternalServerErrorException(),
      );
      await expect(controller.updateAccess('1', accessDto)).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });

  describe('findOne()', () => {
    it('✅ Correct: Should call service.findOne with ID', async () => {
      mockService.findOne.mockResolvedValue({ id: '1' });
      const result = await controller.findOne('1');
      expect(mockService.findOne).toHaveBeenCalledWith('1', false);
      expect(result.data.id).toBe('1');
    });

    it('❌ Wrong 1: Should bubble up NotFoundException if ID does not exist', async () => {
      mockService.findOne.mockRejectedValue(
        new NotFoundException('User not found'),
      );
      await expect(controller.findOne('99')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update()', () => {
    const dto = { fullName: 'Updated' } as unknown as UpdateUserDto;

    it('✅ Correct: Should call service.update with ID and DTO', async () => {
      mockService.update.mockResolvedValue({ id: '1', fullName: 'Updated' });

      await controller.update('1', dto);
      expect(mockService.update).toHaveBeenCalledWith('1', dto);
    });

    it('❌ Wrong 1: Should bubble up NotFoundException if user missing', async () => {
      mockService.update.mockRejectedValue(
        new NotFoundException('User not found'),
      );
      await expect(controller.update('99', dto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('❌ Wrong 2: Should bubble up DB save failure', async () => {
      mockService.update.mockRejectedValue(new InternalServerErrorException());
      await expect(controller.update('1', dto)).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });

  describe('remove()', () => {
    it('✅ Correct: Should call service.remove (soft delete)', async () => {
      mockService.remove.mockResolvedValue(undefined);

      await controller.remove('1');
      expect(mockService.remove).toHaveBeenCalledWith('1');
    });

    it('❌ Wrong 1: Should bubble up NotFoundException if missing', async () => {
      mockService.remove.mockRejectedValue(
        new NotFoundException('User not found'),
      );
      await expect(controller.remove('99')).rejects.toThrow(NotFoundException);
    });

    it('❌ Wrong 2: Should bubble up DB save failure during soft delete', async () => {
      mockService.remove.mockRejectedValue(new InternalServerErrorException());
      await expect(controller.remove('1')).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });

  describe('updateProfile()', () => {
    // Removed "as unknown as" to fix ESLint, and added the address field
    const profileDto: UpdateEmployeeProfileDto = {
      phoneNumber: '+84981234567',
      jobTitle: 'Developer',
      permanentAddress: '123 Old Street, HCM',
    };

    it('✅ Correct: Should call service.updateProfile with ID and DTO (including address)', async () => {
      mockService.updateProfile.mockResolvedValue({
        id: '1',
        profile: profileDto,
      });

      await controller.updateProfile('1', profileDto);

      // Proves the controller passed the address down without dropping it
      expect(mockService.updateProfile).toHaveBeenCalledWith('1', profileDto);
    });

    it('❌ Wrong 1: Should bubble up NotFoundException if user missing', async () => {
      mockService.updateProfile.mockRejectedValue(
        new NotFoundException('User not found'),
      );
      await expect(controller.updateProfile('99', profileDto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('❌ Wrong 2: Should bubble up BadRequestException if profile relation missing', async () => {
      mockService.updateProfile.mockRejectedValue(
        new BadRequestException('User does not have an attached HR profile.'),
      );
      await expect(controller.updateProfile('1', profileDto)).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
