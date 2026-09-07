import { InternalServerErrorException } from '@nestjs/common';
import { CacheService } from '../cache.service';

export interface CacheableTarget {
  cacheService?: CacheService;
}

interface StrictMethod<Context, Args extends unknown[], ReturnType> {
  (this: Context, ...args: Args): ReturnType;
  apply(thisArg: Context, args: Args): ReturnType;
  call(thisArg: Context, ...args: Args): ReturnType;
  bind(thisArg: Context): (...args: Args) => ReturnType;
}

export function Cacheable(options: {
  key: string | ((...args: unknown[]) => string);
  ttlSeconds?: number;
  forceRefresh?: (...args: unknown[]) => boolean;
}) {
  return function <
    ThisType extends CacheableTarget,
    MethodArgs extends unknown[],
    MethodReturn,
  >(
    target: ThisType,
    propertyKey: string | symbol,
    descriptor: TypedPropertyDescriptor<
      (this: ThisType, ...args: MethodArgs) => Promise<MethodReturn>
    >,
  ): TypedPropertyDescriptor<
    (this: ThisType, ...args: MethodArgs) => Promise<MethodReturn>
  > {
    const originalMethod = descriptor.value as unknown as StrictMethod<
      ThisType,
      MethodArgs,
      Promise<MethodReturn>
    >;

    if (!originalMethod) {
      return descriptor;
    }

    descriptor.value = async function (
      this: ThisType,
      ...args: MethodArgs
    ): Promise<MethodReturn> {
      const cacheService = this.cacheService;

      if (!cacheService) {
        throw new InternalServerErrorException(
          `@Cacheable() requires 'cacheService' to be injected in the decorated class`,
        );
      }

      const cacheKey =
        typeof options.key === 'function' ? options.key(...args) : options.key;

      const ttl = options.ttlSeconds ?? 3600;

      // Evaluate the forceRefresh flag
      const isForceRefresh = options.forceRefresh
        ? options.forceRefresh(...(args as unknown[]))
        : false;

      const fetcher = (): Promise<MethodReturn> =>
        originalMethod.apply(this, args);

      return cacheService.getOrSet<MethodReturn>(
        cacheKey,
        fetcher,
        ttl,
        isForceRefresh,
      );
    };

    return descriptor;
  };
}
