declare module 'vietnam-administrative-address' {
  export interface AdministrativeUnitData {
    name: string;
    slug: string;
    type: string;
    name_with_type: string;
    code: string;
    [key: string]: unknown;
  }

  export interface SubUnitData extends AdministrativeUnitData {
    path: string;
    path_with_type: string;
    parent_code: string;
  }

  // Export the datasets directly
  export const newProvinces: Record<string, AdministrativeUnitData>;
  export const newWards: Record<string, SubUnitData>;
  export const newDistricts: Record<string, SubUnitData>;

  export interface ConvertAddressTextResult {
    text: string;
    input_type: 'old' | 'new';
    street_address: string;
    converted_text: string;
    parsed: Record<string, string>;
    converted: Record<string, unknown>;
    conversion?: {
      status: 'matched' | 'ambiguous' | 'not_found' | 'invalid_input';
      confidence: number;
      candidates: unknown[];
    };
  }

  export interface ConvertOldToNewResult {
    status: 'matched' | 'ambiguous' | 'not_found' | 'invalid_input';
    confidence: number;
    result?: Record<string, unknown>;
    candidates: unknown[];
  }

  export function convertAddressText(
    text: string,
    options?: {
      multiple?: 'all' | 'first';
      strict?: boolean;
      allowBroadMatch?: boolean;
    },
  ): ConvertAddressTextResult;

  export function convertOldToNew(
    input: {
      province_name?: string;
      district_name?: string;
      ward_name?: string;
      province_code?: string;
      district_code?: string;
      ward_code?: string;
    },
    options?: {
      multiple?: 'all' | 'first';
      strict?: boolean;
      allowBroadMatch?: boolean;
    },
  ): ConvertOldToNewResult;
}
