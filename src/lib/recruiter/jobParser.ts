import { reformatJobDescriptionWithGemini } from '@/lib/formatter';
import { callAI } from '@/lib/ai';

export interface ParsedRecruiterJobData {
  title?: string;
  normalizedDescription: string;
  seniority?: string;
  requiredSkills: string[];
  preferredSkills: string[];
  experienceMinYears?: number;
  location?: string;
  remoteType?: 'REMOTE' | 'HYBRID' | 'ON_SITE';
  employmentType?: string;
  salaryMin?: number;
  salaryMax?: number;
  salaryCurrency?: string;
}

/**
 * Normalizes and extracts structured criteria from a recruiter-provided job description.
 */
export async function parseRecruiterJobDescription(rawInput: string): Promise<ParsedRecruiterJobData> {
  // 1. Reformat to clean markdown using existing Jahq formatter
  const formattedMarkdown = await reformatJobDescriptionWithGemini(rawInput);

  // 2. Extract structured criteria using AI
  const prompt = `You are an expert recruitment assistant. Analyze this job description and extract structured requirements.
Return a JSON object strictly matching this schema:
{
  "title": "Normalized Job Title",
  "seniority": "Entry | Mid-Level | Senior | Lead | Staff | Principal | Director | VP | Executive",
  "requiredSkills": ["Skill 1", "Skill 2"],
  "preferredSkills": ["Skill 1", "Skill 2"],
  "experienceMinYears": 5,
  "location": "City, State or Country or Remote",
  "remoteType": "REMOTE" | "HYBRID" | "ON_SITE",
  "employmentType": "FULL_TIME" | "CONTRACT" | "PART_TIME",
  "salaryMin": 120000,
  "salaryMax": 160000,
  "salaryCurrency": "USD"
}

If any numerical or optional field is not mentioned, use null.

JOB DESCRIPTION:
${formattedMarkdown.substring(0, 15000)}`;

  try {
    const aiResponse = await callAI({
      task: 'extract',
      jsonMode: true,
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 2000,
    });

    const cleaned = aiResponse.replace(/```json\s*/gi, '').replace(/```\s*$/gi, '').trim();
    const extracted = JSON.parse(cleaned);

    return {
      title: extracted.title || undefined,
      normalizedDescription: formattedMarkdown,
      seniority: extracted.seniority || undefined,
      requiredSkills: Array.isArray(extracted.requiredSkills) ? extracted.requiredSkills : [],
      preferredSkills: Array.isArray(extracted.preferredSkills) ? extracted.preferredSkills : [],
      experienceMinYears: typeof extracted.experienceMinYears === 'number' ? extracted.experienceMinYears : undefined,
      location: extracted.location || undefined,
      remoteType: ['REMOTE', 'HYBRID', 'ON_SITE'].includes(extracted.remoteType) ? extracted.remoteType : 'REMOTE',
      employmentType: extracted.employmentType || 'FULL_TIME',
      salaryMin: typeof extracted.salaryMin === 'number' ? extracted.salaryMin : undefined,
      salaryMax: typeof extracted.salaryMax === 'number' ? extracted.salaryMax : undefined,
      salaryCurrency: extracted.salaryCurrency || 'USD',
    };
  } catch (err) {
    console.warn('AI structured job extraction failed, using formatted markdown fallback:', err);
    return {
      normalizedDescription: formattedMarkdown,
      requiredSkills: [],
      preferredSkills: [],
      remoteType: 'REMOTE',
      employmentType: 'FULL_TIME',
      salaryCurrency: 'USD',
    };
  }
}
