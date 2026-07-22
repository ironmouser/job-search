import { ATSPlatform, ATSDetectionResult } from './types';
import { ATSPlugin } from './plugins/base-plugin';


/**
 * PluginRegistry — discovers and provides the correct ATSPlugin for a given platform.
 *
 * Plugins self-register on import. The WorkflowEngine never uses if/else chains
 * to select a plugin — it always goes through the registry.
 *
 * Usage:
 *   pluginRegistry.register(new WorkdayPlugin());
 *   const plugin = pluginRegistry.get(ATSPlatform.WORKDAY);
 */
class PluginRegistry {
  private plugins = new Map<ATSPlatform, ATSPlugin>();

  /**
   * Register a plugin. Called by each plugin module on import.
   */
  register(plugin: ATSPlugin): void {
    this.plugins.set(plugin.platform, plugin);
    console.debug(`[PluginRegistry] Registered plugin: ${plugin.displayName} (${plugin.platform})`);
  }

  /**
   * Retrieve a plugin by platform.
   */
  get(platform: ATSPlatform): ATSPlugin | undefined {
    return this.plugins.get(platform);
  }

  /**
   * All registered plugins.
   */
  getAll(): ATSPlugin[] {
    return Array.from(this.plugins.values());
  }

  /**
   * Run detection across all registered plugins and return the best match.
   * Returns null if no plugin claims the page with any confidence.
   */
  detect(
    url: string,
    html: string,
    redirectChain: string[]
  ): { plugin: ATSPlugin; result: ATSDetectionResult } | null {
    let bestMatch: { plugin: ATSPlugin; result: ATSDetectionResult } | null = null;

    for (const plugin of this.plugins.values()) {
      const result = plugin.detect(url, html, redirectChain);
      if (result.confidence > (bestMatch?.result.confidence ?? 0)) {
        bestMatch = { plugin, result };
      }
    }

    return bestMatch;
  }
}

// Singleton registry shared across the worker process
export const pluginRegistry = new PluginRegistry();

// ─── Auto-registration ────────────────────────────────────────────────────────
// Import each plugin here. The plugin constructors call pluginRegistry.register()
// on instantiation, keeping the core code free of platform-specific logic.

import './workday';
import './greenhouse';
import './lever';
import './ashby';
import './smartrecruiters';
import './taleo';
import './icims';
import './generic-fallback';
