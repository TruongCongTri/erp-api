import {
  Controller,
  Post,
  Body,
  Param,
  UseGuards,
  Patch,
} from '@nestjs/common';
import { IdentityService } from './identity.service';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { PermissionsGuard } from 'src/common/guards/permissions.guard';
import { RequirePermissions } from 'src/common/decorators/require-permissions.decorator';
import {
  CurrentUser,
  type ActiveUserData,
} from 'src/common/decorators/current-user.decorator';
import { SecureAccessDto } from 'src/common/dto/secure-access.dto';
import { ParseCccdQrDto } from './dto/parse-cccd-qr.dto';
import { CreateCitizenIdentityDto } from './dto/create-citizen-identity.dto';
import { UpdateCitizenIdentityDto } from './dto/update-citizen-identity.dto';

@Controller('identity')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class IdentityController {
  constructor(private readonly identityService: IdentityService) {}

  @Post('users/:userId/secure-cccd')
  @RequirePermissions('hr:read:any')
  async getCccdSecurely(
    @Param('userId') userId: string,
    @Body() dto: SecureAccessDto,
    @CurrentUser() requester: ActiveUserData,
  ) {
    const data = await this.identityService.getCccdSecurely(
      userId,
      requester,
      dto,
    );
    return { data, message: 'CCCD accessed securely' };
  }

  @Post('cccd/parse-qr')
  @RequirePermissions('hr:create:any', 'hr:update:any')
  parseQrCode(@Body() dto: ParseCccdQrDto) {
    const data = this.identityService.parseCccdQr(dto.qrString);
    return { data, message: 'QR Code parsed successfully' };
  }

  @Post('users/:userId/cccd')
  @RequirePermissions('hr:create:any', 'hr:update:any')
  async createCccd(
    @Param('userId') userId: string,
    @Body() dto: CreateCitizenIdentityDto,
    @CurrentUser() adminUser: ActiveUserData,
  ) {
    // You will need to add this method to your IdentityService!
    const data = await this.identityService.createCccd(userId, dto, adminUser);
    return { data, message: 'CCCD created successfully' };
  }

  @Patch('users/:userId/cccd')
  @RequirePermissions('hr:update:any')
  async updateCccd(
    @Param('userId') userId: string,
    @Body() dto: UpdateCitizenIdentityDto,
    @CurrentUser() adminUser: ActiveUserData,
  ) {
    const data = await this.identityService.updateCccd(userId, dto, adminUser);
    return { data, message: 'CCCD updated successfully' };
  }
}
