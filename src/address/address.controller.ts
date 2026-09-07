// src/address/address.controller.ts
import {
  Controller,
  Get,
  Query,
  BadRequestException,
  Param,
} from '@nestjs/common';
import { AddressService } from './address.service';
import { Throttle } from '@nestjs/throttler';
import { ROUTES } from 'src/common/constants/routes.constant';
import { MESSAGES } from 'src/common/constants/messages.constant';
import { RESOURCES } from 'src/common/constants/resources.constant';

@Controller(ROUTES.ADDRESS.BASE)
export class AddressController {
  constructor(private readonly addressService: AddressService) {}

  /**
   * GET /address/suggest?text=123+Le+Loi,+Da+Kao,+Quan+1
   * The frontend calls this while the user types to get suggestions.
   */
  // High Traffic: Accommodate fast typing and autocomplete UI
  @Throttle({ default: { limit: 300, ttl: 60000 } }) // 300 requests per minute
  @Get(ROUTES.ADDRESS.SUGGEST)
  async suggestAddress(
    @Query('text') text: string,
    @Query('refresh') refresh?: string,
  ) {
    if (!text || text.length < 5)
      throw new BadRequestException(
        MESSAGES.ERROR.VALIDATION.ADDRESS.TOO_SHORT_TO_PARSE,
      );

    const forceRefresh = refresh === 'true';
    const suggestion = await this.addressService.parseAndConvertText(
      text,
      forceRefresh,
    );

    if (!suggestion)
      throw new BadRequestException(
        MESSAGES.ERROR.VALIDATION.PARSE_FAILED(RESOURCES.ADDRESS.BASE),
      );

    // If the library detects it was an 'old' address and successfully converted it
    const isUpdateNeeded =
      suggestion.inputType === 'old' && suggestion.status === 'matched';

    return {
      data: {
        isUpdateNeeded,
        suggestion,
      },
      message: MESSAGES.SUCCESS.RETRIEVED(RESOURCES.ADDRESS.SUGGESTION),
    };
  }

  /**
   * GET /address/convert-structured?province=...&district=...&ward=...
   */
  @Get(ROUTES.ADDRESS.CONVERT)
  async convertStructured(
    @Query('province') province: string,
    @Query('district') district: string,
    @Query('ward') ward: string,
    @Query('refresh') refresh?: string,
  ) {
    if (!province || !district || !ward)
      throw new BadRequestException(
        MESSAGES.ERROR.VALIDATION.REQUIRED_FIELDS([
          RESOURCES.ADDRESS.PROVINCE,
          RESOURCES.ADDRESS.DISTRICT,
          RESOURCES.ADDRESS.WARD,
        ]),
      );

    const forceRefresh = refresh === 'true';
    const data = await this.addressService.convertStructuredOldAddress(
      province,
      district,
      ward,
      forceRefresh,
    );

    return {
      data,
      message: MESSAGES.SUCCESS.ADDRESS.CONVERTED,
    };
  }

  // =========================================================================
  // ENDPOINTS FOR Frontend UI Dropdowns
  // =========================================================================

  @Get(ROUTES.ADDRESS.PROVINCES)
  getProvinces() {
    const data = this.addressService.getProvinces();
    return {
      data,
      message: MESSAGES.SUCCESS.RETRIEVED(RESOURCES.ADDRESS.PROVINCES),
    };
  }

  @Get(ROUTES.ADDRESS.WARDS)
  getWards(@Param('code') provinceCode: string) {
    const data = this.addressService.getWards(provinceCode);
    return {
      data,
      message: MESSAGES.SUCCESS.RETRIEVED(RESOURCES.ADDRESS.WARDS),
    };
  }
}
