import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { TicketService } from './ticket.service';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { QueryTicketDto } from './dto/query-ticket.dto';
import { AssignTicketDto } from './dto/assign-ticket.dto';
import { ResolveTicketDto } from './dto/resolve-ticket.dto';
import { RejectTicketDto } from './dto/reject-ticket.dto';
import { ScheduleTicketMeetingDto } from './dto/schedule-ticket-meeting.dto';
import { RecordMeetingOutcomesDto } from './dto/record-meeting-outcomes.dto';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import type { ActiveUserData } from 'src/common/decorators/current-user.decorator';
import { AuditInterceptor } from 'src/audit-log/audit.interceptor';
import { AuditAction } from 'src/audit-log/audit-action.decorator';
import { AuditActionType } from 'src/audit-log/audit-log.types';

@Controller('tickets')
@UseGuards(JwtAuthGuard)
@UseInterceptors(AuditInterceptor)
export class TicketController {
  constructor(private readonly ticketService: TicketService) {}

  @Post()
  @AuditAction({
    actionType: AuditActionType.CREATE,
    actionLabel: 'Khởi tạo Ticket',
    resourceSlug: 'ticket',
    resourceLabel: 'Yêu cầu phối hợp',
  })
  async create(
    @Body() dto: CreateTicketDto,
    @CurrentUser() user: ActiveUserData,
  ) {
    const data = await this.ticketService.create(dto, user);
    return {
      success: true,
      data,
      message: 'Tạo phiếu yêu cầu phối hợp thành công',
    };
  }

  @Get()
  async findAll(
    @Query() query: QueryTicketDto,
    @CurrentUser() user: ActiveUserData,
  ) {
    const result = await this.ticketService.findAll(query, user);
    return {
      success: true,
      data: result.data,
      meta: result.meta,
      message: 'Lấy danh sách ticket thành công',
    };
  }

  @Get(':id')
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    const data = await this.ticketService.findOne(id);
    return {
      success: true,
      data,
      message: 'Lấy chi tiết ticket thành công',
    };
  }

  @Patch(':id/assign')
  @AuditAction({
    actionType: AuditActionType.UPDATE,
    actionLabel: 'Phân công xử lý Ticket',
    resourceSlug: 'ticket',
    resourceLabel: 'Yêu cầu phối hợp',
    targetEntityIdParam: 'id',
  })
  async assign(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignTicketDto,
    @CurrentUser() user: ActiveUserData,
  ) {
    const data = await this.ticketService.assign(id, dto, user);
    return {
      success: true,
      data,
      message: 'Phân công ticket thành công',
    };
  }

  @Post(':id/meetings')
  @AuditAction({
    actionType: AuditActionType.CREATE,
    actionLabel: 'Lên lịch họp giải quyết Ticket',
    resourceSlug: 'ticket_meeting',
    resourceLabel: 'Cuộc họp phối hợp',
    targetEntityIdParam: 'id',
  })
  async scheduleMeeting(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ScheduleTicketMeetingDto,
    @CurrentUser() user: ActiveUserData,
  ) {
    const data = await this.ticketService.scheduleMeeting(id, dto, user);
    return {
      success: true,
      data,
      message: 'Thiết lập cuộc họp đối soát thành công',
    };
  }

  @Patch(':id/meetings/:meetingId/outcomes')
  @AuditAction({
    actionType: AuditActionType.UPDATE,
    actionLabel: 'Ghi biên bản và kết luận cuộc họp Ticket',
    resourceSlug: 'ticket_meeting',
    resourceLabel: 'Cuộc họp phối hợp',
    targetEntityIdParam: 'id',
  })
  async recordMeetingOutcomes(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('meetingId', ParseUUIDPipe) meetingId: string,
    @Body() dto: RecordMeetingOutcomesDto,
    @CurrentUser() user: ActiveUserData,
  ) {
    const data = await this.ticketService.recordMeetingOutcomes(
      id,
      meetingId,
      dto,
      user,
    );
    return {
      success: true,
      data,
      message: 'Cập nhật biên bản cuộc họp thành công',
    };
  }

  @Patch(':id/resolve')
  @AuditAction({
    actionType: AuditActionType.APPROVE,
    actionLabel: 'Giải quyết Ticket',
    resourceSlug: 'ticket',
    resourceLabel: 'Yêu cầu phối hợp',
    targetEntityIdParam: 'id',
  })
  async resolve(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResolveTicketDto,
    @CurrentUser() user: ActiveUserData,
  ) {
    const data = await this.ticketService.resolve(id, dto, user);
    return {
      success: true,
      data,
      message: 'Xác nhận giải quyết ticket thành công',
    };
  }

  @Patch(':id/reject')
  @AuditAction({
    actionType: AuditActionType.REJECT,
    actionLabel: 'Từ chối tiếp nhận Ticket',
    resourceSlug: 'ticket',
    resourceLabel: 'Yêu cầu phối hợp',
    targetEntityIdParam: 'id',
  })
  async reject(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectTicketDto,
    @CurrentUser() user: ActiveUserData,
  ) {
    const data = await this.ticketService.reject(id, dto, user);
    return {
      success: true,
      data,
      message: 'Từ chối ticket thành công',
    };
  }

  @Patch(':id/close')
  @AuditAction({
    actionType: AuditActionType.UPDATE,
    actionLabel: 'Đóng Ticket',
    resourceSlug: 'ticket',
    resourceLabel: 'Yêu cầu phối hợp',
    targetEntityIdParam: 'id',
  })
  async close(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: ActiveUserData,
  ) {
    const data = await this.ticketService.close(id, user);
    return {
      success: true,
      data,
      message: 'Chính thức đóng phiếu yêu cầu',
    };
  }

  @Patch(':id/reopen')
  @AuditAction({
    actionType: AuditActionType.UPDATE,
    actionLabel: 'Khiếu nại & Mở lại Ticket',
    resourceSlug: 'ticket',
    resourceLabel: 'Yêu cầu phối hợp',
    targetEntityIdParam: 'id',
  })
  async reopen(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('reason') reason: string,
    @CurrentUser() user: ActiveUserData,
  ) {
    const data = await this.ticketService.reopen(id, reason, user);
    return {
      success: true,
      data,
      message: 'Mở lại ticket thành công',
    };
  }
}
