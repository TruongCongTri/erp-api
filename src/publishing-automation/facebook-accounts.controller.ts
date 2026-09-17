import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { PermissionsGuard } from 'src/common/guards/permissions.guard';
import { RequireAnyPermissions } from 'src/common/decorators/require-any-permissions.decorator';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import type { ActiveUserData } from 'src/common/decorators/current-user.decorator';
import { FacebookAccountsService } from './facebook-accounts.service';
import { CreateFacebookAccountDto } from './dto/create-facebook-account.dto';
import { UpdateFacebookAccountStatusDto } from './dto/update-facebook-account-status.dto';

@Controller('facebook/accounts')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class FacebookAccountsController {
  constructor(private readonly accountsService: FacebookAccountsService) {}

  @Post()
  @RequireAnyPermissions(
    'publishing_automation:create:any',
    'publishing_automation:manage:any',
  )
  async create(
    @Body() dto: CreateFacebookAccountDto,
    @CurrentUser() user: ActiveUserData,
  ) {
    const data = await this.accountsService.create(dto, user);
    return {
      success: true,
      data,
      message: 'Đã thêm tài khoản Facebook thành công',
    };
  }

  @Get()
  @RequireAnyPermissions(
    'publishing_automation:read:any',
    'publishing_automation:manage:any',
  )
  async findAll() {
    const data = await this.accountsService.findAll();
    return {
      success: true,
      data,
      message: 'Lấy danh sách tài khoản Facebook thành công',
    };
  }

  @Patch(':id/status')
  @RequireAnyPermissions(
    'publishing_automation:update:any',
    'publishing_automation:manage:any',
  )
  async updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateFacebookAccountStatusDto,
    @CurrentUser() user: ActiveUserData,
  ) {
    const data = await this.accountsService.updateStatus(id, dto, user);
    return {
      success: true,
      data,
      message: 'Cập nhật trạng thái tài khoản Facebook thành công',
    };
  }
}
