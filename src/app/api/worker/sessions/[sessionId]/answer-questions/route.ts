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
/**
 * Detect if a question specifically asks about transgender status,
 * gender identity, gender expression, or cisgender status.
 *
 * Generic EEOC gender (Male/Female) MUST NEVER be used to answer these questions.
 */
export function isTransgenderOrGenderIdentityQuestion(label: string, fieldKey?: string): boolean {
  const text = `${label} ${fieldKey || ''}`.toLowerCase();
  return /transgender|\btrans\b|gender\s*identity|gender\s*expression|cisgender|\bcis\b/i.test(text);
}

/**
 * Safely match an option text against a target answer string without false positives.
 */
export function matchesOptionSafely(optionText: string, targetValue: string): boolean {
  const opt = optionText.trim().toLowerCase();
  const target = targetValue.trim().toLowerCase();
  if (!opt || !target) return false;

  if (opt === target) return true;

  const targetHasTrans = /transgender|\btrans\b|transsexual/i.test(target);
  const optHasTrans = /transgender|\btrans\b|transsexual/i.test(opt);

  // If user target does NOT specify trans, NEVER match an option with 'trans'
  if (!targetHasTrans && optHasTrans) {
    return false;
  }
  if (targetHasTrans && !optHasTrans) {
    return false;
  }

  if (/^(male|man)$/i.test(target)) {
    if (optHasTrans) return false;
    const hasMale = /\b(?:male|man|men)\b/i.test(opt);
    const hasFemale = /\b(?:female|woman|women)\b/i.test(opt);
    return hasMale && !hasFemale;
  }

  if (/^(female|woman)$/i.test(target)) {
    if (optHasTrans) return false;
    const hasFemale = /\b(?:female|woman|women)\b/i.test(opt);
    const hasMale = /\b(?:male|man|men)\b/i.test(opt);
    return hasFemale && !hasMale;
  }

  if (/^(decline|prefer not to say|do not wish to answer|prefer not to disclose)$/i.test(target)) {
    return /decline|prefer not|do not wish|choose not/i.test(opt);
  }

  if (/^yes$/i.test(target)) {
    return /^yes\b|affirmative|i agree/i.test(opt) && !/^no\b/i.test(opt);
  }
  if (/^no$/i.test(target)) {
    return /^no\b|negative|i do not|none/i.test(opt) && !/^yes\b/i.test(opt);
  }

  const escaped = target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const wordRegex = new RegExp(`\\b${escaped}\\b`, 'i');
  if (wordRegex.test(opt)) return true;

  if (opt.includes(target) && target.length >= 4) return true;
  if (target.includes(opt) && opt.length >= 4) return true;

  return false;
}

/**
 * Detect if a question is a demographic / EEOC / voluntary self-identification question.
 * The bot MUST NOT guess or assume answers for these questions.
 */
export function isDemographicQuestion(label: string, fieldKey?: string): boolean {
  const text = `${label} ${fieldKey || ''}`.toLowerCase();

  // Sexual orientation / sexuality
  if (/sexual\s*(?:orientation|identity|preference)|sexuality/i.test(text)) return true;

  // Transgender / gender identity / cisgender
  if (isTransgenderOrGenderIdentityQuestion(label, fieldKey)) return true;

  // Pronouns
  if (/\bpronouns?\b|preferred\s*pronouns/i.test(text)) return true;

  // Gender / Sex (exclude words like 'generation', 'general', 'section')
  if (/\b(?:gender|sex|biological\s*sex)\b/i.test(text) && !/generation|general|section/i.test(text)) return true;

  // Race / Ethnicity / Hispanic / Latino
  if (/\b(?:race|ethnicity|hispanic|latino|latina|latinx|racial|ethnic)\b/i.test(text)) return true;

  // Veteran / Military
  if (/\b(?:veteran|military\s*status|protected\s*veteran|armed\s*forces|active\s*duty)\b/i.test(text)) return true;

  // Disability
  if (/\b(?:disability|impairment|handicap)\b|special\s*accommodations?/i.test(text)) return true;

  // General EEOC / Self-ID / Diversity
  if (/\b(?:eeoc|eeo)\b|voluntary\s*self[-\s]*identification|self[-\s]*identify|diversity\s*(?:&|and)\s*inclusion/i.test(text)) return true;

  return false;
}

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

    const sessionAnswers = ((session.browserMetadata as any)?.sessionAnswers as Record<string, string>) || {};
    const customAnswers = {
      ...(((prefs?.sources as any)?.customAnswers as Record<string, string>) || {}),
      ...sessionAnswers,
    };
    const streetAddress = prefs?.streetAddress || customAnswers['addressLine1'] || customAnswers['Address Line 1'] || customAnswers['streetAddress'] || '';
    const city = prefs?.city || customAnswers['city'] || customAnswers['City'] || (prefs?.location ? prefs.location.split(',')[0]?.trim() : '');
    const state = prefs?.state || customAnswers['state'] || customAnswers['State'] || (prefs?.location ? prefs.location.split(',')[1]?.trim() : '');
    const postalCode = prefs?.postalCode || customAnswers['postalCode'] || customAnswers['Postal Code'] || customAnswers['zipCode'] || '';

    const answers: AnswerItem[] = [];
    const questionsForAI: QuestionItem[] = [];

    // Pre-resolve from customAnswers or profile attributes
    for (const q of body.questions) {
      const lowerLabel = q.label.toLowerCase();
      const cleanLabel = q.label.replace(/\*/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
      const lowerId = (q.id || '').toLowerCase();

      // Look up saved custom answer
      let customVal =
        customAnswers[q.id] ||
        customAnswers[q.label] ||
        customAnswers[q.label.trim()] ||
        customAnswers[q.label.replace(/\*/g, '').trim()];

      if (customVal === undefined || customVal === null || String(customVal).trim().length === 0) {
        for (const [k, v] of Object.entries(customAnswers)) {
          const cleanK = k.replace(/\*/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
          if (
            cleanK === cleanLabel ||
            (cleanK.length > 5 && cleanLabel.includes(cleanK)) ||
            (cleanLabel.length > 5 && cleanK.includes(cleanLabel)) ||
            (cleanK.length > 4 && lowerId.includes(cleanK))
          ) {
            customVal = v;
            break;
          }
        }
      }

      // Check if this is a demographic question
      const isDemographic = isDemographicQuestion(q.label, q.id);

      if (isDemographic) {
        // Check for specific demographic values in preferences or customAnswers
        let demoAnswer: string | null | undefined = customVal;

        if (!demoAnswer) {
          const isTransOrIdentity = isTransgenderOrGenderIdentityQuestion(lowerLabel, lowerId);
          if (isTransOrIdentity) {
            // NEVER use generic eeocGender for transgender / gender identity questions!
            demoAnswer = customVal;
          } else if (/gender|sex\b/i.test(lowerLabel) && !isTransgenderOrGenderIdentityQuestion(lowerLabel)) {
            demoAnswer = prefs?.eeocGender;
          } else if (/race|ethnicity|hispanic|latino/i.test(lowerLabel)) {
            demoAnswer = prefs?.eeocRace;
          } else if (/veteran|military/i.test(lowerLabel)) {
            demoAnswer = prefs?.eeocVeteran;
          } else if (/disability/i.test(lowerLabel)) {
            demoAnswer = prefs?.eeocDisability;
          }
        }

        if (demoAnswer !== undefined && demoAnswer !== null && String(demoAnswer).trim().length > 0) {
          let resolvedOption = String(demoAnswer).trim();
          if (q.options && q.options.length > 0) {
            const matchedOpt = q.options.find((o) => matchesOptionSafely(o, resolvedOption));
            if (matchedOpt) {
              resolvedOption = matchedOpt;
            } else {
              // If options are provided but none safely match, do not force an invalid selection
              if (!q.options.some((o) => o.toLowerCase() === resolvedOption.toLowerCase())) {
                resolvedOption = '';
              }
            }
          }

          if (resolvedOption) {
            answers.push({
              id: q.id,
              answer: resolvedOption,
              confidence: 100,
              requiresHumanInput: false,
            });
            continue;
          }
        }

        // If no answer exists in DB for this demographic question, NEVER let AI guess!
        answers.push({
          id: q.id,
          answer: null,
          confidence: 0,
          requiresHumanInput: true,
        });
        continue;
      }

      const isCityQuestion = /^city\b|\bcity\b|location\s*\(\s*city\s*\)/i.test(lowerLabel) || /^city\b|candidate-location/i.test(lowerId);
      const isStateQuestion = /^state\b|\bstate\b|province|region|location\s*\(\s*state\s*\)|u\.s\.\s*state|which.*state/i.test(lowerLabel) || /^state\b|candidate-state/i.test(lowerId);
      const isAddressQuestion = /address\s*(?:line\s*1)?|street\s*address/i.test(lowerLabel) || /address\s*line\s*1|street\s*address|address1/i.test(lowerId);
      const isPostalQuestion = /postal|zip\s*code/i.test(lowerLabel) || /postal|zip/i.test(lowerId);
      const isCountryQuestion = /^country\b|\bcountry\b/i.test(lowerLabel) || /^country\b/i.test(lowerId);

      if (isCityQuestion && city) {
        answers.push({
          id: q.id,
          answer: city,
          confidence: 100,
          requiresHumanInput: false,
        });
      } else if (isStateQuestion && state) {
        let resolvedState = state;
        if (q.options && q.options.length > 0) {
          const matchedOpt = q.options.find((o) => matchesOptionSafely(o, state));
          if (matchedOpt) resolvedState = matchedOpt;
        }
        answers.push({
          id: q.id,
          answer: resolvedState,
          confidence: 100,
          requiresHumanInput: false,
        });
      } else if (isCountryQuestion) {
        const rawCountry = prefs?.country || customAnswers['country'] || customAnswers['Country'] || 'United States';
        let resolvedCountry = rawCountry;
        if (q.options && q.options.length > 0) {
          const matchedOpt = q.options.find((o) => matchesOptionSafely(o, rawCountry));
          if (matchedOpt) resolvedCountry = matchedOpt;
        }
        answers.push({
          id: q.id,
          answer: resolvedCountry,
          confidence: 100,
          requiresHumanInput: false,
        });
      } else if (isAddressQuestion && streetAddress) {
        answers.push({
          id: q.id,
          answer: streetAddress,
          confidence: 100,
          requiresHumanInput: false,
        });
      } else if (isPostalQuestion && postalCode) {
        answers.push({
          id: q.id,
          answer: postalCode,
          confidence: 100,
          requiresHumanInput: false,
        });
      } else if (customVal !== undefined && customVal !== null && String(customVal).trim().length > 0) {
        answers.push({
          id: q.id,
          answer: String(customVal).trim(),
          confidence: 100,
          requiresHumanInput: false,
        });
      } else if (/address\s*line\s*2|apt|suite|unit/i.test(lowerLabel)) {
        const addr2 = customAnswers['addressLine2'] || customAnswers['Address Line 2'] || '';
        answers.push({
          id: q.id,
          answer: addr2,
          confidence: 90,
          requiresHumanInput: false,
        });
      } else {
        questionsForAI.push(q);
      }
    }

    if (questionsForAI.length === 0) {
      return NextResponse.json({ answers });
    }

    // Process remaining questions in a batch prompt to callAI
    const questionsPromptList = questionsForAI.map((q, idx) => {
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
Street Address: ${streetAddress}
City: ${city}
State: ${state}
Postal Code: ${postalCode}
Location: ${prefs?.location || [city, state].filter(Boolean).join(', ')}
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
8. Technical & Professional Experience Questions (e.g. "Have you professionally shipped an AI feature?", "Have you worked with React/Node/Python?", "Do you have experience in full-stack engineering?", "Have you managed production deployments?"):
   - Inspect the candidate's resume, technical skills, and work experience. If the candidate has relevant technical/engineering experience, answer affirmatively ("Yes" for Yes/No select/radio options, or a concise professional highlight for open text).
   - Do NOT mark requiresHumanInput as true for standard technical background or experience screening questions when the candidate has an engineering/tech background.
9. If a question is highly confidential or requires external IDs/documents not in the candidate's profile (e.g. Security Clearance PIN, Government ID Number), mark requiresHumanInput as true and answer as null.
10. CRITICAL DEMOGRAPHIC RULE: Never guess, assume, or invent answers to demographic, diversity, sexual orientation, transgender, gender identity, pronouns, race, veteran, or disability questions. Generic gender settings (Male/Female) must never be used to assume or select transgender or gender-identity options (e.g. Trans Man/Male, Cisgender, etc.). If not explicitly provided in candidate information, return null and mark requiresHumanInput as true.

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
        for (const q of questionsForAI) {
          const matched = parsedAnswers.find((a: any) => a.id === q.id || a.label === q.label);
          const isDemo = isDemographicQuestion(q.label, q.id);

          if (isDemo) {
            // Demographic questions should NEVER be answered by AI
            answers.push({
              id: q.id,
              answer: null,
              confidence: 0,
              requiresHumanInput: true,
            });
          } else if (matched && matched.answer !== undefined && matched.answer !== null) {
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
        for (const q of questionsForAI) {
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
      for (const q of questionsForAI) {
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
