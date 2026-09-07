import { Test, TestingModule } from '@nestjs/testing';
import { AddressController } from './address.controller';
import { AddressService } from './address.service';
import { BadRequestException } from '@nestjs/common';
import { MESSAGES } from 'src/common/constants/messages.constant';
import { RESOURCES } from 'src/common/constants/resources.constant';

jest.mock('vietnam-administrative-address', () => ({
  convertAddressText: jest.fn(),
  convertOldToNew: jest.fn(),
}));

jest.mock('vietnam-administrative-address/data', () => ({
  newProvinces: {},
  newWards: {},
}));

describe('AddressController', () => {
  let controller: AddressController;
  //   let service: AddressService;

  const mockAddressService = {
    parseAndConvertText: jest.fn(),
    convertStructuredOldAddress: jest.fn(),
    getProvinces: jest.fn(),
    getWards: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AddressController],
      providers: [
        {
          provide: AddressService,
          useValue: mockAddressService,
        },
      ],
    }).compile();

    controller = module.get<AddressController>(AddressController);
    // service = module.get<AddressService>(AddressService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // =====================================================================
  // METHOD: suggestAddress
  // =====================================================================
  describe('suggestAddress', () => {
    // ✅ 1 SUCCESS CASE
    it('should successfully return address suggestions', async () => {
      const mockResult = {
        inputType: 'old',
        status: 'matched',
        originalText: '123 Le Loi',
      };
      mockAddressService.parseAndConvertText.mockResolvedValue(mockResult);

      const result = await controller.suggestAddress('123 Le Loi, Q1');

      expect(result.data.isUpdateNeeded).toBe(true);
      expect(result.data.suggestion).toEqual(mockResult);
      expect(result.message).toBe(
        MESSAGES.SUCCESS.RETRIEVED(RESOURCES.ADDRESS.SUGGESTION),
      );
    });

    // ❌ 5 FAIL CASES
    it('should throw BadRequestException if text is undefined', async () => {
      await expect(controller.suggestAddress(undefined as any)).rejects.toThrow(
        new BadRequestException(
          MESSAGES.ERROR.VALIDATION.ADDRESS.TOO_SHORT_TO_PARSE,
        ),
      );
    });

    it('should throw BadRequestException if text is an empty string', async () => {
      await expect(controller.suggestAddress('')).rejects.toThrow(
        new BadRequestException(
          MESSAGES.ERROR.VALIDATION.ADDRESS.TOO_SHORT_TO_PARSE,
        ),
      );
    });

    it('should throw BadRequestException if text length is less than 5', async () => {
      await expect(controller.suggestAddress('HCM')).rejects.toThrow(
        new BadRequestException(
          MESSAGES.ERROR.VALIDATION.ADDRESS.TOO_SHORT_TO_PARSE,
        ),
      );
    });

    it('should throw BadRequestException if service returns null (parse failed)', async () => {
      mockAddressService.parseAndConvertText.mockResolvedValue(null);

      await expect(
        controller.suggestAddress('Unknown string that fails'),
      ).rejects.toThrow(
        new BadRequestException(
          MESSAGES.ERROR.VALIDATION.PARSE_FAILED(RESOURCES.ADDRESS.BASE),
        ),
      );
    });

    it('should pass refresh flag exactly as a boolean to the service', async () => {
      mockAddressService.parseAndConvertText.mockResolvedValue({});
      await controller.suggestAddress('Valid text', 'false'); // Not 'true'

      expect(mockAddressService.parseAndConvertText).toHaveBeenCalledWith(
        'Valid text',
        false,
      );
    });
  });

  // =====================================================================
  // METHOD: convertStructured
  // =====================================================================
  describe('convertStructured', () => {
    // ✅ 1 SUCCESS CASE
    it('should successfully return converted structured data', async () => {
      const mockData = { status: 'matched', mappedResult: {} };
      mockAddressService.convertStructuredOldAddress.mockResolvedValue(
        mockData,
      );

      const result = await controller.convertStructured('HCM', 'Q1', 'Da Kao');

      expect(result.data).toEqual(mockData);
      expect(result.message).toBe(MESSAGES.SUCCESS.ADDRESS.CONVERTED);
    });

    // ❌ 4 FAIL CASES
    it('should throw BadRequestException if province is missing', async () => {
      await expect(
        controller.convertStructured('', 'Q1', 'Da Kao'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if district is missing', async () => {
      await expect(
        controller.convertStructured('HCM', '', 'Da Kao'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if ward is missing', async () => {
      await expect(
        controller.convertStructured('HCM', 'Q1', ''),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if all fields are missing', async () => {
      await expect(
        controller.convertStructured(
          undefined as any,
          undefined as any,
          undefined as any,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
