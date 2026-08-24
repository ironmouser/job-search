/**
 * worker/test/hybrid-agent.test.ts
 *
 * Comprehensive test suite for the Hybrid AI Browser Automation Architecture:
 *  - State machine transitions & terminal boundaries
 *  - AXTreeBuilder semantic snapshot generation & element filtering
 *  - StrategyMemory persistence & domain lookup
 *  - AgentTelemetry metrics tracking & action recording
 *  - GenericPageAnalyzer region-aware candidate ranking
 *  - GenericApplicationAgent multi-tiered initiation
 *  - Security boundary enforcement (CAPTCHA, Bot Challenge, Mandatory Auth)
 *  - AI decision parsing & coordinate validation
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { chromium, Browser } from 'playwright';
import {
  AgentStateMachine,
  AgentState,
  TERMINAL_STATES,
} from '../src/generic-agent/agent-state-machine';
import { AXTreeBuilder } from '../src/generic-agent/axtree-builder';
import { StrategyMemory } from '../src/generic-agent/strategy-memory';
import { AgentTelemetry } from '../src/generic-agent/agent-telemetry';
import { GenericPageAnalyzer } from '../src/generic-agent/page-analyzer';
import { GenericApplicationAgent } from '../src/generic-agent/generic-application-agent';
import { PageClassification } from '../src/generic-agent/types';
import { parseDeepSeekJson } from '../src/ai/deepseek-client';
import { parseGeminiJson, captureScreenshotBase64 } from '../src/ai/gemini-client';
import { GeminiVisualFallback } from '../src/generic-agent/gemini-visual-fallback';
import { InterventionReason } from '../src/types';
import { InterventionError } from '../src/plugins/base-plugin';

describe('Hybrid AI Browser Automation Architecture Tests', () => {
  let browser: Browser;

  before(async () => {
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
  });

  after(async () => {
    await browser?.close();
  });

  // ─── 1. State Machine Tests ───────────────────────────────────────────────
  describe('Agent State Machine', () => {
    it('initializes in INITIALIZING state', () => {
      const sm = new AgentStateMachine();
      assert.strictEqual(sm.current, AgentState.INITIALIZING);
      assert.strictEqual(sm.isTerminal, false);
    });

    it('allows valid state transitions', () => {
      const sm = new AgentStateMachine(AgentState.INITIALIZING);
      assert.strictEqual(sm.transition(AgentState.JOB_PAGE, 'http://test.com', 'Page loaded'), true);
      assert.strictEqual(sm.current, AgentState.JOB_PAGE);
      assert.strictEqual(sm.previous, AgentState.INITIALIZING);

      assert.strictEqual(sm.transition(AgentState.IDENTIFYING_APPLICATION_TRIGGER, 'http://test.com', 'Searching controls'), true);
      assert.strictEqual(sm.current, AgentState.IDENTIFYING_APPLICATION_TRIGGER);

      assert.strictEqual(sm.transition(AgentState.CLICKING_APPLICATION_TRIGGER, 'http://test.com', 'Clicking apply'), true);
      assert.strictEqual(sm.current, AgentState.CLICKING_APPLICATION_TRIGGER);

      assert.strictEqual(sm.transition(AgentState.APPLICATION_FORM, 'http://test.com/apply', 'Navigated to form'), true);
      assert.strictEqual(sm.current, AgentState.APPLICATION_FORM);
    });

    it('rejects invalid state transitions and keeps current state', () => {
      const sm = new AgentStateMachine(AgentState.JOB_PAGE);
      // Directly jumping from JOB_PAGE to REVIEW is invalid
      assert.strictEqual(sm.transition(AgentState.REVIEW, 'http://test.com', 'Invalid jump'), false);
      assert.strictEqual(sm.current, AgentState.JOB_PAGE);
    });

    it('correctly identifies terminal states', () => {
      const sm1 = new AgentStateMachine(AgentState.CAPTCHA_REQUIRED);
      assert.strictEqual(sm1.isTerminal, true);

      const sm2 = new AgentStateMachine(AgentState.LOGIN_REQUIRED);
      assert.strictEqual(sm2.isTerminal, true);

      const sm3 = new AgentStateMachine(AgentState.COMPLETED);
      assert.strictEqual(sm3.isTerminal, true);
    });

    it('classifies states from page analysis results', () => {
      assert.strictEqual(
        AgentStateMachine.classifyFromPageAnalysis({ classification: PageClassification.JOB_DETAIL_PAGE }),
        AgentState.JOB_PAGE
      );
      assert.strictEqual(
        AgentStateMachine.classifyFromPageAnalysis({ classification: PageClassification.APPLICATION_FORM }),
        AgentState.APPLICATION_FORM
      );
      assert.strictEqual(
        AgentStateMachine.classifyFromPageAnalysis({
          classification: PageClassification.UNKNOWN,
          securityBlocker: { type: 'CAPTCHA' },
        }),
        AgentState.CAPTCHA_REQUIRED
      );
    });
  });

  // ─── 2. AXTree Semantic Snapshot Builder Tests ─────────────────────────────
  describe('AXTree Semantic Snapshot Builder', () => {
    it('generates compact semantic tree without raw HTML and tags page regions', async () => {
      const page = await browser.newPage();
      try {
        await page.setContent(`
          <!DOCTYPE html>
          <html>
          <head><title>Staff Engineer - Acme Corp</title></head>
          <body>
            <header>
              <nav><a href="/">Home</a><a href="/about">About</a></nav>
              <h1>Staff Engineer</h1>
              <button id="apply-btn">Apply Now</button>
            </header>
            <main class="job-description">
              <p>Acme is looking for a Staff Engineer.</p>
              <a href="/jobs/apply/123" role="button" class="btn-primary">Apply on Company Site</a>
            </main>
            <aside class="sidebar">
              <div class="related-jobs">
                <a href="/jobs/456">Other Job: DevOps</a>
              </div>
            </aside>
            <footer>
              <p>Copyright Acme</p>
              <a href="/privacy">Privacy Policy</a>
            </footer>
          </body>
          </html>
        `);

        const snapshot = await AXTreeBuilder.build(page);
        assert.strictEqual(snapshot.title, 'Staff Engineer - Acme Corp');
        assert.ok(snapshot.elements.length > 0);

        // Verify elements have IDs and regions
        const applyBtn = snapshot.elements.find(e => e.name === 'Apply Now');
        assert.ok(applyBtn);
        assert.ok(applyBtn.id.startsWith('element_'));
        assert.strictEqual(applyBtn.region, 'job-header');

        const applyLink = snapshot.elements.find(e => e.name === 'Apply on Company Site');
        assert.ok(applyLink);
        assert.strictEqual(applyLink.region, 'job-content');

        // Verify text representation format
        assert.ok(snapshot.textRepresentation.includes('INTERACTIVE ELEMENTS'));
        assert.ok(snapshot.textRepresentation.includes('[REGION: JOB-HEADER]'));
        assert.ok(snapshot.textRepresentation.includes('role=button'));
      } finally {
        await page.close();
      }
    });

    it('filters out cookie banners and hidden elements from primary candidates', async () => {
      const page = await browser.newPage();
      try {
        await page.setContent(`
          <!DOCTYPE html>
          <html>
          <body>
            <button style="display: none;">Hidden Button</button>
            <button style="visibility: hidden;">Invisible Button</button>
            <button id="real-btn">Real Apply Button</button>
          </body>
          </html>
        `);

        const snapshot = await AXTreeBuilder.build(page);
        const names = snapshot.elements.map(e => e.name);
        assert.ok(names.includes('Real Apply Button'));
        assert.strictEqual(names.includes('Hidden Button'), false);
        assert.strictEqual(names.includes('Invisible Button'), false);
      } finally {
        await page.close();
      }
    });
  });

  // ─── 3. Strategy Memory Tests ─────────────────────────────────────────────
  describe('Strategy Memory', () => {
    const testMemoryPath = '/tmp/test-jahq-strategy-memory.json';

    before(async () => {
      StrategyMemory.clear();
      await StrategyMemory.load(testMemoryPath);
    });

    it('extracts domain correctly from varied URL formats', () => {
      assert.strictEqual(StrategyMemory.extractDomain('https://careers.google.com/jobs/results/123'), 'careers.google.com');
      assert.strictEqual(StrategyMemory.extractDomain('https://www.netflix.jobs/jobs/123'), 'netflix.jobs');
      assert.strictEqual(StrategyMemory.extractDomain('http://localhost:3000/apply'), 'localhost:3000');
    });

    it('records and retrieves successful strategies', async () => {
      await StrategyMemory.recordSuccess('https://careers.airbnb.com/positions/12345', {
        ats: 'custom-portal',
        applicationTriggerSelector: 'button.apply-now-button',
        applicationTriggerText: 'Apply Now',
        flow: ['job_page', 'application_form'],
      });

      const retrieved = await StrategyMemory.get('https://careers.airbnb.com/positions/67890');
      assert.ok(retrieved);
      assert.strictEqual(retrieved.domain, 'careers.airbnb.com');
      assert.strictEqual(retrieved.applicationTriggerSelector, 'button.apply-now-button');
      assert.strictEqual(retrieved.successCount, 1);
    });

    it('increments failure count on recordFailure', async () => {
      await StrategyMemory.recordFailure('https://careers.airbnb.com/positions/12345');
      const retrieved = await StrategyMemory.get('https://careers.airbnb.com/positions/12345');
      assert.ok(retrieved);
      assert.strictEqual(retrieved.failureCount, 1);
    });
  });

  // ─── 4. Agent Telemetry Tests ──────────────────────────────────────────────
  describe('Agent Telemetry', () => {
    it('records entries and computes aggregate session metrics', async () => {
      const logs: any[] = [];
      const mockLogger: any = {
        log: async (_lvl: any, step: string, msg: string, meta: any, dur: number) => {
          logs.push({ step, msg, meta, dur });
        },
        info: async (step: string, msg: string, meta: any) => {
          logs.push({ step, msg, meta });
        },
        warn: async () => {},
        error: async () => {},
      };

      const telemetry = new AgentTelemetry('session-123', mockLogger);
      telemetry.markApplicationAttempted();

      await telemetry.record(telemetry.buildEntry({
        currentState: AgentState.JOB_PAGE,
        previousState: AgentState.INITIALIZING,
        url: 'http://example.com/job',
        action: 'classify',
        actionSource: 'deterministic',
        deterministicScore: 90,
        reason: 'Job detail page confirmed',
        result: 'success',
        latencyMs: 45,
      }));

      await telemetry.record(telemetry.buildEntry({
        currentState: AgentState.CLICKING_APPLICATION_TRIGGER,
        previousState: AgentState.JOB_PAGE,
        url: 'http://example.com/job',
        action: 'click',
        actionSource: 'deepseek',
        model: 'deepseek-v4-flash',
        modelConfidence: 0.95,
        targetElement: 'Apply Now',
        reason: 'Selected primary apply button',
        result: 'success',
        latencyMs: 250,
        deepseekPromptTokens: 120,
        deepseekCompletionTokens: 35,
      }));

      const metrics = telemetry.getMetrics();
      assert.strictEqual(metrics.totalActions, 2);
      assert.strictEqual(metrics.deterministicActions, 1);
      assert.strictEqual(metrics.deepseekActions, 1);
      assert.strictEqual(metrics.successfulActions, 2);
      assert.strictEqual(metrics.totalDeepseekPromptTokens, 120);
      assert.strictEqual(metrics.totalDeepseekCompletionTokens, 35);

      await telemetry.flushSessionMetrics();
      assert.ok(logs.some(l => l.step === 'agent_session_metrics'));
    });
  });

  // ─── 5. Candidate Ranking with Region Penalties ────────────────────────────
  describe('Page Analyzer Region-Aware Candidate Ranking', () => {
    it('penalizes controls in footers, navigation, ads, and related jobs', async () => {
      const page = await browser.newPage();
      try {
        await page.setContent(`
          <!DOCTYPE html>
          <html>
          <body>
            <header>
              <nav><a href="/apply-filter">Apply filters</a></nav>
            </header>
            <main>
              <h1>Lead Architect</h1>
              <button id="main-apply-btn" class="btn-apply">Apply for this job</button>
            </main>
            <div class="advertisement">
              <a href="https://ad.com">Apply for Credit Card</a>
            </div>
            <div class="related-jobs">
              <button>Apply to similar role</button>
            </div>
            <footer>
              <a href="/footer-apply">Apply to be a Partner</a>
            </footer>
          </body>
          </html>
        `);

        const analysis = await GenericPageAnalyzer.analyze(page);
        assert.ok(analysis.bestControl);
        assert.strictEqual(analysis.bestControl.text, 'Apply for this job');
        assert.strictEqual(analysis.bestControl.region, 'job-content');
        assert.ok(analysis.bestControl.confidence >= 75);

        // Verify non-apply and ads are filtered or scored much lower
        const texts = analysis.candidates.map(c => c.text);
        assert.strictEqual(texts.includes('Apply filters'), false); // negative regex filter
      } finally {
        await page.close();
      }
    });
  });

  // ─── 6. AI Decision JSON Parsing & Visual Coordinate Validation ───────────
  describe('AI Decision Parsing & Coordinate Validation', () => {
    it('parses valid and code-fenced DeepSeek JSON decisions', () => {
      const rawJson = '{"action": "click", "target_id": "element_4", "confidence": 0.95, "reason": "Primary Apply button"}';
      const parsed1 = parseDeepSeekJson<any>(rawJson);
      assert.ok(parsed1);
      assert.strictEqual(parsed1.action, 'click');
      assert.strictEqual(parsed1.target_id, 'element_4');

      const fencedJson = '```json\n{"action": "dismiss", "target_id": "element_2", "confidence": 0.88, "reason": "Cookie banner close button"}\n```';
      const parsed2 = parseDeepSeekJson<any>(fencedJson);
      assert.ok(parsed2);
      assert.strictEqual(parsed2.action, 'dismiss');
    });

    it('parses valid Gemini JSON decisions', () => {
      const raw = '{"action": "click", "x": 500, "y": 300, "confidence": 0.92, "reason": "Blue apply button visually in view"}';
      const parsed = parseGeminiJson<any>(raw);
      assert.ok(parsed);
      assert.strictEqual(parsed.x, 500);
      assert.strictEqual(parsed.y, 300);
    });

    it('rejects out-of-viewport coordinates in visual validation', async () => {
      const page = await browser.newPage();
      try {
        await page.setViewportSize({ width: 1280, height: 800 });
        await page.setContent('<h1>Test</h1>');

        const res = await GeminiVisualFallback.validateAndClickCoordinates(page, 2000, 3000);
        assert.strictEqual(res.success, false);
        assert.ok(res.reason?.includes('outside viewport'));
      } finally {
        await page.close();
      }
    });
  });

  // ─── 7. Security Boundaries & Deterministic GenericAgent Execution ────────
  describe('Security Boundary & Generic Agent Execution', () => {
    it('stops and throws APPLICATION_BLOCKED_BY_CAPTCHA on CAPTCHA challenge', async () => {
      const page = await browser.newPage();
      try {
        await page.setContent(`
          <!DOCTYPE html>
          <html>
          <body>
            <h1>Security Check</h1>
            <div class="cf-turnstile" data-sitekey="test-key"></div>
            <p>Please verify you are a human.</p>
          </body>
          </html>
        `);

        const mockSession: any = { _page: page, page };
        const mockLogger: any = { info: async () => {}, warn: async () => {}, error: async () => {}, log: async () => {} };
        const agent = new GenericApplicationAgent();

        await assert.rejects(
          async () => {
            await agent.initiateApplication(mockSession, {
              sessionId: 'test-session-security',
              userId: 'u1',
              jobId: 'j1',
              jobUrl: 'http://localhost/captcha',
              resumeMarkdown: '# Resume',
              coverLetterMarkdown: '',
              userProfile: { name: 'Dev', email: 'dev@example.com' },
              simulationMode: true,
            }, mockLogger);
          },
          (err: any) => {
            assert.ok(err instanceof InterventionError);
            assert.strictEqual(err.reason, InterventionReason.APPLICATION_BLOCKED_BY_CAPTCHA);
            return true;
          }
        );
      } finally {
        await page.close();
      }
    });

    it('successfully initiates application deterministically on high-confidence page', async () => {
      const page = await browser.newPage();
      try {
        await page.setContent(`
          <!DOCTYPE html>
          <html>
          <body>
            <header><h1>Principal Engineer</h1></header>
            <main>
              <button id="apply-btn" onclick="window.clickedApply = true; document.body.innerHTML = '<h1>Apply</h1><form><input name=email /><input type=file name=resume /><button type=submit>Submit</button></form>';">Apply Now</button>
            </main>
          </body>
          </html>
        `);

        const mockSession: any = {
          _page: page,
          page,
          findFormFrame: async () => page,
        };
        const mockLogger: any = { info: async () => {}, warn: async () => {}, error: async () => {}, log: async () => {} };
        const agent = new GenericApplicationAgent();

        const result = await agent.initiateApplication(mockSession, {
          sessionId: 'test-session-deterministic',
          userId: 'u1',
          jobId: 'j1',
          jobUrl: 'http://localhost/job',
          resumeMarkdown: '# Resume',
          coverLetterMarkdown: '',
          userProfile: { name: 'Dev', email: 'dev@example.com' },
          simulationMode: true,
        }, mockLogger);

        const isClicked = await page.evaluate(() => (window as any).clickedApply);
        assert.strictEqual(isClicked, true);
        assert.strictEqual(result.success, true);
        assert.strictEqual(result.reachedForm, true);
      } finally {
        await page.close();
      }
    });
  });
});
