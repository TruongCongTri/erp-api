// ==========================================
// TICKET ENUMS & DOMAIN CONSTANTS
// ==========================================

export enum TicketCategory {
  COORDINATION = 'COORDINATION', // Phối hợp công việc liên phòng ban
  CONFLICT = 'CONFLICT', // Xung đột thiết kế, va chạm BIM, sai lệch số liệu
  HANDOFF = 'HANDOFF', // Bàn giao mốc tiến độ, nghiệm thu giai đoạn
  SERVICE_REQUEST = 'SERVICE_REQUEST', // Yêu cầu hỗ trợ nội bộ (IT, HR, Admin, Pháp chế)
  ESCALATION = 'ESCALATION', // Khiếu nại, báo cáo cấp quản lý can thiệp
}

export enum TicketPriority {
  LOW = 'LOW', // Mức thấp (xử lý khi có thời gian)
  NORMAL = 'NORMAL', // Tiêu chuẩn theo SLA mặc định
  HIGH = 'HIGH', // Ưu tiên cao, ảnh hưởng tiến độ phòng ban
  URGENT = 'URGENT', // Khẩn cấp / Blocker, chặn luồng thi công hoặc vận hành
  BLOCKER = 'BLOCKER',
}

export enum TicketStatus {
  DRAFT = 'DRAFT', // Bản nháp chưa gửi đi
  SUBMITTED = 'SUBMITTED', // Đã gửi, nằm trong hàng đợi tiếp nhận của phòng ban (Triage Pool)
  ASSIGNED = 'ASSIGNED', // Trưởng bộ phận đã phân công cho nhân viên xử lý
  IN_PROGRESS = 'IN_PROGRESS', // Đang xử lý
  PENDING_INFO = 'PENDING_INFO', // Đang chờ phòng ban yêu cầu bổ sung thông tin/chứng từ
  MEETING_SCHEDULED = 'MEETING_SCHEDULED', // Đã chốt lịch họp trao đổi trực tiếp
  RESOLVED = 'RESOLVED', // Đã đưa ra kết quả xử lý (chờ bên tạo xác nhận)
  REJECTED = 'REJECTED', // Từ chối tiếp nhận (sai phòng ban, không hợp lệ)
  CLOSED = 'CLOSED', // Hoàn tất và đóng ticket
  REOPENED = 'REOPENED', // Mở lại do kết quả xử lý chưa đạt yêu cầu
}
export interface TicketActionItem {
  task: string;
  assigneeId: string;
  dueDate: string;
}

export interface TicketMeetingOutcome {
  outcomesSummary: string;
  actionItems: TicketActionItem[];
}
