// src/address/address.service.ts
import {
  convertAddressText,
  convertOldToNew,
  newProvinces,
  newWards,
} from 'vietnam-administrative-address';
// import { newProvinces, newWards } from 'vietnam-administrative-address/data';
import { Injectable, BadRequestException } from '@nestjs/common';
import { CacheService } from 'src/common/cache/cache.service';
import { Cacheable } from 'src/common/cache/decorators/cacheable.decorator';

// 1. Define strictly typed interfaces matching the package's JSON structure
export interface AdministrativeUnit {
  name: string;
  slug: string;
  type: string;
  name_with_type: string;
  code: string;
}

export interface SubUnit extends AdministrativeUnit {
  path: string;
  path_with_type: string;
  parent_code: string; // Used to link Ward -> District, or District -> Province
}

export interface ParsedAddressResult {
  originalText: string;
  inputType: 'old' | 'new';
  street: string;
  convertedText: string;
  parsedOld: Record<string, string>;
  newLocation: Record<string, unknown>;
  status?: 'matched' | 'ambiguous' | 'not_found' | 'invalid_input';
  confidence?: number;
  candidates: unknown[];
}

export interface ConvertedAddressResult {
  status: 'matched' | 'ambiguous' | 'not_found' | 'invalid_input';
  confidence: number;
  mappedResult: Record<string, unknown> | undefined;
  candidates: unknown[];
}

// 2. Mask the untyped imports by casting them through 'unknown'
const strictProvinces = newProvinces as unknown as Record<
  string,
  AdministrativeUnit
>;
const strictWards = newWards as unknown as Record<string, SubUnit>;

@Injectable()
export class AddressService {
  constructor(readonly cacheService: CacheService) {}

  /**
   * For when the user types a raw string like:
   * "123 Lê Lợi, Đa Kao, Quận 1, HCM"
   */
  @Cacheable({
    key: (text: unknown) => `address:suggest:${text as string}`,
    forceRefresh: (_t: unknown, bypassCache: unknown) => bypassCache === true,
    ttlSeconds: 2592000,
  })
  parseAndConvertText(
    addressText: string,
    _bypassCache?: boolean,
  ): Promise<ParsedAddressResult | null> {
    if (!addressText) return Promise.resolve(null);

    // Use multiple: 'all' so we can show candidates if it is ambiguous
    const result = convertAddressText(addressText, {
      multiple: 'all',
    });

    return Promise.resolve({
      originalText: result.text,
      inputType: result.input_type,
      street: result.street_address,
      convertedText: result.converted_text,
      parsedOld: result.parsed,
      newLocation: result.converted,
      status: result.conversion?.status,
      confidence: result.conversion?.confidence,
      candidates: result.conversion?.candidates || [],
    });
  }

  /**
   * For when the frontend already has dropdowns for Province/District/Ward
   * but the user selected an old one.
   */
  @Cacheable({
    key: (p: unknown, d: unknown, w: unknown) =>
      `address:convert:${p as string}:${d as string}:${w as string}`,
    forceRefresh: (
      _p: unknown,
      _d: unknown,
      _w: unknown,
      bypassCache: unknown,
    ) => bypassCache === true,
    ttlSeconds: 2592000,
  })
  convertStructuredOldAddress(
    provinceName: string,
    districtName: string,
    wardName: string,
    _bypassCache?: boolean,
  ): Promise<ConvertedAddressResult> {
    const result = convertOldToNew(
      {
        province_name: provinceName,
        district_name: districtName,
        ward_name: wardName,
      },
      { multiple: 'all' },
    );

    return Promise.resolve({
      status: result.status,
      confidence: result.confidence,
      mappedResult: result.result,
      candidates: result.candidates,
    });
  }

  // STATIC METHODS (No Redis needed - served instantly from Node.js RAM)
  getProvinces(): AdministrativeUnit[] {
    // Convert the dictionary object into a standard array for the frontend
    return Object.values(strictProvinces);
  }

  getWards(provinceCode: string): SubUnit[] {
    if (!provinceCode) throw new BadRequestException('Province code required');

    // Convert to array and filter by parent_code
    return Object.values(strictWards).filter(
      (ward) => ward.parent_code === provinceCode,
    );
  }
}
