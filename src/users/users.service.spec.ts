// src/users/users.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { UsersService } from './users.service';
import { User } from './entities/users.entity';
import { Role } from '../roles/entities/role.entity';
import { Permission } from '../permissions/entities/permission.entity';
import { AddressService } from '../address/address.service';
import {
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { UserStatus } from './enums/user-status.enum';
import * as bcrypt from 'bcrypt';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateEmployeeProfileDto } from './dto/update-employee-profile.dto';
import { CacheService } from 'src/common/cache/cache.service';

jest.mock('bcrypt');

jest.mock('vietnam-administrative-address', () => ({
  convertAddressText: jest.fn(),
  convertOldToNew: jest.fn(),
}));

jest.mock('vietnam-administrative-address/data', () => ({
  newProvinces: {},
  newWards: {},
}));

describe('UsersService', () => {
  let service: UsersService;

  const mockUserRepository = {
    findOne: jest.fn(),
    find: jest.fn(),
    findAndCount: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };

  const mockRoleRepository = {
    findOne: jest.fn(),
  };

  const mockPermissionRepository = {
    find: jest.fn(),
  };

  const mockAddressService = {
    parseAndConvertText: jest.fn(),
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
        UsersService,
        {
          provide: getRepositoryToken(User),
          useValue: mockUserRepository,
        },
        {
          provide: getRepositoryToken(Role),
          useValue: mockRoleRepository,
        },
        {
          provide: getRepositoryToken(Permission),
          useValue: mockPermissionRepository,
        },
        {
          provide: AddressService,
          useValue: mockAddressService,
        },
        {
          provide: CacheService,
          useValue: mockCacheService, // Inject cache mock
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    jest.clearAllMocks();
  });

  describe('create()', () => {
    const createDto = {
      email: 'test@chinhnam.vn',
      fullName: 'Test User',
    } as unknown as CreateUserDto;

    beforeEach(() => {
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed_password');
    });

    it('✅ Correct: Should successfully create a user and hash default password', async () => {
      mockUserRepository.create.mockReturnValue({ ...createDto });
      mockUserRepository.save.mockResolvedValue({
        id: '1',
        ...createDto,
        passwordHash: 'hashed_password',
      });

      const result = await service.create(createDto);

      expect(result.id).toEqual('1');
      expect(bcrypt.hash).toHaveBeenCalledWith('CNg123@#$', 10);
      expect(mockUserRepository.save).toHaveBeenCalled();
    });

    it('✅ Correct: Should use provided password if given', async () => {
      const dtoWithPass = {
        ...createDto,
        password: 'CustomPassword123',
      } as unknown as CreateUserDto;
      mockUserRepository.create.mockReturnValue({ ...dtoWithPass });
      mockUserRepository.save.mockResolvedValue({ id: '1' });

      await service.create(dtoWithPass);
      expect(bcrypt.hash).toHaveBeenCalledWith('CustomPassword123', 10);
    });

    it('❌ Wrong 1: Should bubble up error if bcrypt hashing fails', async () => {
      (bcrypt.hash as jest.Mock).mockRejectedValue(new Error('Bcrypt failure'));
      mockUserRepository.create.mockReturnValue({ ...createDto });

      await expect(service.create(createDto)).rejects.toThrow('Bcrypt failure');
    });

    it('❌ Wrong 2: Should bubble up error if database save fails (e.g. duplicate email constraint)', async () => {
      mockUserRepository.create.mockReturnValue({ ...createDto });
      mockUserRepository.save.mockRejectedValue(
        new InternalServerErrorException('Duplicate email'),
      );

      await expect(service.create(createDto)).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });

  // =====================================================================
  // METHOD: findAll()
  // =====================================================================
  describe('findAll()', () => {
    const baseQuery = { page: 1, limit: 10 };

    it('✅ Correct: Should retrieve paginated users and meta', async () => {
      mockUserRepository.findAndCount.mockResolvedValue([[{ id: '1' }], 1]);
      const result = await service.findAll(baseQuery);

      expect(mockUserRepository.findAndCount).toHaveBeenCalled();
      expect(result.meta.total).toBe(1);
    });

    it('✅ Correct: Should bypass cache when explicitly requested', async () => {
      mockUserRepository.findAndCount.mockResolvedValue([[], 0]);
      await service.findAll(baseQuery, true);
      expect(mockUserRepository.findAndCount).toHaveBeenCalled();
    });

    it('❌ Wrong 1: Should safely return empty arrays', async () => {
      mockUserRepository.findAndCount.mockResolvedValue([[], 0]);
      const result = await service.findAll(baseQuery);
      expect(result.data.length).toBe(0);
    });

    it('❌ Wrong 2: Should bubble up DB errors', async () => {
      mockUserRepository.findAndCount.mockRejectedValue(
        new InternalServerErrorException(),
      );
      await expect(service.findAll(baseQuery)).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });

  // =====================================================================
  // METHOD: findAvailable()
  // =====================================================================
  describe('findAvailable()', () => {
    it('✅ Correct: Should return unpaginated partial payload for dropdowns', async () => {
      mockUserRepository.find.mockResolvedValue([{ id: '1' }]);
      const result = await service.findAvailable();
      expect(mockUserRepository.find).toHaveBeenCalled();
      expect(result[0].id).toBe('1');
    });

    it('❌ Wrong 1: Should bubble up DB errors', async () => {
      mockUserRepository.find.mockRejectedValue(
        new InternalServerErrorException(),
      );
      await expect(service.findAvailable()).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });

  describe('findOne()', () => {
    it('✅ Correct: Should return user by ID with relations', async () => {
      mockUserRepository.findOne.mockResolvedValue({ id: '1' });
      const result = await service.findOne('1');
      expect(result.id).toEqual('1');
    });

    it('✅ Correct: Should bypass cache natively', async () => {
      mockUserRepository.findOne.mockResolvedValue({ id: '1' });
      await service.findOne('1', true);
      expect(mockUserRepository.findOne).toHaveBeenCalled();
    });

    it('❌ Wrong 1: Should throw NotFoundException if missing', async () => {
      mockUserRepository.findOne.mockResolvedValue(null);
      await expect(service.findOne('99')).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateProfile()', () => {
    let profileDto: UpdateEmployeeProfileDto;

    beforeEach(() => {
      profileDto = {
        phoneNumber: '+84981234567',
        jobTitle: 'Senior Developer',
        permanentAddress: '123 Old Street, HCM',
      };
    });

    it('✅ Correct: Should auto-correct legacy addresses and update', async () => {
      const existingUser = { id: '1', profile: { id: 'prof-1' } };
      mockUserRepository.findOne.mockResolvedValue(existingUser);

      mockAddressService.parseAndConvertText.mockResolvedValue({
        inputType: 'old',
        status: 'matched',
        convertedText: '123 New Street',
      });

      mockUserRepository.save.mockResolvedValue({
        ...existingUser,
        profile: { ...profileDto, permanentAddress: '123 New Street' },
      });

      const result = await service.updateProfile('1', profileDto);
      expect(mockAddressService.parseAndConvertText).toHaveBeenCalledWith(
        '123 Old Street, HCM',
      );
      expect(result.profile.permanentAddress).toBe('123 New Street');
    });

    it('✅ Correct: Should fall back to exact input if normalization fails', async () => {
      const existingUser = { id: '1', profile: { id: 'prof-1' } };
      mockUserRepository.findOne.mockResolvedValue(existingUser);

      mockAddressService.parseAndConvertText.mockResolvedValue({
        inputType: 'old',
        status: 'ambiguous',
      });

      mockUserRepository.save.mockResolvedValue({
        ...existingUser,
        profile: { ...profileDto },
      });

      const result = await service.updateProfile('1', profileDto);
      expect(result.profile.permanentAddress).toBe('123 Old Street, HCM');
    });

    it('❌ Wrong 1: Should throw NotFoundException if user missing', async () => {
      mockUserRepository.findOne.mockResolvedValue(null);
      await expect(service.updateProfile('99', profileDto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('❌ Wrong 2: Should throw BadRequestException if user lacks profile relation', async () => {
      mockUserRepository.findOne.mockResolvedValue({ id: '1', profile: null });
      await expect(service.updateProfile('1', profileDto)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('remove()', () => {
    it('✅ Correct: Should strip access and mark status as RESIGNED', async () => {
      const existingUser = {
        id: '1',
        status: UserStatus.ACTIVE,
        role: { id: 'r1' },
        bonusPermissions: [{ id: 'p1' }],
      };
      mockUserRepository.findOne.mockResolvedValue(existingUser);
      mockUserRepository.save.mockResolvedValue({
        ...existingUser,
        status: UserStatus.RESIGNED,
        role: null,
        bonusPermissions: [],
      });

      await service.remove('1');
      expect(existingUser.status).toBe(UserStatus.RESIGNED);
      expect(existingUser.role).toBeNull();
      expect(existingUser.bonusPermissions).toEqual([]);
      expect(mockUserRepository.save).toHaveBeenCalledWith(existingUser);
    });

    it('❌ Wrong 1: Should throw NotFoundException if user missing', async () => {
      mockUserRepository.findOne.mockResolvedValue(null);
      await expect(service.remove('99')).rejects.toThrow(NotFoundException);
    });

    it('❌ Wrong 2: Should bubble up DB failure during the soft delete save', async () => {
      mockUserRepository.findOne.mockResolvedValue({ id: '1' });
      mockUserRepository.save.mockRejectedValue(
        new InternalServerErrorException(),
      );

      await expect(service.remove('1')).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });

  describe('updateUserAccess()', () => {
    it('✅ Correct: Should assign role and bonus permissions successfully', async () => {
      const user = { id: '1', role: null, bonusPermissions: [] };
      mockUserRepository.findOne.mockResolvedValue(user);
      mockRoleRepository.findOne.mockResolvedValue({ id: 'r1' });
      mockPermissionRepository.find.mockResolvedValue([{ id: 'p1' }]);
      mockUserRepository.save.mockResolvedValue({
        ...user,
        role: { id: 'r1' },
        bonusPermissions: [{ id: 'p1' }],
      });

      const result = await service.updateUserAccess('1', 'r1', ['p1']);
      expect(mockRoleRepository.findOne).toHaveBeenCalled();
      expect(mockPermissionRepository.find).toHaveBeenCalled();
      expect(result.role?.id).toBe('r1');
    });

    it('✅ Correct: Should clear bonus permissions if none provided', async () => {
      const user = { id: '1', bonusPermissions: [{ id: 'p1' }] };
      mockUserRepository.findOne.mockResolvedValue(user);
      mockRoleRepository.findOne.mockResolvedValue({ id: 'r1' });
      mockUserRepository.save.mockResolvedValue({
        ...user,
        bonusPermissions: [],
      });

      await service.updateUserAccess('1', 'r1', []);
      expect(user.bonusPermissions.length).toBe(0);
      expect(mockPermissionRepository.find).not.toHaveBeenCalled();
    });

    it('❌ Wrong 1: Should throw NotFoundException if user missing', async () => {
      mockUserRepository.findOne.mockResolvedValue(null);
      await expect(service.updateUserAccess('99', 'r1', [])).rejects.toThrow(
        NotFoundException,
      );
    });

    it('❌ Wrong 2: Should throw BadRequestException if role not found or drafted', async () => {
      mockUserRepository.findOne.mockResolvedValue({ id: '1' });
      mockRoleRepository.findOne.mockResolvedValue(null); // Drafted or missing

      await expect(
        service.updateUserAccess('1', 'invalid-role', []),
      ).rejects.toThrow(BadRequestException);
    });

    it('❌ Wrong 3: Should bubble up DB failure during save', async () => {
      mockUserRepository.findOne.mockResolvedValue({ id: '1' });
      mockRoleRepository.findOne.mockResolvedValue({ id: 'r1' });
      mockUserRepository.save.mockRejectedValue(
        new InternalServerErrorException(),
      );

      await expect(service.updateUserAccess('1', 'r1', [])).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });
  describe('update()', () => {
    it('✅ Correct: Should safely update base fields', async () => {
      const existingUser = { id: '1', fullName: 'Old' };
      const dto = { fullName: 'New' } as unknown as UpdateUserDto;

      mockUserRepository.findOne.mockResolvedValue(existingUser);
      mockUserRepository.save.mockResolvedValue({
        ...existingUser,
        fullName: 'New',
      });

      const result = await service.update('1', dto);
      expect(result.fullName).toBe('New');
    });
  });
});
