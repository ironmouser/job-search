import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { authenticateWorker } from '@/lib/auto-apply/worker-auth';
import { callAI } from '@/lib/ai';

export interface QuestionItem {
  id: string;
  label: string;
  type: 'text' | 'textarea' | 'select' | 'radio' | 'checkbox';
  options?: string[];
  required?: boolean;
}

export interface AnswerItem {
  id: string;
  answer: string | null;
  confidence: number;
  requiresHumanInput: boolean;
}

/**
 * POST /api/worker/sessions/[sessionId]/answer-questions
 *
 * Receives form questions extracted by the worker during application filling.
 * Uses candidate profile, resume markdown, and job details with callAI to generate
 * tailored answers adhering to all content rules (no em-dashes, no filler words, professional tone).
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ sessionId: string }> }
) {
  const authError = authenticateWorker(request);
  if (authError) return authError;

  const { sessionId } = await context.params;

  let body: { questions: QuestionItem[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.questions || !Array.isArray(body.questions) || body.questions.length === 0) {
    return NextResponse.json({ error: 'questions array is required' }, { status: 400 });
  }

  try {
    const session = await prisma.autoApplySession.findUnique({
      where: { id: sessionId },
      include: {
        job: true,
        user: {
          include: {
            userPreferences: true,
          },
        },
      },
    });

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    const assets = await prisma.applicationAsset.findUnique({
      where: {
        userId_jobId: { userId: session.userId, jobId: session.jobId },
      },
      select: {
        tailoredResumeMarkdown: true,
        coverLetterMarkdown: true,
      },
    });

    const prefs = session.user.userPreferences;
    const resumeMarkdown = assets?.tailoredResumeMarkdown || prefs?.resumeMarkdown || '';
    const jobTitle = session.job?.title || 'Job Opening';
    const company = session.job?.company || 'Company';
    const jobDescription = session.job?.description || '';

    const answers: AnswerItem[] = [];

    // Process questions in a batch prompt to callAI for efficiency and consistency
    const questionsPromptList = body.questions.map((q, idx) => {
      let details = `Question ${idx + 1} (ID: ${q.id}):\n- Prompt: "${q.label}"\n- Field Type: ${q.type}\n- Required: ${q.required ? 'Yes' : 'No'}`;
      if (q.options && q.options.length > 0) {
        details += `\n- Allowed Options: [${q.options.map((o) => `"${o}"`).join(', ')}]`;
      }
      return details;
    }).join('\n\n');

    const systemPrompt = `You are an expert career assistant answering job application screening questions for a candidate.

CANDIDATE INFORMATION:
Name: ${session.user.name || 'Candidate'}
Email: ${session.user.email}
Phone: ${prefs?.phone || ''}
Location: ${prefs?.location || ''}
US Work Authorization: ${prefs?.usWorkAuthorization || 'Authorized to work in US'}
Visa Sponsorship Required: ${prefs?.visaSponsorship || 'No'}
Country: ${prefs?.country || 'United States'}
Gender: ${prefs?.eeocGender || 'Decline to self-identify'}
Race: ${prefs?.eeocRace || 'Decline to self-identify'}
Veteran Status: ${prefs?.eeocVeteran || 'Decline to self-identify'}
Disability Status: ${prefs?.eeocDisability || 'Decline to self-identify'}
Salary Expectation: ${prefs?.expectedSalary || session.job?.salaryRange || 'Open / Negotiable'}
Start Date / Availability: ${prefs?.startDate || 'Immediately / 2 weeks'}
Willing to Relocate: ${prefs?.willingToRelocate || 'Open to discussion'}
Willing to Travel: ${prefs?.willingToTravel || 'Yes'}

RESUME SUMMARY / EXPERIENCE:
${resumeMarkdown.slice(0, 4000)}

TARGET ROLE & COMPANY:
Role: ${jobTitle}
Company: ${company}
Salary Range: ${session.job?.salaryRange || 'Not specified'}
Description excerpt: ${jobDescription.slice(0, 1500)}

CONTENT WRITING RULES (STRICT):
1. Role-play as an experienced, capable professional.
2. NO em-dashes ("—" or "--") or hyphens ("-") as punctuation to separate clauses. Use commas, periods, or natural phrasing instead.
3. NO AI filler words or clichés like "thrilled", "passionate", "dynamic", "testament to", "delve", "directly aligns with", or "taking on one of the hardest parts".
4. Keep the tone grounded, confident, natural, and conversational.
5. For open-ended questions (text / textarea), write crisp, direct, 1-3 sentence answers referencing candidate strengths and past achievements where relevant.
6. For dropdowns or radio choices with Allowed Options, YOU MUST SELECT ONE OF THE EXACT ALLOWED OPTIONS verbatim.
7. For salary or compensation questions: If candidate has a configured salary expectation ("${prefs?.expectedSalary || ''}"), provide that value (clean number if required, e.g. 150000 or $150,000 depending on field type). If not specified, use a reasonable market rate for the role or the job's salary range ("${session.job?.salaryRange || ''}").
8. If a question is highly personal, confidential, or impossible to deduce safely, mark requiresHumanInput as true and answer as null.

OUTPUT FORMAT:
Return a valid JSON array of objects with the exact structure:
[
  {
    "id": "question_id",
    "answer": "exact answer string (or exact option string if select/radio, or null if cannot answer)",
    "confidence": 90,
    "requiresHumanInput": false
  }
]`;

    try {
      const aiResponse = await callAI({
        task: 'qa',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Please answer the following application questions:\n\n${questionsPromptList}` },
        ],
        jsonMode: true,
        temperature: 0.3,
        userId: session.userId,
      });

      let parsedAnswers: any[] = [];
      try {
        const cleaned = aiResponse.replace(/```json\s*|```/g, '').trim();
        parsedAnswers = JSON.parse(cleaned);
      } catch (err) {
        console.error('[answer-questions] Failed to parse JSON from AI response:', aiResponse);
      }

      if (Array.isArray(parsedAnswers) && parsedAnswers.length > 0) {
        for (const q of body.questions) {
          const matched = parsedAnswers.find((a: any) => a.id === q.id || a.label === q.label);
          if (matched && matched.answer !== undefined && matched.answer !== null) {
            answers.push({
              id: q.id,
              answer: String(matched.answer).trim(),
              confidence: typeof matched.confidence === 'number' ? matched.confidence : 85,
              requiresHumanInput: !!matched.requiresHumanInput,
            });
          } else {
            answers.push({
              id: q.id,
              answer: null,
              confidence: 0,
              requiresHumanInput: true,
            });
          }
        }
      } else {
        // Fallback for all
        for (const q of body.questions) {
          answers.push({
            id: q.id,
            answer: null,
            confidence: 0,
            requiresHumanInput: true,
          });
        }
      }
    } catch (aiErr: any) {
      console.error('[answer-questions] AI call failed:', aiErr);
      for (const q of body.questions) {
        answers.push({
          id: q.id,
          answer: null,
          confidence: 0,
          requiresHumanInput: true,
        });
      }
    }

    return NextResponse.json({ answers });
  } catch (error: any) {
    console.error('[worker/sessions/answer-questions POST] Error:', error);
    return NextResponse.json({ error: 'Failed to process question answering' }, { status: 500 });
  }
}
