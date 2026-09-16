// common/transformers/to-array.transformer.ts

function sanitizeString(val: unknown): string | null {
  if (typeof val === 'string') {
    const trimmed = val.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof val === 'number' || typeof val === 'boolean') {
    return String(val);
  }
  return null;
}

export function toArray<T = string>(value: unknown): T[] | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  // Case 1: Already an array (e.g. ?status=A&status=B)
  if (Array.isArray(value)) {
    const sanitized = (value as unknown[])
      .map(sanitizeString)
      .filter((item): item is string => item !== null);

    return sanitized.length > 0 ? (sanitized as unknown as T[]) : undefined;
  }

  // Case 2: Comma-separated string (e.g. ?status=A,B)
  if (typeof value === 'string') {
    const sanitized = value
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    return sanitized.length > 0 ? (sanitized as unknown as T[]) : undefined;
  }

  // Case 3: Single scalar primitive
  const single = sanitizeString(value);
  return single !== null ? ([single] as unknown as T[]) : undefined;
}
