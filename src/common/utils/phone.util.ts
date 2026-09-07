// src/common/utils/phone.util.ts
export const VN_NETWORKS = {
  VIETTEL: [
    '086',
    '096',
    '097',
    '098',
    '032',
    '033',
    '034',
    '035',
    '036',
    '037',
    '038',
    '039',
  ],
  VINAPHONE: ['088', '091', '094', '081', '082', '083', '084', '085'],
  MOBIFONE: ['089', '090', '093', '070', '079', '077', '076', '078'],
  VIETNAMOBILE: ['092', '056', '058'],
  GMOBILE: ['099', '059'],
  ITEL: ['087'],
  WINTEL: ['055'],
};

export function getVnNetworkProvider(phone: string): string | null {
  // Normalize: replace +84 or 84 at the start with 0
  const normalizedPhone = phone.replace(/^(?:\+84|84)/, '0');

  if (normalizedPhone.length !== 10) return null;

  const prefix = normalizedPhone.substring(0, 3);

  for (const [network, prefixes] of Object.entries(VN_NETWORKS)) {
    if (prefixes.includes(prefix)) {
      return network;
    }
  }
  return null;
}

// Convert any valid VN phone input into standard E.164 (+84)
export function formatToE164(phone: string): string {
  if (!phone) return phone;

  // Remove all spaces or dashes the user might have accidentally typed
  const cleaned = phone.replace(/[\s-]/g, '');

  if (cleaned.startsWith('0')) return `+84${cleaned.slice(1)}`;
  if (cleaned.startsWith('84')) return `+${cleaned}`;

  return cleaned; // Assumes it already starts with +84 if it reaches here
}
