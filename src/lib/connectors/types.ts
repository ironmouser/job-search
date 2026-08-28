/**
 * src/lib/connectors/types.ts
 *
 * Common interfaces for direct ATS connectors and generic career page parsers.
 */

export interface RawDiscoveredJob {
  title: string;
  company: string;
  location: string;
  description: string;
  url: string;
  applicationUrl?: string | null;
  discoverySource?: string | null;
  discoveryUrl?: string | null;
  atsPlatform?: string | null;
  atsJobId?: string | null;
  salaryRange?: string | null;
  source: string;
  isEasyApply?: boolean;
  department?: string | null;
  remoteType?: 'REMOTE' | 'HYBRID' | 'ONSITE' | null;
  postedAt?: Date | null;
}

export interface ATSConnectorConfig {
  companySlug: string;
  companyName?: string;
  domain?: string;
  careerUrl?: string;
}

export interface ConnectorResult {
  success: boolean;
  jobs: RawDiscoveredJob[];
  error?: string | null;
  statusCode?: number;
  isBlocked?: boolean;
}
