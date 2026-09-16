import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  DepartmentsService,
  AuthenticatedUserContext,
} from './departments.service';
import { CreateDepartmentDto } from './dto/create-department.dto';
import { UpdateDepartmentDto } from './dto/update-department.dto';
import { QueryDepartmentDto } from './dto/query-department.dto';
import { AssignHeadDto } from './dto/assign-head.dto';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';

interface AuthenticatedRequest {
  user: AuthenticatedUserContext;
}

@Controller('departments')
@UseGuards(JwtAuthGuard)
export class DepartmentsController {
  constructor(private readonly departmentsService: DepartmentsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateDepartmentDto, @Req() req: AuthenticatedRequest) {
    return this.departmentsService.create(dto, req.user);
  }

  @Get()
  findAll(@Query() query: QueryDepartmentDto) {
    return this.departmentsService.findAll(query);
  }

  @Get('tree')
  getTree(@Query('organizationId') organizationId?: string) {
    return this.departmentsService.getTree(organizationId);
  }

  @Get(':idOrSlug')
  findOne(@Param('idOrSlug') idOrSlug: string) {
    return this.departmentsService.findOne(idOrSlug);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateDepartmentDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.departmentsService.update(id, dto, req.user);
  }

  @Patch(':id/assign-head')
  assignHead(
    @Param('id') id: string,
    @Body() dto: AssignHeadDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.departmentsService.assignHead(id, dto.headUserId, req.user);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.departmentsService.remove(id, req.user);
  }
}
