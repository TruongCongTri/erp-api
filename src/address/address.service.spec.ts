import { Test, TestingModule } from '@nestjs/testing';
import { AddressService } from './address.service';
import { CacheService } from 'src/common/cache/cache.service';
import { BadRequestException } from '@nestjs/common';

// 1. Mock the third-party library entirely
jest.mock('vietnam-administrative-address', () => ({
  convertAddressText: jest.fn(),
  convertOldToNew: jest.fn(),
}));

jest.mock('vietnam-administrative-address/data', () => ({
  newProvinces: {
    '79': { code: '79', name: 'Hồ Chí Minh' },
    '01': { code: '01', name: 'Hà Nội' },
  },
  newWards: {
    '26734': { code: '26734', name: 'Đa Kao', parent_code: '760' },
    '12345': { code: '12345', name: 'Bến Nghé', parent_code: '760' },
    '99999': { code: '99999', name: 'Láng Hạ', parent_code: '001' },
  },
}));

import { convertAddressText } from 'vietnam-administrative-address';

describe('AddressService', () => {
  let service: AddressService;

  const mockCacheService = {
    // We simulate a cache miss by instantly executing the callback (fetcher)
    getOrSet: jest.fn(async (key: string, fetcher: () => Promise<unknown>) =>
      fetcher(),
    ),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AddressService,
        {
          provide: CacheService,
          useValue: mockCacheService,
        },
      ],
    }).compile();

    service = module.get<AddressService>(AddressService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // =====================================================================
  // METHOD: parseAndConvertText
  // =====================================================================
  describe('parseAndConvertText', () => {
    // ✅ 1 SUCCESS CASE
    it('should map the third-party response to ParsedAddressResult interface', async () => {
      const mockPackageResponse = {
        text: '123 Le Loi',
        input_type: 'old',
        street_address: '123 Le Loi',
        converted_text: '123 Lê Lợi',
        parsed: { street: '123 Le Loi' },
        converted: { province: 'HCM' },
        conversion: { status: 'matched', confidence: 1, candidates: [] },
      };
      (convertAddressText as jest.Mock).mockReturnValue(mockPackageResponse);

      const result = await service.parseAndConvertText('123 Le Loi');

      expect(result).toEqual({
        originalText: '123 Le Loi',
        inputType: 'old',
        street: '123 Le Loi',
        convertedText: '123 Lê Lợi',
        parsedOld: { street: '123 Le Loi' },
        newLocation: { province: 'HCM' },
        status: 'matched',
        confidence: 1,
        candidates: [],
      });
      expect(convertAddressText).toHaveBeenCalledWith('123 Le Loi', {
        multiple: 'all',
      });
    });

    // ❌ FAIL CASES
    it('should return null immediately if text is empty without calling the library', async () => {
      const result = await service.parseAndConvertText('');
      expect(result).toBeNull();
      expect(convertAddressText).not.toHaveBeenCalled();
    });
  });

  // =====================================================================
  // METHOD: getWards
  // =====================================================================
  describe('getWards', () => {
    // ✅ 1 SUCCESS CASE
    it('should return only wards that match the parent province code', () => {
      // Province 760 (District 1 HCM) has 2 wards in our mock
      const result = service.getWards('760');

      expect(result).toHaveLength(2);
      expect(result.map((r) => r.name)).toContain('Đa Kao');
      expect(result.map((r) => r.name)).toContain('Bến Nghé');
      expect(result.map((r) => r.name)).not.toContain('Láng Hạ'); // belongs to 001
    });

    // ❌ FAIL CASES
    it('should throw BadRequestException if provinceCode is empty string', () => {
      expect(() => service.getWards('')).toThrow(BadRequestException);
    });

    it('should throw BadRequestException if provinceCode is undefined', () => {
      expect(() => service.getWards(undefined as any)).toThrow(
        BadRequestException,
      );
    });

    it('should return an empty array if province code exists but has no wards', () => {
      const result = service.getWards('999_NON_EXISTENT');
      expect(result).toEqual([]);
    });
  });
});
