import {
  Controller,
  Delete,
  Query,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { CacheService } from './cache.service';
// import { RolesGuard } from '../auth/guards/roles.guard';
// import { Roles } from '../auth/decorators/roles.decorator';

@Controller('system/cache')
// @UseGuards(JwtAuthGuard, RolesGuard)
// @Roles('admin') // Strictly lock this down!
export class CacheController {
  constructor(private readonly cacheService: CacheService) {}

  @Delete()
  async clearCache(@Query('pattern') pattern: string) {
    if (!pattern || pattern.length < 3) {
      throw new BadRequestException(
        'Must provide a valid cache pattern (e.g., "address:*")',
      );
    }

    // Security check: Prevent admins from accidentally wiping standard sessions
    if (pattern === '*' || pattern.includes('session')) {
      throw new BadRequestException('Unsafe wildcard pattern rejected.');
    }

    await this.cacheService.delPattern(pattern);

    return {
      message: `Cache keys matching pattern '${pattern}' have been flushed.`,
    };
  }
}
