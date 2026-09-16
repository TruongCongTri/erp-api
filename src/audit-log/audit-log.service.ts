// audit-log.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog } from './entities/audit-log.entity';
import { PaginationMetaDto } from 'src/common/dto/pagination.dto';

import { AuditExportJob } from './entities/audit-export-job.entity';
import { AuditRetentionPolicy } from './entities/audit-retention-policy.entity';
import { SaveAuditLogDto } from './dto/save-audit-log.dto';
import { QueryAuditLogDto } from './dto/query-audit-log.dto';
import { randomBytes } from 'crypto';
import {
  ActorRoleLevel,
  AuditActionType,
  AuditClientApp,
  AuditDataScope,
  AuditDiffPayload,
  AuditStatus,
} from './audit-log.types';
import { resolveActorRoleLevel } from './constants/role-hierarchy.constant';

@Injectable()
export class AuditLogService {
  private readonly logger = new Logger(AuditLogService.name);

  constructor(
    @InjectRepository(AuditLog)
    private readonly auditRepo: Repository<AuditLog>,
    @InjectRepository(AuditExportJob)
    private readonly exportRepo: Repository<AuditExportJob>,
    @InjectRepository(AuditRetentionPolicy)
    private readonly retentionRepo: Repository<AuditRetentionPolicy>,
  ) {}

  // =====================================
  // 1. GHI LOG (CREATE)
  // =====================================
  async logAction(dto: SaveAuditLogDto): Promise<void> {
    try {
      // Tự động sinh tracking code và correlation ID nếu không có
      const trackingCode =
        dto.trackingCode ||
        `#AUD-${randomBytes(3).toString('hex').toUpperCase()}`;
      const correlationId = dto.correlationId || randomBytes(8).toString('hex');

      // 1. Safely resolve role level without casting to `any`
      const actorRoleLevel =
        dto.actorRoleLevel ??
        (dto.roleSlug
          ? resolveActorRoleLevel(dto.roleSlug)
          : ActorRoleLevel.STAFF);

      // 2. Destructure diffPayload out of dto so its `unknown` type does not conflict with `JsonValue`
      const { diffPayload, ...restDto } = dto;

      const logEntry = this.auditRepo.create({
        ...restDto,
        actorRoleLevel,
        trackingCode,
        correlationId,
        diffPayload: diffPayload as unknown as AuditDiffPayload,
      });

      await this.auditRepo.save(logEntry);
    } catch (error) {
      // Audit log KHÔNG bao giờ được làm sập luồng chính của ứng dụng
      this.logger.error('Failed to save audit log', error);
    }
  }

  // =====================================
  // 2. TRUY VẤN (READ / DATATABLE)
  // =====================================
  async findAll(query: QueryAuditLogDto, scope: AuditDataScope) {
    const {
      page = 1,
      limit = 20,
      sortBy = 'timestamp',
      sortOrder = 'DESC',
      search,
      trackingCode,
      correlationId,
      actorId,
      actorDepartmentId,
      actorRoleLevel,
      targetDepartmentId,
      resourceSlug,
      targetEntityId,
      targetProjectId,
      actionType,
      status,
      fromDate,
      toDate,
    } = query;

    const skip = (page - 1) * limit;
    const qb = this.auditRepo.createQueryBuilder('audit');

    // ========================================================
    // 1. DATA SCOPE ENFORCEMENT (BẮT BUỘC - KHÔNG THỂ BYPASS)
    // ========================================================
    switch (scope.type) {
      case 'DEPARTMENT':
        // Cố định phòng ban của Trưởng phòng
        qb.andWhere('audit.targetDepartmentId = :scopedDeptId', {
          scopedDeptId: scope.departmentId,
        });
        // Ẩn toàn bộ log bảo mật / authentication khỏi Trưởng phòng
        qb.andWhere('audit.resourceSlug != :excludedSlug', {
          excludedSlug: scope.excludeResourceSlug,
        });
        break;

      case 'OWN':
        // Cố định ID của chính nhân viên (Bao gồm cả logs Auth của chính họ)
        qb.andWhere('audit.actorId = :scopedActorId', {
          scopedActorId: scope.actorId,
        });
        break;

      case 'ALL':
      default:
        // System Admin: Không ép điều kiện phạm vi
        break;
    }

    // ========================================================
    // 2. CÁC BỘ LỌC TÙY CHỌN TỪ CLIENT (FILTERS)
    // ========================================================
    if (search) {
      qb.andWhere(
        '(LOWER(audit.summary) LIKE LOWER(:search) OR LOWER(audit.actorName) LIKE LOWER(:search) OR LOWER(audit.trackingCode) LIKE LOWER(:search))',
        { search: `%${search}%` },
      );
    }

    if (trackingCode)
      qb.andWhere('audit.trackingCode = :trackingCode', { trackingCode });
    if (correlationId)
      qb.andWhere('audit.correlationId = :correlationId', { correlationId });

    // Chỉ áp dụng filter actorId/targetDepartmentId từ query nếu người dùng là Admin
    if (scope.type === 'ALL') {
      if (actorId) qb.andWhere('audit.actorId = :actorId', { actorId });
      if (targetDepartmentId && targetDepartmentId.length > 0) {
        qb.andWhere('audit.targetDepartmentId IN (:...targetDepartmentId)', {
          targetDepartmentId,
        });
      }
    }

    if (actorDepartmentId)
      qb.andWhere('audit.actorDepartmentId = :actorDepartmentId', {
        actorDepartmentId,
      });
    if (actorRoleLevel)
      qb.andWhere('audit.actorRoleLevel = :actorRoleLevel', { actorRoleLevel });

    if (resourceSlug) {
      // Nếu là DEP_HEAD và client cố tình search resourceSlug = 'authentication', query sẽ tự động rỗng
      qb.andWhere('audit.resourceSlug = :resourceSlug', { resourceSlug });
    }

    if (targetEntityId)
      qb.andWhere('audit.targetEntityId = :targetEntityId', { targetEntityId });
    if (targetProjectId)
      qb.andWhere('audit.targetProjectId = :targetProjectId', {
        targetProjectId,
      });

    if (actionType && actionType.length > 0) {
      qb.andWhere('audit.actionType IN (:...actionType)', { actionType });
    }
    if (status && status.length > 0) {
      qb.andWhere('audit.status IN (:...status)', { status });
    }

    if (fromDate) qb.andWhere('audit.timestamp >= :fromDate', { fromDate });
    if (toDate) qb.andWhere('audit.timestamp <= :toDate', { toDate });

    // Sắp xếp và phân trang
    qb.orderBy(`audit.${sortBy}`, sortOrder);
    qb.addOrderBy('audit.id', sortOrder);
    qb.skip(skip).take(limit);

    const [data, total] = await qb.getManyAndCount();
    const meta = PaginationMetaDto.create(page, limit, total);

    return { data, meta };
  }

  // =====================================
  // MOCK DATA GENERATOR (TESTING PURPOSES)
  // =====================================
  async seedMockAuditLogs() {
    const mockLogs: AuditLog[] = [];
    const now = new Date();

    const scenarios = [
      {
        actorName: 'Nguyễn Tổng Giám Đốc',
        roleSlug: 'EXEC_DIRECTOR',
        dept: 'BOD',
        action: AuditActionType.APPROVE,
        targetEntity: 'proj-001',
        resource: 'project',
        label: 'Phê duyệt dự án',
        summary: 'Phê duyệt kế hoạch tổng thể dự án Tòa nhà Sunrise',
      },
      {
        actorName: 'Trần Giám Đốc Nhân Sự',
        roleSlug: 'DIR_HR_ADMIN',
        dept: 'HR',
        action: AuditActionType.UPDATE,
        targetEntity: 'policy-hr-01',
        resource: 'policy',
        label: 'Ban hành chính sách',
        summary: 'Cập nhật quy chế phúc lợi nhân sự năm 2026',
      },
      {
        actorName: 'Lê Trưởng Phòng Kiến Trúc',
        roleSlug: 'HEAD_ARCHITECTURE',
        dept: 'DESIGN',
        action: AuditActionType.CREATE,
        targetEntity: 'dwg-arc-201',
        resource: 'design',
        label: 'Tải lên hồ sơ',
        summary: 'Tải lên bản vẽ thiết kế sơ bộ tầng 1-5',
      },
      {
        actorName: 'Phạm Kỹ Sư Công Trường',
        roleSlug: 'STAFF_SITE_ENGINEER',
        dept: 'CONSTRUCTION',
        action: AuditActionType.CREATE,
        targetEntity: 'report-site-44',
        resource: 'construction',
        label: 'Báo cáo nhật ký',
        summary: 'Gửi nhật ký thi công đổ bê tông sàn hầm B2',
      },
    ];

    for (let i = 1; i <= 50; i++) {
      const scenario = scenarios[i % scenarios.length];
      const isFailed = i % 7 === 0;

      mockLogs.push(
        this.auditRepo.create({
          trackingCode: `#AUD-${randomBytes(3).toString('hex').toUpperCase()}`,
          correlationId: randomBytes(8).toString('hex'),
          timestamp: new Date(now.getTime() - i * 1000 * 60 * 60 * 3.5),
          actorId: `00000000-0000-0000-0000-00000000000${(i % scenarios.length) + 1}`,
          actorName: scenario.actorName,
          actorInitials: scenario.actorName
            .split(' ')
            .map((n) => n[0])
            .join('')
            .substring(0, 2)
            .toUpperCase(),
          actorDepartmentId: scenario.dept,
          // 👈 Resolved directly using the matrix slug
          actorRoleLevel: resolveActorRoleLevel(scenario.roleSlug),
          actorTitle: scenario.actorName.split(' ')[1] || 'Chuyên viên',
          targetDepartmentId: scenario.dept,
          resourceSlug: scenario.resource,
          resourceLabel: scenario.label,
          targetEntityId: scenario.targetEntity,
          actionType: scenario.action,
          actionLabel: scenario.label,
          status: isFailed ? AuditStatus.FAILED : AuditStatus.SUCCESS,
          summary: `${scenario.summary} (Bản ghi #${i})`,
          failureReason: isFailed ? 'Không đủ thẩm quyền thực hiện' : null,
          ipAddress: `192.168.1.${10 + (i % 50)}`,
          userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
          clientApp: AuditClientApp.WEB_PORTAL,
          requestUrl: `POST /api/v1/${scenario.resource}`,
        }),
      );
    }

    await this.auditRepo.save(mockLogs);
    this.logger.log('✅ Đã tạo thành công 50 bản ghi Audit Log mẫu.');
  }
}
