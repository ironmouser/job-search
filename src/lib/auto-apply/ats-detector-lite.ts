import { ATSPlatform, ATSDetectionResult } from './types';
import { detectAtsFromUrl as unifiedDetectAtsFromUrl } from '../atsDetector';

/**
 * ATSDetectorLite — lightweight, URL-based ATS detection for the Railway API.
 * Delegates to the unified ATSDetector while preserving auto-apply type signatures.
 */
export function detectATSFromUrl(jobUrl: string): ATSDetectionResult {
  const result = unifiedDetectAtsFromUrl(jobUrl);
  return {
    platform: (result.platform as unknown) as ATSPlatform,
    confidence: result.confidence,
    detectedFeatures: result.detectedFeatures,
    automationSupported: result.automationSupported,
  };
}
