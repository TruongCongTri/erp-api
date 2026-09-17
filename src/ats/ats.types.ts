// types/ats.types.ts

import { GenderRequirement } from './dto/ats-ai.dto';
import {
  AiScreeningTier,
  EducationLevel,
  JobLevel,
  JobType,
  WorkingModel,
} from './enums/ats.enum';

export interface WorkLocation {
  label: string;
  address: string;
}

export interface EmploymentHistoryItem {
  company: string;
  role: string;
  durationMonths: number;
}

export interface ScoringBreakdown {
  mustHaveScore: number;
  experienceScore: number;
  educationScore: number;
  niceToHaveScore: number;
}

export interface ParsedCandidateCv {
  hardSkills: string[];
  softSkills: string[];
  experienceYears: number;
  educationLevel: EducationLevel;
  certifications: string[];
  employmentHistory: EmploymentHistoryItem[];
  summary: string;
}

export interface AiGeneratedJdSchema {
  publicTitle: string;
  specialization: string;
  domainKnowledge: string;
  level: JobLevel;
  jobType: JobType;
  workingModel: WorkingModel;
  salaryMin: number;
  salaryMax: number;
  isSalaryNegotiable: boolean;
  jobDescription: string;
  requirements: string;
  benefits: string;
  extraBenefits: string;
  workLocations: WorkLocation[];
  workingHoursStandard: string;
  workingHoursDetail: string;
  minEducation: EducationLevel;
  experienceYears: number;
  gender: GenderRequirement;
  ageMin: number | null;
  ageMax: number | null;
  mustHaveSkills: string[];
  niceToHaveSkills: string[];
  languages: string[];
  headcount: number;
  suggestedDeadlineDays: number;
}

export interface AiScoreResult {
  aiScore: number;
  aiTier: AiScreeningTier;
  scoringBreakdown: ScoringBreakdown;
  matchingSkills: string[];
  missingSkills: string[];
  experienceYearsDetected: number;
  redFlags: string[];
  aiReasoning: string;
}
