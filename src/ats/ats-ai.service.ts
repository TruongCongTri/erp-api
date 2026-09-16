import {
  Injectable,
  Logger,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI } from '@google/genai';
import { AiGeneratedJdSchema, ParsedCandidateCv } from './ats-ai.types';
import { JobPost } from './entities/job-post.entity';
import { AiScoreResult } from './cv-screening.types';
import { AiScreeningTier } from './enums/ats.enum';

// ========================================================
// TYPE CONTRACTS (Dập tắt lỗi "error typed value" từ ESLint)
// ========================================================
interface GenerateContentConfig {
  systemInstruction?: string;
  responseMimeType?: string;
}

interface GenerateContentParams {
  model: string;
  contents: string;
  config?: GenerateContentConfig;
}

interface GenerateContentResponse {
  text?: string;
}

interface IGoogleGenAIClient {
  models: {
    generateContent(
      params: GenerateContentParams,
    ): Promise<GenerateContentResponse>;
  };
}

interface GoogleGenAIConstructor {
  new (options: { apiKey?: string; vertexai?: boolean }): IGoogleGenAIClient;
}

@Injectable()
export class AtsAiService {
  private readonly logger = new Logger(AtsAiService.name);
  private readonly aiClient: IGoogleGenAIClient;
  private readonly modelName = 'gemini-3.6-flash';

  constructor(private readonly configService: ConfigService) {
    const apiKey =
      this.configService.get<string>('GEMINI_API_KEY') ||
      process.env.GEMINI_API_KEY ||
      '';
    if (!apiKey) {
      this.logger.warn('GEMINI_API_KEY chưa được cấu hình trong Environment.');
    }

    const GenAIClientClass = GoogleGenAI as unknown as GoogleGenAIConstructor;
    this.aiClient = new GenAIClientClass({ apiKey });
  }

  // ========================================================
  // 1. DRAFT 4-PART JD SCHEMA FROM UNSTRUCTURED PROMPT
  // ========================================================
  async suggestJdFromPrompt(rawNote: string): Promise<AiGeneratedJdSchema> {
    const systemInstruction = `
      Bạn là Giám đốc Nhân sự & Chuyên gia Tuyển dụng cấp cao của tập đoàn xây dựng và kỹ thuật EPC.
      Nhiệm vụ của bạn là nhận bản mô tả thô sơ (hoặc yêu cầu tuyển dụng từ Trưởng bộ phận) và chuẩn hóa thành cấu trúc JSON 4 phần của hệ thống ATS chuyên nghiệp.
      
      Yêu cầu dữ liệu:
      - Ngôn ngữ: Tiếng Việt chuẩn mực doanh nghiệp, súc tích, chuyên nghiệp.
      - level phải thuộc: INTERN, FRESHER, JUNIOR, MIDDLE, SENIOR, LEAD, MANAGER, DIRECTOR.
      - jobType phải thuộc: FULL_TIME, PART_TIME, CONTRACT, SEASONAL.
      - workingModel phải thuộc: ON_SITE, HYBRID, REMOTE.
      - minEducation phải thuộc: HIGH_SCHOOL, VOCATIONAL, COLLEGE, BACHELOR, MASTER, DOCTORATE, NOT_REQUIRED.
      - gender: ANY, MALE, FEMALE.
      - salaryMin & salaryMax tính theo VNĐ (số nguyên, ví dụ: 20000000).
      - Phải tạo ít nhất 3-5 gạch đầu dòng chi tiết cho jobDescription, requirements và benefits.
    `;

    const prompt = `
      Yêu cầu thô từ Trưởng bộ phận:
      """
      ${rawNote}
      """

      Hãy phân tích, suy luận và trả về kết quả định dạng JSON thuần túy (RFC 8259) khớp chính xác với cấu trúc:
      {
        "publicTitle": string,
        "specialization": string,
        "domainKnowledge": string,
        "level": string,
        "jobType": string,
        "workingModel": string,
        "salaryMin": number,
        "salaryMax": number,
        "isSalaryNegotiable": boolean,
        "jobDescription": string,
        "requirements": string,
        "benefits": string,
        "extraBenefits": string,
        "workLocations": [{"label": string, "address": string}],
        "workingHoursStandard": string,
        "workingHoursDetail": string,
        "minEducation": string,
        "experienceYears": number,
        "gender": string,
        "ageMin": number,
        "ageMax": number,
        "mustHaveSkills": string[],
        "niceToHaveSkills": string[],
        "languages": string[],
        "headcount": number,
        "suggestedDeadlineDays": number
      }
    `;

    try {
      const response = await this.aiClient.models.generateContent({
        model: this.modelName,
        contents: prompt,
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
        },
      });

      const text = response.text;
      if (!text) {
        throw new InternalServerErrorException(
          'AI không phản hồi nội dung văn bản',
        );
      }

      return JSON.parse(text) as AiGeneratedJdSchema;
    } catch (error) {
      this.logger.error('Thất bại khi gọi Gemini 3.6 Flash để sinh JD', error);
      throw new InternalServerErrorException(
        `Lỗi xử lý AI: ${(error as Error).message}`,
      );
    }
  }

  // ========================================================
  // 2. EXTRACT STRUCTURED KEYWORDS FROM CV TEXT
  // ========================================================
  async extractCvKeywords(cvText: string): Promise<ParsedCandidateCv> {
    const prompt = `
      Trích xuất thông tin ứng viên từ nội dung CV dưới đây:
      """
      ${cvText}
      """

      Trả về kết quả JSON theo schema:
      {
        "hardSkills": string[],
        "softSkills": string[],
        "experienceYears": number,
        "educationLevel": "HIGH_SCHOOL" | "VOCATIONAL" | "COLLEGE" | "BACHELOR" | "MASTER" | "DOCTORATE" | "NOT_REQUIRED",
        "employmentHistory": [{"company": string, "role": string, "durationMonths": number}],
        "summary": string
      }
    `;

    try {
      const response = await this.aiClient.models.generateContent({
        model: this.modelName,
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
        },
      });

      return JSON.parse(response.text || '{}') as ParsedCandidateCv;
    } catch (error) {
      this.logger.error('Lỗi khi trích xuất CV bằng Gemini 3.6', error);
      throw new InternalServerErrorException(
        'Không thể phân tích nội dung hồ sơ CV',
      );
    }
  }

  async scoreCvAgainstJob(
    cvText: string,
    jobPost: JobPost,
  ): Promise<AiScoreResult> {
    const systemInstruction = `
      Bạn là Giám đốc Đánh giá Năng lực Ứng viên cấp cao trong ngành Xây dựng / EPC & Công nghệ ERP.
      Nhiệm vụ của bạn là đối chiếu chi tiết giữa Hồ sơ ứng viên (CV) và Yêu cầu của Tin tuyển dụng (Job Post).

      Quy tắc chấm điểm (Thang 100 điểm):
      1. Kỹ năng bắt buộc (mustHaveSkills): 40% trọng số.
      2. Kinh nghiệm làm việc thực tế (experienceYears) & Vị trí tương đương: 30% trọng số.
      3. Trình độ học vấn (minEducation) & Chứng chỉ chuyên ngành: 15% trọng số.
      4. Kỹ năng cộng điểm (niceToHaveSkills) & Ngoại ngữ: 15% trọng số.

      Quy tắc xếp hạng Tier:
      - Điểm >= 80: HIGH (Đạt chuẩn phỏng vấn ngay).
      - Điểm 50 - 79: MEDIUM (Kho lưu trữ tiềm năng, xem xét khi thiếu ứng viên).
      - Điểm < 50: LOW (Không đạt tiêu chuẩn tối thiểu).

      Đầu ra bắt buộc là định dạng JSON hợp lệ (RFC 8259), không bọc trong markdown codeblocks rác.
    `;

    const jobCriteria = {
      title: jobPost.publicTitle,
      level: jobPost.level,
      minEducation: jobPost.minEducation,
      experienceYearsRequired: jobPost.experienceYears,
      mustHaveSkills: jobPost.mustHaveSkills,
      niceToHaveSkills: jobPost.niceToHaveSkills,
      languages: jobPost.languages,
      jobDescription: jobPost.jobDescription,
      requirements: jobPost.requirements,
    };

    const prompt = `
      --- YÊU CẦU CỦA TIN TUYỂN DỤNG ---
      ${JSON.stringify(jobCriteria, null, 2)}

      --- NỘI DUNG CV ỨNG VIÊN ---
      """
      ${cvText}
      """

      Hãy đối soát và trả về JSON theo schema chính xác sau:
      {
        "aiScore": number,
        "matchingSkills": string[],
        "missingSkills": string[],
        "experienceYearsDetected": number,
        "redFlags": string[],
        "aiReasoning": string
      }

      *Lưu ý: Trường "aiReasoning" phải được định dạng bằng Markdown ngắn gọn (tiếng Việt), gồm 3 mục rõ ràng:
      ### 1. Điểm mạnh phù hợp
      ### 2. Tiêu chí còn thiếu hoặc chưa rõ
      ### 3. Rủi ro / Red flags (nếu có)
    `;

    try {
      const response = await this.aiClient.models.generateContent({
        model: this.modelName,
        contents: prompt,
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
        },
      });

      const text = response.text;
      if (!text) {
        throw new InternalServerErrorException(
          'AI không trả về kết quả đánh giá CV',
        );
      }

      interface RawAiEvalResponse {
        aiScore: number;
        matchingSkills?: string[];
        missingSkills?: string[];
        experienceYearsDetected?: number;
        redFlags?: string[];
        aiReasoning?: string;
      }

      const parsed = JSON.parse(text) as RawAiEvalResponse;
      const normalizedScore = Math.min(
        100,
        Math.max(0, Math.round(parsed.aiScore || 0)),
      );

      // Tính toán 3-Tier cố định theo tiêu chuẩn miền
      let aiTier: AiScreeningTier = AiScreeningTier.LOW;
      if (normalizedScore >= 80) {
        aiTier = AiScreeningTier.HIGH;
      } else if (normalizedScore >= 50) {
        aiTier = AiScreeningTier.MEDIUM;
      }

      return {
        aiScore: normalizedScore,
        aiTier,
        aiReasoning: parsed.aiReasoning || 'Chưa có phân tích chi tiết.',
        matchingSkills: parsed.matchingSkills || [],
        missingSkills: parsed.missingSkills || [],
        experienceYearsDetected: parsed.experienceYearsDetected || 0,
        redFlags: parsed.redFlags || [],
      };
    } catch (error) {
      this.logger.error('Lỗi khi chấm điểm CV bằng Gemini 3.6 Flash', error);
      throw new InternalServerErrorException(
        `Lỗi đánh giá AI: ${(error as Error).message}`,
      );
    }
  }
}
