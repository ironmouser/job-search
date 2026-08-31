import { Page, CDPSession } from 'playwright';
import { ServerResponse } from 'http';

export interface StreamInputEvent {
  type: 'click' | 'mousedown' | 'mouseup' | 'mousemove' | 'wheel' | 'keydown' | 'keyup' | 'type' | 'paste' | 'shortcut' | 'touch' | 'navigate';
  x?: number;
  y?: number;
  button?: 'left' | 'right' | 'middle';
  clickCount?: number;
  deltaX?: number;
  deltaY?: number;
  key?: string;
  code?: string;
  text?: string;
  ctrl?: boolean;
  meta?: boolean;
  shift?: boolean;
  alt?: boolean;
  touchPoints?: Array<{ x: number; y: number; id: number }>;
  url?: string;
}

interface ActiveStream {
  sessionId: string;
  page: Page;
  cdpSession: CDPSession;
  clients: Set<ServerResponse>;
  lastFrameBase64: string | null;
  lastFrameTimestamp: number;
  active: boolean;
}

class BrowserStreamServer {
  private activeStreams = new Map<string, ActiveStream>();

  /**
   * Starts a CDP screencast on the active Playwright page for a given session.
   */
  async startStreaming(sessionId: string, page: Page): Promise<void> {
    if (this.activeStreams.has(sessionId)) {
      const existing = this.activeStreams.get(sessionId)!;
      if (existing.active && existing.page === page) {
        return;
      }
      await this.stopStreaming(sessionId);
    }

    try {
      const cdpSession = await page.context().newCDPSession(page);

      const stream: ActiveStream = {
        sessionId,
        page,
        cdpSession,
        clients: new Set(),
        lastFrameBase64: null,
        lastFrameTimestamp: Date.now(),
        active: true,
      };

      this.activeStreams.set(sessionId, stream);

      cdpSession.on('Page.screencastFrame', async ({ data, sessionId: frameSessionId }) => {
        stream.lastFrameBase64 = data;
        stream.lastFrameTimestamp = Date.now();

        // Acknowledge frame to receive next frame
        try {
          await cdpSession.send('Page.screencastFrameAck', { sessionId: frameSessionId });
        } catch {
          // ignore if session closed
        }

        // Broadcast to all connected SSE clients
        const currentUrl = page.url();
        const payload = JSON.stringify({
          frame: data,
          url: currentUrl,
          timestamp: Date.now(),
        });

        for (const client of stream.clients) {
          try {
            client.write(`event: frame\ndata: ${payload}\n\n`);
          } catch {
            stream.clients.delete(client);
          }
        }
      });

      // Start screencast at 75% JPEG quality
      await cdpSession.send('Page.startScreencast', {
        format: 'jpeg',
        quality: 75,
        maxWidth: 1920,
        maxHeight: 1080,
        everyNthFrame: 1,
      });

      console.info(`[BrowserStream] Screencast active for session ${sessionId}`);
    } catch (err: any) {
      console.warn(`[BrowserStream] Failed to start screencast for session ${sessionId}:`, err.message);
    }
  }

  /**
   * Registers a client Server-Sent Events (SSE) connection for a session stream.
   */
  subscribeClient(sessionId: string, res: ServerResponse): void {
    const stream = this.activeStreams.get(sessionId);
    if (!stream) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: `No active stream for session ${sessionId}` }));
      return;
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });
    res.write(':\n\n'); // SSE comment ping

    stream.clients.add(res);

    // Send immediate initial frame if available
    if (stream.lastFrameBase64) {
      const initialPayload = JSON.stringify({
        frame: stream.lastFrameBase64,
        url: stream.page.url(),
        timestamp: stream.lastFrameTimestamp,
      });
      res.write(`event: frame\ndata: ${initialPayload}\n\n`);
    }

    res.on('close', () => {
      stream.clients.delete(res);
    });
  }

  /**
   * Dispatches user mouse, touch, or keyboard inputs to the cloud browser page.
   */
  async dispatchInput(sessionId: string, event: StreamInputEvent): Promise<{ success: boolean; error?: string }> {
    const stream = this.activeStreams.get(sessionId);
    if (!stream || !stream.active) {
      return { success: false, error: 'No active stream for session' };
    }

    const { page, cdpSession } = stream;
    const x = Math.round(event.x ?? 0);
    const y = Math.round(event.y ?? 0);

    try {
      switch (event.type) {
        case 'click': {
          const button = event.button || 'left';
          // Move mouse cursor first to activate element focus & hover states
          await cdpSession.send('Input.dispatchMouseEvent', {
            type: 'mouseMoved',
            x,
            y,
          }).catch(() => {});
          await cdpSession.send('Input.dispatchMouseEvent', {
            type: 'mousePressed',
            x,
            y,
            button,
            clickCount: event.clickCount || 1,
          });
          await cdpSession.send('Input.dispatchMouseEvent', {
            type: 'mouseReleased',
            x,
            y,
            button,
            clickCount: event.clickCount || 1,
          });
          break;
        }

        case 'mousedown': {
          await cdpSession.send('Input.dispatchMouseEvent', {
            type: 'mousePressed',
            x,
            y,
            button: event.button || 'left',
            clickCount: event.clickCount || 1,
          });
          break;
        }

        case 'mouseup': {
          await cdpSession.send('Input.dispatchMouseEvent', {
            type: 'mouseReleased',
            x,
            y,
            button: event.button || 'left',
            clickCount: event.clickCount || 1,
          });
          break;
        }

        case 'mousemove': {
          await cdpSession.send('Input.dispatchMouseEvent', {
            type: 'mouseMoved',
            x,
            y,
          });
          break;
        }

        case 'wheel': {
          await cdpSession.send('Input.dispatchMouseEvent', {
            type: 'mouseWheel',
            x,
            y,
            deltaX: event.deltaX || 0,
            deltaY: event.deltaY || 0,
          });
          break;
        }

        case 'touch': {
          if (event.touchPoints && event.touchPoints.length > 0) {
            await cdpSession.send('Input.dispatchTouchEvent', {
              type: 'touchStart',
              touchPoints: event.touchPoints.map((tp) => ({
                x: Math.round(tp.x),
                y: Math.round(tp.y),
                id: tp.id,
              })),
            });
            await cdpSession.send('Input.dispatchTouchEvent', {
              type: 'touchEnd',
              touchPoints: [],
            });
          }
          break;
        }

        case 'paste':
        case 'type': {
          if (event.text) {
            try {
              await page.keyboard.insertText(event.text);
            } catch {
              await page.keyboard.type(event.text, { delay: 10 });
            }
          }
          break;
        }

        case 'shortcut': {
          if (event.key) {
            const modifiers: string[] = [];
            if (event.ctrl || event.meta) modifiers.push('Control');
            if (event.alt) modifiers.push('Alt');
            if (event.shift) modifiers.push('Shift');
            const combo = [...modifiers, event.key].join('+');
            await page.keyboard.press(combo).catch(() => {});
          }
          break;
        }

        case 'keydown': {
          if (event.key) {
            const isSinglePrintable =
              event.text &&
              event.text.length === 1 &&
              !event.key.startsWith('Arrow') &&
              !['Backspace', 'Enter', 'Tab', 'Delete', 'Escape'].includes(event.key);

            if (isSinglePrintable) {
              try {
                await page.keyboard.insertText(event.text!);
              } catch {
                await page.keyboard.press(event.key);
              }
            } else {
              await page.keyboard.press(event.key).catch(async () => {
                await page.keyboard.down(event.key!);
              });
            }
          }
          break;
        }

        case 'keyup': {
          if (event.key) {
            await page.keyboard.up(event.key).catch(() => {});
          }
          break;
        }

        case 'navigate': {
          if (event.url && (event.url.startsWith('http://') || event.url.startsWith('https://'))) {
            await page.goto(event.url, { waitUntil: 'domcontentloaded' }).catch(() => {});
          }
          break;
        }

        default:
          break;
      }

      return { success: true };
    } catch (err: any) {
      console.warn(`[BrowserStream] Input dispatch failed for session ${sessionId}:`, err.message);
      return { success: false, error: err.message };
    }
  }

  /**
   * Refreshes the active page or requests a fresh frame.
   */
  async refreshPage(sessionId: string): Promise<boolean> {
    const stream = this.activeStreams.get(sessionId);
    if (!stream) return false;
    try {
      await stream.page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Harvests current domain cookies and storage state from the active session context.
   */
  async harvestSession(sessionId: string): Promise<{
    provider: string;
    domain: string;
    cookies: any[];
    storageState: any;
  } | null> {
    const stream = this.activeStreams.get(sessionId);
    if (!stream) return null;

    try {
      const context = stream.page.context();
      const currentUrl = stream.page.url() || '';
      const cookies = await context.cookies();
      const storageState = await context.storageState().catch(() => null);

      // Determine provider from URL
      let provider = 'unknown';
      let domain = '';
      try {
        const parsed = new URL(currentUrl);
        domain = parsed.hostname;
        if (domain.includes('dice.com')) provider = 'dice';
        else if (domain.includes('linkedin.com')) provider = 'linkedin';
        else if (domain.includes('indeed.com')) provider = 'indeed';
        else if (domain.includes('ziprecruiter.com')) provider = 'ziprecruiter';
        else if (domain.includes('workday') || domain.includes('myworkdayjobs')) provider = 'workday';
        else if (domain.includes('greenhouse')) provider = 'greenhouse';
        else if (domain.includes('lever.co')) provider = 'lever';
        else if (domain.includes('ashbyhq')) provider = 'ashby';
        else if (domain.includes('smartrecruiters')) provider = 'smartrecruiters';
        else if (domain.includes('icims')) provider = 'icims';
        else if (domain.includes('taleo')) provider = 'taleo';
      } catch {
        // ignore
      }

      return {
        provider,
        domain,
        cookies,
        storageState,
      };
    } catch (err: any) {
      console.warn(`[BrowserStream] Failed to harvest cookies for session ${sessionId}:`, err.message);
      return null;
    }
  }

  /**
   * Stops screencast and cleans up the active CDP stream for a session.
   */
  async stopStreaming(sessionId: string): Promise<void> {
    const stream = this.activeStreams.get(sessionId);
    if (!stream) return;

    stream.active = false;
    this.activeStreams.delete(sessionId);

    for (const client of stream.clients) {
      try {
        client.write('event: close\ndata: {"status": "closed"}\n\n');
        client.end();
      } catch {
        // ignore
      }
    }
    stream.clients.clear();

    try {
      await stream.cdpSession.send('Page.stopScreencast').catch(() => {});
      await stream.cdpSession.detach().catch(() => {});
    } catch {
      // ignore
    }

    console.info(`[BrowserStream] Screencast stopped for session ${sessionId}`);
  }
}

export const browserStreamServer = new BrowserStreamServer();
