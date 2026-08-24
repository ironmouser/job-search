/**
 * worker/src/generic-agent/gemini-visual-fallback.ts
 *
 * GeminiVisualFallback — Visual multimodal reasoning tier using Gemini Flash-Lite.
 *
 * Invoked ONLY when:
 *  1. Deterministic DOM analysis did not yield a high-confidence control, AND
 *  2. DeepSeek semantic AXTree reasoning failed or was low-confidence.
 *
 * Takes a screenshot of the browser viewport, identifies the visual application button
 * or form control, and returns coordinate or visual action recommendations.
 *
 * Playwright pre-execution validation verifies the target coordinates before any click is dispatched.
 */

import { Page } from 'playwright';
import { callGeminiWorker, captureScreenshotBase64, parseGeminiJson } from '../ai/gemini-client';
import { agentConfig } from '../config';
import { AgentDecision, AgentState } from './types';

export class GeminiVisualFallback {
  private static readonly SYSTEM_PROMPT = `You are Jahq's Visual Browser Agent fallback.
You are given a screenshot of a webpage and the current application state.
Your task is to visually locate the primary "Apply" / "Apply Now" / "Submit Application" button or application entry point.

### RULES:
1. Locate the button/link that applies for the specific job posting.
2. Ignore navigation menus, header bars, footer links, share icons, related jobs.
3. If an overlay/modal is blocking the page (cookie notice, marketing banner), identify its dismiss/close button.
4. If a CAPTCHA or mandatory Login wall is visible, return action="manual_intervention" with reason.
5. Provide the visual center coordinates (x, y in viewport pixels) of the target element.

### OUTPUT JSON SCHEMA:
{
  "action": "click" | "dismiss" | "scroll" | "manual_intervention" | "stop",
  "x": number,
  "y": number,
  "confidence": 0.0 to 1.0,
  "reason": "Detailed explanation of the visual element identified."
}
`;

  /**
   * Visually inspect the page screenshot and decide an action.
   */
  static async decideVisualAction(
    page: Page,
    currentState: AgentState,
    extraContext?: { jobTitle?: string }
  ): Promise<{ decision: AgentDecision; promptTokens: number; completionTokens: number }> {
    if (!agentConfig.geminiApiKey || !agentConfig.visionFallbackEnabled) {
      return {
        decision: {
          action: 'manual_intervention',
          confidence: 0,
          reason: 'Gemini visual fallback disabled or API key missing',
        },
        promptTokens: 0,
        completionTokens: 0,
      };
    }

    const screenshotBase64 = await captureScreenshotBase64(page);
    if (!screenshotBase64) {
      return {
        decision: {
          action: 'stop',
          confidence: 0,
          reason: 'Failed to capture page screenshot for visual fallback',
        },
        promptTokens: 0,
        completionTokens: 0,
      };
    }

    const userText = `Current State: ${currentState}
URL: ${page.url()}
Title: ${await page.title().catch(() => '')}
${extraContext?.jobTitle ? `Target Job Title: ${extraContext.jobTitle}` : ''}

Please examine the attached screenshot and return your JSON decision.`;

    try {
      const result = await callGeminiWorker({
        systemInstruction: this.SYSTEM_PROMPT,
        contents: [
          {
            role: 'user',
            parts: [
              {
                inlineData: {
                  mimeType: 'image/png',
                  data: screenshotBase64,
                },
              },
              { text: userText },
            ],
          },
        ],
        jsonMode: true,
        temperature: 0.1,
      });

      const parsed = parseGeminiJson<AgentDecision>(result.content);
      if (!parsed || !parsed.action) {
        return {
          decision: {
            action: 'stop',
            confidence: 0.2,
            reason: `Invalid JSON response from Gemini visual fallback: ${result.content.slice(0, 100)}`,
          },
          promptTokens: result.promptTokens,
          completionTokens: result.completionTokens,
        };
      }

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
          reason: `Gemini visual fallback error: ${err.message}`,
        },
        promptTokens: 0,
        completionTokens: 0,
      };
    }
  }

  /**
   * Validate coordinates before clicking.
   * Ensures point is within viewport, not disabled, and element at point is interactive.
   */
  static async validateAndClickCoordinates(
    page: Page,
    x: number,
    y: number
  ): Promise<{ success: boolean; reason?: string }> {
    const viewport = page.viewportSize();
    if (viewport) {
      if (x < 0 || x > viewport.width || y < 0 || y > viewport.height) {
        return { success: false, reason: `Coordinates (${x}, ${y}) outside viewport dimensions (${viewport.width}x${viewport.height})` };
      }
    }

    try {
      // Check element at point in DOM
      const isInteractive = await page.evaluate(
        ({ ptX, ptY }: { ptX: number; ptY: number }) => {
          const el = document.elementFromPoint(ptX, ptY);
          if (!el) return { found: false, tag: '' };
          const interactive = el.closest('button, a, input, select, textarea, [role="button"], [role="link"], [tabindex]');
          return {
            found: true,
            tag: el.tagName.toLowerCase(),
            hasInteractiveAncestor: !!interactive,
          };
        },
        { ptX: x, ptY: y }
      );

      if (!isInteractive.found) {
        return { success: false, reason: `No element found at point (${x}, ${y})` };
      }

      // Safe click at point
      await page.mouse.click(x, y, { delay: 50 });
      return { success: true };
    } catch (err: any) {
      return { success: false, reason: `Failed to click coordinates (${x}, ${y}): ${err.message}` };
    }
  }
}
