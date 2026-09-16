import { AiScreeningTier } from './enums/ats.enum';

export interface ScreeningJobPayload {
  applicationId: string;
  submissionId: string;
  candidateId: string;
  jobPostId: string;
  cvUrl: string;
  cvFileKey?: string | null;
}

export interface AiScoreResult {
  aiScore: number;
  aiTier: AiScreeningTier;
  aiReasoning: string;
  matchingSkills: string[];
  missingSkills: string[];
  experienceYearsDetected: number;
  redFlags: string[];
}
