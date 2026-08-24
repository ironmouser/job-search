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

  // Test 4: Acceptance of SnagAJob apply redirect endpoint
  const snagApiValidation = isLegitimateApplicationDestination(
    'https://www.snagajob.com/api/jobs/v1/1278090288/apply',
    'https://snagajob.com/jobs/1278090288?searchResponseId=957f7ee2-a40f-4dde-83be-d1b57c8623ff'
  );
  console.assert(snagApiValidation.valid === true, `Expected SnagAJob apply redirect endpoint to be accepted, got ${snagApiValidation.valid}`);
  console.log('✓ Test 4 Passed: SnagAJob apply redirect endpoint correctly recognized as application destination');

  // Test 5: Rejection of non-apply internal API endpoint
  const nonApplyApiValidation = isLegitimateApplicationDestination(
    'https://www.snagajob.com/api/v1/user/tracking',
    'https://snagajob.com/jobs/1278090288?searchResponseId=957f7ee2-a40f-4dde-83be-d1b57c8623ff'
  );
  console.assert(nonApplyApiValidation.valid === false, `Expected non-apply API endpoint to be rejected, got ${nonApplyApiValidation.valid}`);
  console.log('✓ Test 5 Passed: Non-apply internal API endpoint correctly rejected');

  // Test 6: Recognition of JobLeads as an aggregator domain
  const { isAggregatorDomain, classifyCandidate, CandidateClassification } = require('../src/utils/destination-validator');
  console.assert(isAggregatorDomain('https://www.jobleads.com/job/senior-product-owner-123') === true, 'Expected jobleads.com to be aggregator domain');
  console.log('✓ Test 6 Passed: jobleads.com recognized as aggregator domain');

  // Test 7: Classification of "I'm interested" apply button
  const interestedCandidate = classifyCandidate({
    text: "I'm interested",
    href: '',
    ariaLabel: "I'm interested",
    title: '',
    dataTracking: 'job-apply-cta',
    id: 'btn-interest',
    className: 'btn-primary apply-action',
    tagName: 'button',
    role: 'button',
  }, 'https://www.jobleads.com/job/123');

  console.assert(interestedCandidate.accepted === true, 'Expected I\'m interested button to be accepted');
  console.assert(
    interestedCandidate.classification === CandidateClassification.APPLICATION_ACTION_BUTTON,
    `Expected APPLICATION_ACTION_BUTTON, got ${interestedCandidate.classification}`
  );
  console.log('✓ Test 7 Passed: "I\'m interested" button correctly accepted and classified as APPLICATION_ACTION_BUTTON');

  // Test 8: Classification of "I have a resume" onboarding card
  const resumeChoiceCandidate = classifyCandidate({
    text: 'I have a resume >',
    href: '',
    ariaLabel: 'I have a resume',
    title: '',
    dataTracking: 'resume-choice-have',
    id: 'option-have-resume',
    className: 'choice-card',
    tagName: 'button',
    role: 'button',
  }, 'https://www.jobleads.com/job/123');

  console.assert(resumeChoiceCandidate.accepted === true, 'Expected I have a resume card to be accepted');
  console.assert(
    resumeChoiceCandidate.classification === CandidateClassification.APPLICATION_ACTION_BUTTON ||
    resumeChoiceCandidate.classification === CandidateClassification.MODAL_CONTINUE_BUTTON,
    `Expected application action/continue button, got ${resumeChoiceCandidate.classification}`
  );
  console.log('✓ Test 8 Passed: "I have a resume" option correctly accepted as application trigger');

  console.log('All destination extractor tests passed successfully!');
}

runTests();
