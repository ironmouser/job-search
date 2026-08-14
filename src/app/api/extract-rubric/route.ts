import { NextResponse } from 'next/server';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { callAI } from '@/lib/ai';

const ALL_CRITERIA_IDS = [
    'compensation',
    'remoteFlexibility',
    'growth',
    'productFit',
    'techStack',
    'culture',
    'leadership',
    'aiMaturity'
];

export async function POST(request: Request) {
    try {
        const session = await getServerSession(authOptions);
        const userId = session?.user?.id;

        const body = await request.json();
        const { resumeMarkdown, searchKeyword = '', searchLocation = '' } = body;

        if (!resumeMarkdown || typeof resumeMarkdown !== 'string' || !resumeMarkdown.trim()) {
            return NextResponse.json({
                success: true,
                mustHaves: ['compensation', 'remoteFlexibility'],
                important: ['growth', 'productFit'],
                niceToHaves: ['techStack', 'culture', 'leadership', 'aiMaturity'],
                goal: 'I am looking for high-growth tech opportunities with strong engineering culture.'
            });
        }

        const prompt = `You are an expert career advisor and talent strategist.
Analyze the candidate's resume and target job preferences below to extrapolate their personalized scoring rubric and overall job search goal.

Consider:
- Past work location vs target location (e.g. remote history, relocation flexibility)
- Career trajectory & advancement over the years (seniority level, growth hunger)
- Industry, technical tasks, job function, and modern tool adoption
- Executive scope, mentorship, team dynamics, and leadership responsibilities
- Target role keyword: "${searchKeyword}"
- Target location preference: "${searchLocation}"

You must rank and classify the following 8 criteria IDs into exactly 3 tiers:
1. "mustHaves" (2 Non-Negotiables / Dealbreakers): The top 2 absolute highest priorities for this candidate.
2. "important" (2 High Priorities): 2 strong preferences that are important, but not dealbreakers.
3. "niceToHaves" (4 Nice-to-Haves): The remaining 4 criteria IDs.

Available Criteria IDs:
- "compensation": Salary, equity, benefits, and financial packages
- "remoteFlexibility": Remote work, hybrid flexibility, work-from-anywhere policies
- "growth": Promotions, career ladders, learning budgets, increased scope
- "productFit": Company stability, market demand, domain relevance, product-market fit
- "techStack": Modern frameworks, developer velocity, top-tier engineering tooling
- "culture": Work-life balance, collaborative culture, psychological safety
- "leadership": Executive vision, transparent leadership, quality mentorship
- "aiMaturity": AI tooling adoption, modern AI workflows and automation

Also generate a crisp, personalized 1-2 sentence "goal" statement summarizing what this candidate is hunting for.

Candidate Resume:
${resumeMarkdown.slice(0, 5000)}

Return ONLY a valid JSON object matching this exact schema:
{
  "mustHaves": ["id1", "id2"],
  "important": ["id3", "id4"],
  "niceToHaves": ["id5", "id6", "id7", "id8"],
  "goal": "Personalized 1-2 sentence overall job search goal"
}`;

        const rawResponse = await callAI({
            task: 'score',
            messages: [{ role: 'user', content: prompt }],
            jsonMode: true,
            temperature: 0.3,
            maxTokens: 800,
            userId
        });

        let parsed: any = {};
        try {
            parsed = JSON.parse(rawResponse);
        } catch {
            const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                parsed = JSON.parse(jsonMatch[0]);
            }
        }

        // Validate and clean extracted IDs
        const mustHaves: string[] = [];
        const important: string[] = [];
        const assigned = new Set<string>();

        if (Array.isArray(parsed?.mustHaves)) {
            for (const id of parsed.mustHaves) {
                if (ALL_CRITERIA_IDS.includes(id) && !assigned.has(id) && mustHaves.length < 2) {
                    mustHaves.push(id);
                    assigned.add(id);
                }
            }
        }

        if (Array.isArray(parsed?.important)) {
            for (const id of parsed.important) {
                if (ALL_CRITERIA_IDS.includes(id) && !assigned.has(id) && important.length < 2) {
                    important.push(id);
                    assigned.add(id);
                }
            }
        }

        // Fill in any missing mustHaves or important
        for (const id of ALL_CRITERIA_IDS) {
            if (!assigned.has(id)) {
                if (mustHaves.length < 2) {
                    mustHaves.push(id);
                    assigned.add(id);
                } else if (important.length < 2) {
                    important.push(id);
                    assigned.add(id);
                }
            }
        }

        const niceToHaves = ALL_CRITERIA_IDS.filter(id => !assigned.has(id));

        const goal = (typeof parsed?.goal === 'string' && parsed.goal.trim()) 
            ? parsed.goal.trim()
            : `I am looking for high-growth ${searchKeyword || 'tech'} opportunities with strong team culture and remote flexibility.`;

        return NextResponse.json({
            success: true,
            mustHaves,
            important,
            niceToHaves,
            goal
        });

    } catch (e: any) {
        console.error('Failed to extract rubric priorities:', e);
        return NextResponse.json({
            success: true,
            mustHaves: ['compensation', 'remoteFlexibility'],
            important: ['growth', 'productFit'],
            niceToHaves: ['techStack', 'culture', 'leadership', 'aiMaturity'],
            goal: 'I am looking for high-growth tech opportunities with strong engineering culture.'
        });
    }
}
