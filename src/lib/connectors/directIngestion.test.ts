/**
 * src/lib/connectors/directIngestion.test.ts
 *
 * Automated tests for ATS detection, direct connectors, source discovery, and deduplication.
 */

import { detectAtsFromUrl, detectAtsFromHtml, ATSPlatform } from '../atsDetector';
import { identifyDirectSourceFromJob } from '../sourceDiscovery';
import { fetchGreenhouseJobs } from './greenhouse';
import { fetchLeverJobs } from './lever';
import { fetchAshbyJobs } from './ashby';
import { fetchWorkableJobs } from './workable';
import { fetchSmartRecruitersJobs } from './smartrecruiters';

async function runTests() {
  console.log('--- Starting Direct Ingestion & ATS Discovery Tests ---\n');
  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string) {
    if (condition) {
      console.log(`✅ PASS: ${testName}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${testName}`);
      failed++;
    }
  }

  // ── 1. ATS Detection by URL Tests ──────────────────────────────────────────
  console.log('1. Testing URL ATS Detection...');

  const ghRes = detectAtsFromUrl('https://boards.greenhouse.io/stripe/jobs/123456');
  assert(ghRes.platform === ATSPlatform.GREENHOUSE && ghRes.companySlug === 'stripe', 'Detects Greenhouse board URL');

  const ghParamRes = detectAtsFromUrl('https://careers.datadoghq.com/detail/123/?gh_jid=456789');
  assert(ghParamRes.platform === ATSPlatform.GREENHOUSE && ghParamRes.jobId === '456789', 'Detects embedded gh_jid param');

  const leverRes = detectAtsFromUrl('https://jobs.lever.co/netflix/abcdef-1234');
  assert(leverRes.platform === ATSPlatform.LEVER && leverRes.companySlug === 'netflix', 'Detects Lever URL');

  const leverParamRes = detectAtsFromUrl('https://company.com/job?lever_token=tok123');
  assert(leverParamRes.platform === ATSPlatform.LEVER && leverParamRes.jobId === 'tok123', 'Detects embedded lever_token param');

  const ashbyRes = detectAtsFromUrl('https://jobs.ashbyhq.com/openai/987654');
  assert(ashbyRes.platform === ATSPlatform.ASHBY && ashbyRes.companySlug === 'openai', 'Detects Ashby URL');

  const workableRes = detectAtsFromUrl('https://apply.workable.com/bitpanda/j/ABC12345/');
  assert(workableRes.platform === ATSPlatform.WORKABLE && workableRes.companySlug === 'bitpanda', 'Detects Workable URL');

  const srRes = detectAtsFromUrl('https://careers.smartrecruiters.com/Ubisoft2/743999');
  assert(srRes.platform === ATSPlatform.SMARTRECRUITERS && srRes.companySlug === 'ubisoft2', 'Detects SmartRecruiters URL');

  const wdRes = detectAtsFromUrl('https://nvidia.wd5.myworkdayjobs.com/NVIDIAExternalCareerSite/job/123');
  assert(wdRes.platform === ATSPlatform.WORKDAY, 'Detects Workday URL');

  const unknownRes = detectAtsFromUrl('https://randomcompany.com/about');
  assert(unknownRes.platform === ATSPlatform.UNKNOWN, 'Returns UNKNOWN for non-ATS site');

  // ── 2. ATS Detection by HTML Signatures ────────────────────────────────────
  console.log('\n2. Testing HTML Signature Detection...');

  const sampleHtml = `
    <html>
      <head>
        <script type="application/ld+json">
          {
            "@type": "JobPosting",
            "title": "Software Engineer",
            "directApply": "https://boards.greenhouse.io/figma/jobs/998877"
          }
        </script>
      </head>
      <body>
        <a href="https://jobs.lever.co/figma/123">Apply</a>
      </body>
    </html>
  `;
  const htmlDetectRes = detectAtsFromHtml(sampleHtml);
  assert(htmlDetectRes.platform === ATSPlatform.GREENHOUSE && htmlDetectRes.confidence >= 90, 'Extracts ATS from JSON-LD directApply');

  // ── 3. Passive Source Discovery Tests ──────────────────────────────────────
  console.log('\n3. Testing Passive Source Discovery...');

  const aggregatorJob = {
    title: 'Staff Backend Engineer',
    company: 'Stripe',
    url: 'https://www.indeed.com/viewjob?jk=indeed123',
    applicationUrl: 'https://boards.greenhouse.io/stripe/jobs/556677?gh_src=indeed',
  };

  const discovered = identifyDirectSourceFromJob(aggregatorJob);
  assert(
    discovered !== null &&
    discovered.name === 'Stripe' &&
    discovered.atsPlatform === ATSPlatform.GREENHOUSE &&
    discovered.atsCompanySlug === 'stripe',
    'Sniffs Greenhouse source metadata from aggregator applicationUrl'
  );

  const customPortalJob = {
    title: 'Product Designer',
    company: 'Linear',
    url: 'https://linear.app/careers/detail/123?ashby_jid=linear_99',
    applicationUrl: null,
  };
  const discoveredAshby = identifyDirectSourceFromJob(customPortalJob);
  assert(
    discoveredAshby !== null &&
    discoveredAshby.atsPlatform === ATSPlatform.ASHBY,
    'Sniffs Ashby source metadata from URL query param'
  );

  // ── 4. Live API Connector Sanity Tests ─────────────────────────────────────
  console.log('\n4. Testing Live ATS Connectors against known public endpoints...');

  try {
    const ghJobs = await fetchGreenhouseJobs({ companySlug: 'figma', companyName: 'Figma' });
    const hasAtsMeta = ghJobs.jobs.every((j) => j.atsPlatform === 'greenhouse' && !!j.atsJobId);
    assert(ghJobs.success && ghJobs.jobs.length > 0 && hasAtsMeta, `Greenhouse connector fetched ${ghJobs.jobs.length} Figma jobs with ATS metadata`);
  } catch (e: any) {
    console.error(`Greenhouse test warning: ${e.message}`);
  }

  try {
    const leverJobs = await fetchLeverJobs({ companySlug: 'palantir', companyName: 'Palantir' });
    const hasAtsMeta = leverJobs.jobs.every((j) => j.atsPlatform === 'lever' && !!j.atsJobId);
    assert(leverJobs.success && leverJobs.jobs.length > 0 && hasAtsMeta, `Lever connector fetched ${leverJobs.jobs.length} Palantir jobs with ATS metadata`);
  } catch (e: any) {
    console.error(`Lever test warning: ${e.message}`);
  }

  try {
    const ashbyJobs = await fetchAshbyJobs({ companySlug: 'openai', companyName: 'OpenAI' });
    const hasAtsMeta = ashbyJobs.jobs.every((j) => j.atsPlatform === 'ashby' && !!j.atsJobId);
    assert(ashbyJobs.success && ashbyJobs.jobs.length > 0 && hasAtsMeta, `Ashby connector fetched ${ashbyJobs.jobs.length} OpenAI jobs with ATS metadata`);
  } catch (e: any) {
    console.error(`Ashby test warning: ${e.message}`);
  }

  try {
    const srJobs = await fetchSmartRecruitersJobs({ companySlug: 'Ubisoft2', companyName: 'Ubisoft' });
    const hasAtsMeta = srJobs.jobs.every((j) => j.atsPlatform === 'smartrecruiters' && !!j.atsJobId);
    assert(srJobs.success && srJobs.jobs.length > 0 && hasAtsMeta, `SmartRecruiters connector fetched ${srJobs.jobs.length} Ubisoft jobs with ATS metadata`);
  } catch (e: any) {
    console.error(`SmartRecruiters test warning: ${e.message}`);
  }

  try {
    const { fetchWorkdayJobs } = await import('./workday');
    const wdJobs = await fetchWorkdayJobs({
      careerUrl: 'https://nvidia.wd5.myworkdayjobs.com/NVIDIAExternalCareerSite',
      companySlug: 'nvidia',
      companyName: 'Nvidia',
      maxJobs: 25,
    });
    const hasAtsMeta = wdJobs.jobs.every((j) => j.atsPlatform === 'workday');
    assert(wdJobs.success && wdJobs.jobs.length > 0 && hasAtsMeta, `Workday connector fetched ${wdJobs.jobs.length} Nvidia jobs with ATS metadata`);
  } catch (e: any) {
    console.error(`Workday test warning: ${e.message}`);
  }

  // ── 5. Database Seeding & Bulk Ingestion Tests ──────────────────────────────
  console.log('\n5. Testing Database Seeding & Passive Source Discovery...');

  try {
    const { seedCuratedCareerSources, crawlCareerSource } = await import('../directIngestion');
    const { bulkSniffAndRegisterSources } = await import('../sourceDiscovery');

    const seeded = await seedCuratedCareerSources();
    assert(seeded >= 50, `Seeded ${seeded} curated employer career sources`);

    const bulkCount = await bulkSniffAndRegisterSources([
      { company: 'PostHog', url: 'https://posthog.com', applicationUrl: 'https://jobs.ashbyhq.com/posthog/123' },
      { company: 'Automattic', url: 'https://automattic.com', applicationUrl: 'https://jobs.lever.co/automattic/456' },
      { company: 'Nvidia', url: 'https://nvidia.com', applicationUrl: 'https://nvidia.wd5.myworkdayjobs.com/NVIDIAExternalCareerSite/job/1' },
    ]);
    assert(bulkCount >= 3, `Bulk sniffed and registered ${bulkCount} new direct career sources`);
  } catch (dbErr: any) {
    console.error(`Database test error: ${dbErr.message}`);
    failed++;
  }

  console.log(`\n--- Test Summary: ${passed} passed, ${failed} failed ---`);
  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(console.error);
