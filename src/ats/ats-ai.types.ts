import {
  JobLevel,
  JobType,
  WorkingModel,
  EducationLevel,
  CandidateGender,
} from './enums/ats.enum';

export interface AiGeneratedJdSchema {
  // Part 1: Thông tin chung
  publicTitle: string;
  specialization: string;
  domainKnowledge: string;
  level: JobLevel;
  jobType: JobType;
  workingModel: WorkingModel;
  salaryMin: number;
  salaryMax: number;
  isSalaryNegotiable: boolean;

  // Part 2: Mô tả công việc
  jobDescription: string;
  requirements: string;
  benefits: string;
  extraBenefits?: string;
  workLocations: Array<{ label: string; address: string }>;
  workingHoursStandard: string;
  workingHoursDetail: string;

  // Part 3: Kỳ vọng về ứng viên
  minEducation: EducationLevel;
  experienceYears: number;
  gender: CandidateGender;
  ageMin?: number;
  ageMax?: number;
  mustHaveSkills: string[];
  niceToHaveSkills: string[];
  languages: string[];

  // Part 4: Thông tin tiếp nhận mặc định
  headcount: number;
  suggestedDeadlineDays: number;
}

export interface ParsedCandidateCv {
  hardSkills: string[];
  softSkills: string[];
  experienceYears: number;
  educationLevel: EducationLevel;
  employmentHistory: Array<{
    company: string;
    role: string;
    durationMonths: number;
  }>;
  summary: string;
}
