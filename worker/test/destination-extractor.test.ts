import {
  extractEmbeddedScriptUrls,
  extractApplicationUrlFromJson,
  isLegitimateApplicationDestination,
} from '../src/utils/destination-validator';

function runTests() {
  console.log('Testing destination extractor...');

  // Test 1: BuiltIn jobPostInit script extraction
  const builtinScript = `
    <script type="module">
        Builtin.jobPostInit({"job":{"id":10289162,"drupalId":10289162,"isSaved":false,"howToApply":"https://careers.datadoghq.com/detail/8076871/?gh_jid=8076871\\u0026gh_src=c6d4c5501","companyName":"Datadog","title":"Product Manager II - Alerting","isEasyApply":true,"resolvedBidId":null},"siteId":9,"isApplyFormEnabled":false,"isResumeFormEnabled":false,"resumeMaxFileSize":2097152,"resumeAllowedFileExtensions":["pdf","docx"],"isLoggedIn":false,"salesforceData":{"orgId":"00D1a000000HjWM","actionUrl":"https://webto.salesforce.com/servlet/servlet.WebToCase?encoding=UTF-8\\u0026orgId=00D1a000000HjWM","jobUrlFieldId":"00NVb000001IX1l"},"user":{"subjectId":"","name":"","email":"","phone":""},"externalApiUrl":"https://api.builtin.com","jobTrackerStatus":"save"});
    </script>
  `;

  const extracted1 = extractEmbeddedScriptUrls([builtinScript]);
  console.assert(extracted1.length === 1, `Expected 1 URL, got ${extracted1.length}`);
  console.assert(
    extracted1[0] === 'https://careers.datadoghq.com/detail/8076871/?gh_jid=8076871&gh_src=c6d4c5501',
    `Extracted URL mismatch: ${extracted1[0]}`
  );
  console.log('✓ Test 1 Passed: BuiltIn jobPostInit howToApply extracted correctly');

  // Test 2: JSON-LD @graph JobPosting
  const jsonLdScript = JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'JobPosting',
        title: 'Senior Software Engineer',
        url: 'https://boards.greenhouse.io/stripe/jobs/12345',
        directApply: true,
      },
    ],
  });

  const extracted2 = extractEmbeddedScriptUrls([jsonLdScript]);
  console.assert(extracted2.length === 1, `Expected 1 URL from JSON-LD, got ${extracted2.length}`);
  console.assert(
    extracted2[0] === 'https://boards.greenhouse.io/stripe/jobs/12345',
    `Extracted JSON-LD URL mismatch: ${extracted2[0]}`
  );
  console.log('✓ Test 2 Passed: JSON-LD @graph JobPosting extracted correctly');

  // Test 3: Destination validation for BuiltIn target
  const validation = isLegitimateApplicationDestination(
    'https://careers.datadoghq.com/detail/8076871/?gh_jid=8076871&gh_src=c6d4c5501',
    'https://builtin.com/job/product-manager-ii-alerting/10289162'
  );
  console.assert(validation.valid === true, `Expected validation to be true, got ${validation.valid}`);
  console.log('✓ Test 3 Passed: Datadog Greenhouse URL validated as legitimate application destination');

  console.log('All destination extractor tests passed successfully!');
}

runTests();
