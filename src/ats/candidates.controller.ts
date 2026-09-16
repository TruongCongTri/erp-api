import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
  ParseUUIDPipe,
} from '@nestjs/common';
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

  @Get()
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
    const result = await this.candidatesService.findAll(query, user);
    return {
      success: true,
      data: result.data,
      meta: result.meta,
      message: 'Lấy danh sách ứng viên thành công',
    };
  }

  @Get(':id')
  @RequireAnyPermissions(
    'ats_candidate:read:any',
    'ats_candidate:read:dept',
    'ats:candidates:read',
    'ats:candidates:manage',
  )
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: ActiveUserData,
  ) {
    const data = await this.candidatesService.findOne(id, user);
    return {
      success: true,
      data,
      message: 'Lấy chi tiết hồ sơ ứng viên thành công',
    };
  }
}
