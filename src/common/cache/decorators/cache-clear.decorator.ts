import { InternalServerErrorException } from '@nestjs/common';
import { CacheService } from '../cache.service';

export interface CacheClearTarget {
  cacheService?: CacheService;
}

export interface CacheClearOptions {
  /**
   * A static string/array, or a function resolving to a string/array based on args
   */
  key: string | string[] | ((...args: unknown[]) => string | string[]);
  /**
   * If true, uses SCAN to delete wildcard patterns (e.g. 'user:*')
   */
  isPattern?: boolean;
}

interface StrictMethod<Context, Args extends unknown[], ReturnType> {
  apply(thisArg: Context, args: Args): ReturnType;
}

export function CacheClear(options: CacheClearOptions) {
  return function <
    ThisType extends CacheClearTarget,
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
          `@CacheClear() requires 'cacheService' to be injected in the decorated class`,
        );
      }

      // 1. Execute the mutation method FIRST to ensure the database actually updated
      const result = await originalMethod.apply(this, args);

      // 2. Resolve the keys dynamically
      const resolvedKeys =
        typeof options.key === 'function' ? options.key(...args) : options.key;

      const keysToDelete = Array.isArray(resolvedKeys)
        ? resolvedKeys
        : [resolvedKeys];

      if (keysToDelete.length > 0) {
        if (options.isPattern) {
          // 3a. Delete by pattern (e.g., clearing lists)
          await Promise.all(
            keysToDelete.map((pattern) => cacheService.delPattern(pattern)),
          );
        } else {
          // 3b. Delete exact keys
          await cacheService.del(...keysToDelete);
        }
      }

      // 4. Return the result of the original method
      return result;
    };

    return descriptor;
  };
}
