/**
 * worker/src/generic-agent/deepseek-navigator.ts
 *
 * DeepSeekNavigator — Reasoning layer using DeepSeek V4 Flash over the semantic AXTree snapshot.
 *
 * Responsibilities:
 *  1. Analyze page structure from AXTree semantic snapshot without raw HTML.
 *  2. Decide precise, structured actions (click, dismiss, fill, select, stop, manual_intervention).
 *  3. Strictly respect security boundaries (never bypass real auth/CAPTCHA/bot challenges).
 *  4. Provide calibrated confidence scores and explainable rationale.
 */

import { callDeepSeekWorker, parseDeepSeekJson } from '../ai/deepseek-client';
import { agentConfig } from '../config';
import { AgentDecision, AgentState, SemanticSnapshot } from './types';

export class DeepSeekNavigator {
  private static readonly SYSTEM_PROMPT = `You are Jahq's Browser Automation Navigation Engine.
Your goal is to inspect the semantic accessibility tree (AXTree) of a webpage and select the SINGLE best action to progress a job application.

### INSTRUCTIONS:
1. Examine the list of interactive elements provided in the page snapshot.
2. Elements are identified by an ID like [element_12].
3. Identify the true application entry point:
   - Primary apply buttons (e.g. "Apply", "Apply Now", "Start Application", "Apply for this job", "Submit Resume", "I'm interested", "Interested", "Express interest").
   - Application onboarding / resume selection dialogs: If a modal offers options like "I have a resume" vs "I need a resume" or "Start your application", ALWAYS select "I have a resume" (e.g. action="click" on "I have a resume"). Do NOT dismiss or close these application onboarding modals.
4. Discard and ignore irrelevant elements:
   - Navigation links (e.g. "Home", "Careers", "About Us", "All Jobs")
   - Header/footer utility links
   - Advertisements, promotions, social sharing buttons
   - "Related Jobs" or other job postings
   - Job search filters ("Apply filters", "Apply coupon")
5. Obstruction & Modal Handling:
   - If a cookie banner or marketing overlay blocks the view, return action="dismiss" with the close/reject/accept button target_id.
   - For job application modals (e.g. "Start your application", "I have a resume"), choose the positive application option (action="click") rather than dismissing.
6. Security Boundaries (CRITICAL):
   - If the page presents a CAPTCHA, Cloudflare / Bot challenge, or mandatory login wall with no guest/direct apply path, return action="manual_intervention" or action="stop". DO NOT attempt to bypass.
7. Return your decision strictly in valid JSON format.

### OUTPUT JSON SCHEMA:
{
  "action": "click" | "dismiss" | "classify" | "fill" | "select" | "scroll" | "wait" | "stop" | "manual_intervention",
  "target_id": "element_X",
  "confidence": 0.0 to 1.0,
  "reason": "Clear explanation of why this element was chosen."
}
`;

  /**
   * Decide the next action based on current state and AXTree semantic snapshot.
   */
  static async decideAction(
    snapshot: SemanticSnapshot,
    currentState: AgentState,
    extraContext?: { jobTitle?: string; companyName?: string }
  ): Promise<{ decision: AgentDecision; promptTokens: number; completionTokens: number }> {
    if (!agentConfig.deepseekApiKey || !agentConfig.aiNavigationEnabled) {
      return {
        decision: {
          action: 'manual_intervention',
          confidence: 0,
          reason: 'DeepSeek navigation disabled or API key missing',
        },
        promptTokens: 0,
        completionTokens: 0,
      };
    }

    const userPrompt = `
CURRENT STATE: ${currentState}
PAGE URL: ${snapshot.url}
PAGE TITLE: ${snapshot.title}
${extraContext?.jobTitle ? `TARGET JOB: ${extraContext.jobTitle} at ${extraContext.companyName || 'Company'}` : ''}

${snapshot.textRepresentation}

Analyze the above snapshot and return the single best JSON action.`;

    try {
      const result = await callDeepSeekWorker({
        messages: [
          { role: 'system', content: this.SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        jsonMode: true,
        temperature: 0.1,
      });

      const parsed = parseDeepSeekJson<AgentDecision>(result.content);
      if (!parsed || !parsed.action) {
        return {
          decision: {
            action: 'stop',
            confidence: 0.2,
            reason: `Invalid JSON response from DeepSeek: ${result.content.slice(0, 100)}`,
          },
          promptTokens: result.promptTokens,
          completionTokens: result.completionTokens,
        };
      }

      // Ensure confidence is between 0 and 1
      const confidence = typeof parsed.confidence === 'number' ? Math.max(0, Math.min(1, parsed.confidence)) : 0.5;

      return {
        decision: {
          ...parsed,
          confidence,
        },
        promptTokens: result.promptTokens,
        completionTokens: result.completionTokens,
      };
    } catch (err: any) {
      return {
        decision: {
          action: 'stop',
          confidence: 0,
          reason: `DeepSeek call failed: ${err.message}`,
        },
        promptTokens: 0,
        completionTokens: 0,
      };
    }
  }
}
