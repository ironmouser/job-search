import { ConfidenceInput, ConfidenceResult, ATSPlatform } from './types';

/**
 * Confidence Scorer — deterministic scoring, no AI required.
 *
 * Calculates an automation confidence score (0–100) based on known
 * risk factors for a given job application.
 *
 * Recommendation thresholds:
 *   80–100: auto     — High confidence, safe to auto-apply
 *   60–79:  assisted — Some manual steps likely needed
 *   40–59:  manual   — Significant intervention likely
 *   0–39:   skip     — Too risky for automation
 */

interface ScoringFactor {
  name: string;
  points: number;
  penalty: number;
  condition: (input: ConfidenceInput) => boolean;
}

const SCORING_FACTORS: ScoringFactor[] = [
  {
    name: 'Known ATS platform',
    points: 30,
    penalty: -30,
    condition: (i) => i.platform !== ATSPlatform.UNKNOWN,
  },
  {
    name: 'No login required',
    points: 15,
    penalty: -10,
    condition: (i) => !i.requiresLogin,
  },
  {
    name: 'Resume upload field detected',
    points: 10,
    penalty: -5,
    condition: (i) => i.hasResumeUpload,
  },
  {
    name: 'Cover letter upload field detected',
    points: 5,
    penalty: 0,
    condition: (i) => i.hasCoverLetterUpload,
  },
  {
    name: 'No CAPTCHA detected',
    points: 10,
    penalty: -25,
    condition: (i) => !i.hasCaptcha,
  },
  {
    name: 'No assessment required',
    points: 10,
    penalty: -20,
    condition: (i) => !i.hasAssessments,
  },
  {
    name: 'No dynamic questionnaire',
    points: 5,
    penalty: -15,
    condition: (i) => !i.hasDynamicQuestionnaire,
  },
  {
    name: 'No work authorization questions',
    points: 5,
    penalty: -5,
    condition: (i) => !i.hasWorkAuthQuestions,
  },
  {
    name: 'No salary questions',
    points: 5,
    penalty: -3,
    condition: (i) => !i.hasSalaryQuestions,
  },
];

export function scoreConfidence(input: ConfidenceInput): ConfidenceResult {
  let score = 0;
  const appliedFactors: string[] = [];

  for (const factor of SCORING_FACTORS) {
    const conditionMet = factor.condition(input);
    if (conditionMet) {
      score += factor.points;
      appliedFactors.push(`+${factor.points} ${factor.name}`);
    } else {
      score += factor.penalty;
      if (factor.penalty < 0) {
        appliedFactors.push(`${factor.penalty} ${factor.name} (not met)`);
      }
    }
  }

  // Add previous success rate bonus (up to +5)
  if (input.previousSuccessRate > 0) {
    const bonus = Math.round(input.previousSuccessRate * 5);
    score += bonus;
    appliedFactors.push(`+${bonus} Historical success rate (${Math.round(input.previousSuccessRate * 100)}%)`);
  }

  // Clamp to 0–100
  score = Math.max(0, Math.min(100, score));

  return {
    confidence: score,
    recommendation: getRecommendation(score),
    explanation: getExplanation(score, input),
    estimatedCompletionTime: getEstimatedTime(score, input),
  };
}

function getRecommendation(score: number): ConfidenceResult['recommendation'] {
  if (score >= 80) return 'auto';
  if (score >= 60) return 'assisted';
  if (score >= 40) return 'manual';
  return 'skip';
}

function getExplanation(score: number, input: ConfidenceInput): string {
  if (score >= 80) {
    return `High confidence (${score}%). This application can likely be completed automatically.`;
  }
  if (score >= 60) {
    const risks: string[] = [];
    if (input.requiresLogin) risks.push('login required');
    if (input.hasCaptcha) risks.push('CAPTCHA detected');
    if (input.hasDynamicQuestionnaire) risks.push('dynamic questions');
    return `Moderate confidence (${score}%). Some steps may need manual input: ${risks.join(', ') || 'see details'}.`;
  }
  if (score >= 40) {
    return `Low confidence (${score}%). Significant manual intervention is likely required.`;
  }
  return `Very low confidence (${score}%). Auto Apply is not recommended for this job. Please apply manually.`;
}

function getEstimatedTime(score: number, input: ConfidenceInput): string {
  // Base time in seconds
  let seconds = 30;
  if (input.requiresLogin) seconds += 30;
  if (input.hasResumeUpload) seconds += 20;
  if (input.hasCoverLetterUpload) seconds += 10;
  if (input.hasDynamicQuestionnaire) seconds += 60;
  if (input.hasWorkAuthQuestions) seconds += 15;
  if (input.hasSalaryQuestions) seconds += 10;

  if (seconds < 60) return `${seconds} seconds`;
  const minutes = Math.ceil(seconds / 60);
  return `${minutes} minute${minutes > 1 ? 's' : ''}`;
}
