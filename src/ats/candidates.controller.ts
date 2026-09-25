import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { CandidatesService } from './candidates.service';
import { QueryCandidatesDto } from './dto/candidate-query.dto';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { PermissionsGuard } from 'src/common/guards/permissions.guard';
import { RequireAnyPermissions } from 'src/common/decorators/require-any-permissions.decorator';
import { AuditInterceptor } from 'src/audit-log/audit.interceptor';
import {
  ActiveUserData,
  CurrentUser,
} from 'src/common/decorators/current-user.decorator';

@Controller('ats/candidates')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@UseInterceptors(AuditInterceptor)
export class CandidatesController {
  constructor(private readonly candidatesService: CandidatesService) {}

  // ==========================================
  // 1. DANH SÁCH ỨNG VIÊN (KHỐNG CHẾ TRẦN PHÂN TRANG & LEAN PAYLOAD)
  // ==========================================
  @Get()
  @HttpCode(HttpStatus.OK)
  @RequireAnyPermissions(
    'ats_candidate:read:any',
    'ats_candidate:read:dept',
    'ats:candidates:read',
    'ats:candidates:manage',
  )
  async findAll(
    @Query() query: QueryCandidatesDto,
    @CurrentUser() user: ActiveUserData,
  ) {
    // Tiêu chí 1: Khống chế limit tối đa 100 để tránh tràn bộ đệm PostgreSQL
    const boundedQuery: QueryCandidatesDto = {
      ...query,
      page: Math.max(1, Number(query.page) || 1),
      limit: Math.min(Math.max(1, Number(query.limit) || 10), 100),
    };

    const result = await this.candidatesService.findAll(boundedQuery, user);
    return {
      success: true,
      data: result.data,
      meta: result.meta,
      message: 'Lấy danh sách ứng viên thành công',
    };
  }

  // ==========================================
  // 2. CHI TIẾT HỒ SƠ ỨNG VIÊN (HTTP CACHE + REDIS HOT-CACHE)
  // ==========================================
  @Get(':id')
  @RequireAnyPermissions(
    'ats_candidate:read:any',
    'ats_candidate:read:dept',
    'ats:candidates:read',
    'ats:candidates:manage',
  )
  async findOne(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() user: ActiveUserData,
    @Res({ passthrough: true }) res: Response,
  ) {
    const data = await this.candidatesService.findOne(id, user);

    // Tiêu chí 4: Cấp phép cache 60s cho client/gateway (Stale-while-revalidate 30s)
    res.setHeader(
      'Cache-Control',
      'private, max-age=60, stale-while-revalidate=30',
    );
    return {
      success: true,
      data,
      message: 'Lấy chi tiết hồ sơ ứng viên thành công',
    };
  }
}
