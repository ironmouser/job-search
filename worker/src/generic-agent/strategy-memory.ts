/**
 * worker/src/generic-agent/strategy-memory.ts
 *
 * StrategyMemory — stores and retrieves successful navigation strategies
 * indexed by domain / URL pattern.
 *
 * Persists learned selectors and interaction sequences so that repeated applications
 * to the same portal bypass exploratory reasoning and execute known-good paths.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { agentConfig } from '../config';
import { StrategyMemoryEntry } from './types';

export class StrategyMemory {
  private static cache: Map<string, StrategyMemoryEntry> = new Map();
  private static isLoaded = false;
  private static filePath: string = agentConfig.strategyMemoryPath;

  /**
   * Load strategies from disk cache.
   */
  static async load(customPath?: string): Promise<void> {
    if (customPath) {
      this.filePath = customPath;
    }
    if (!agentConfig.strategyMemoryEnabled && !customPath) {
      return;
    }

    try {
      const data = await fs.readFile(this.filePath, 'utf-8');
      const parsed = JSON.parse(data) as Record<string, StrategyMemoryEntry>;
      this.cache.clear();
      for (const [key, entry] of Object.entries(parsed)) {
        this.cache.set(key, entry);
      }
      this.isLoaded = true;
    } catch {
      // If file doesn't exist, start fresh
      this.cache.clear();
      this.isLoaded = true;
    }
  }

  /**
   * Save strategies to disk cache.
   */
  static async persist(): Promise<void> {
    if (!agentConfig.strategyMemoryEnabled) {
      return;
    }

    try {
      const dir = path.dirname(this.filePath);
      await fs.mkdir(dir, { recursive: true });
      const obj: Record<string, StrategyMemoryEntry> = {};
      for (const [key, val] of this.cache.entries()) {
        obj[key] = val;
      }
      await fs.writeFile(this.filePath, JSON.stringify(obj, null, 2), 'utf-8');
    } catch (err) {
      console.warn('[StrategyMemory] Failed to persist memory cache:', err);
    }
  }

  /**
   * Extract hostname/domain key from URL.
   */
  static extractDomain(rawUrl: string): string {
    try {
      const parsed = new URL(rawUrl);
      return parsed.hostname.toLowerCase().replace(/^www\./, '');
    } catch {
      return rawUrl.toLowerCase();
    }
  }

  /**
   * Retrieve a saved strategy for a domain.
   */
  static async get(url: string): Promise<StrategyMemoryEntry | null> {
    if (!this.isLoaded) {
      await this.load();
    }
    const domain = this.extractDomain(url);
    const entry = this.cache.get(domain);
    if (!entry) return null;

    // Only return if success count outweighs failure count significantly
    if (entry.failureCount > entry.successCount + 2) {
      return null;
    }

    return entry;
  }

  /**
   * Record a successful application flow or trigger for a domain.
   */
  static async recordSuccess(
    url: string,
    data: {
      ats?: string;
      applicationTriggerSelector?: string;
      applicationTriggerText?: string;
      cookieSelector?: string;
      flow?: string[];
      selectorUsed?: string;
    }
  ): Promise<void> {
    if (!this.isLoaded) {
      await this.load();
    }

    const domain = this.extractDomain(url);
    const existing = this.cache.get(domain) || {
      domain,
      flow: [],
      successfulSelectors: [],
      lastUsed: new Date().toISOString(),
      successCount: 0,
      failureCount: 0,
    };

    existing.ats = data.ats || existing.ats;
    existing.applicationTriggerSelector = data.applicationTriggerSelector || existing.applicationTriggerSelector;
    existing.applicationTriggerText = data.applicationTriggerText || existing.applicationTriggerText;
    existing.cookieSelector = data.cookieSelector || existing.cookieSelector;
    if (data.flow) existing.flow = data.flow;
    if (data.selectorUsed && !existing.successfulSelectors.includes(data.selectorUsed)) {
      existing.successfulSelectors.push(data.selectorUsed);
    }
    existing.successCount += 1;
    existing.lastUsed = new Date().toISOString();

    this.cache.set(domain, existing);
    await this.persist();
  }

  /**
   * Record a strategy failure.
   */
  static async recordFailure(url: string): Promise<void> {
    if (!this.isLoaded) {
      await this.load();
    }

    const domain = this.extractDomain(url);
    const existing = this.cache.get(domain);
    if (existing) {
      existing.failureCount += 1;
      existing.lastUsed = new Date().toISOString();
      this.cache.set(domain, existing);
      await this.persist();
    }
  }

  /**
   * Clear cache (used primarily for testing).
   */
  static clear(): void {
    this.cache.clear();
    this.isLoaded = true;
  }
}
