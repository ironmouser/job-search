// Test script for expandSearchKeywords and getCoreKeyword
// Run with: npx tsx src/lib/keywordExpansion.test.ts

import { expandSearchKeywords, getCoreKeyword, splitTargetRoles, CANONICAL_TITLE_LIST, inferSkillsFromTitle } from './keywordExpansion';

let passed = 0;
let failed = 0;

function assert(label: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`  ✅ PASS: ${label}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${label}${detail ? ` — ${detail}` : ''}`);
    failed++;
  }
}

async function runTests() {
  console.log('\n📋 Test Keyword Expansion');

  const accountMgr = expandSearchKeywords('Senior Account Manager');
  console.log('Senior Account Manager ->', accountMgr);
  assert('Includes exact search term first', accountMgr[0] === 'Senior Account Manager');
  assert('Includes core keyword', accountMgr.includes('Account Manager'));
  assert('Includes Account Executive synonym', accountMgr.includes('Account Executive'));
  assert('Includes Client Success Manager synonym', accountMgr.includes('Client Success Manager'));

  const multiExp = expandSearchKeywords('Administrative Assistant, quality control, medical, coding, billing');
  console.log('Multi-role comma-separated expansion ->', multiExp);
  assert('Multi-role expansion contains Administrative Assistant', multiExp.includes('Administrative Assistant'));
  assert('Multi-role expansion contains quality control', multiExp.includes('quality control'));
  assert('Multi-role expansion contains medical', multiExp.includes('medical'));
  assert('Multi-role expansion contains coding', multiExp.includes('coding'));
  assert('Multi-role expansion contains billing', multiExp.includes('billing'));

  console.log('\n📋 Test splitTargetRoles');
  const splitRoles = splitTargetRoles('Administrative Assistant, quality control, medical, coding, billing');
  assert('splitTargetRoles splits 5 roles correctly', splitRoles.length === 5 && splitRoles[0] === 'Administrative Assistant' && splitRoles[4] === 'billing');
  const singleRole = splitTargetRoles('Product Manager');
  assert('splitTargetRoles handles single role', singleRole.length === 1 && singleRole[0] === 'Product Manager');
  const emptySplit = splitTargetRoles('');
  assert('splitTargetRoles handles empty string', emptySplit.length === 0);

  const rn = expandSearchKeywords('RN');
  console.log('RN ->', rn);
  assert('RN includes exact term', rn[0] === 'RN');
  assert('RN includes Registered Nurse', rn.includes('Registered Nurse'));

  const se = expandSearchKeywords('Lead Software Engineer');
  console.log('Lead Software Engineer ->', se);
  assert('Includes Software Engineer', se.includes('Software Engineer'));
  assert('Includes Software Developer', se.includes('Software Developer'));

  const noMatch = expandSearchKeywords('Custom Unlisted Specialty Job');
  console.log('Custom Unlisted Specialty Job ->', noMatch);
  assert('Returns original query when unlisted', noMatch.length === 1 && noMatch[0] === 'Custom Unlisted SpecialtyJob'.replace('SpecialtyJob', 'Specialty Job'));

  const empty = expandSearchKeywords('');
  assert('Empty string returns empty array', empty.length === 0);

  console.log('\n📋 Test getCoreKeyword');
  assert('Strips Senior prefix', getCoreKeyword('Senior Product Manager') === 'product manager');
  assert('Strips Lead prefix', getCoreKeyword('Lead Data Scientist') === 'data scientist');
  assert('Strips Jr. prefix', getCoreKeyword('Jr. Full Stack Developer') === 'full stack developer');
  assert('Handles non-prefixed role', getCoreKeyword('Accountant') === 'accountant');

  console.log('\n📋 Test CANONICAL_TITLE_LIST');
  assert('Canonical titles list is populated', Array.isArray(CANONICAL_TITLE_LIST) && CANONICAL_TITLE_LIST.length > 50);
  assert('Canonical titles list includes Product Manager', CANONICAL_TITLE_LIST.includes('Product Manager'));
  assert('Canonical titles list includes Software Engineer', CANONICAL_TITLE_LIST.includes('Software Engineer'));
  assert('Canonical titles list includes Account Manager', CANONICAL_TITLE_LIST.includes('Account Manager'));

  console.log('\n📋 Test inferSkillsFromTitle');
  const emptySkills = await inferSkillsFromTitle('');
  assert('Empty title returns empty skills array', Array.isArray(emptySkills) && emptySkills.length === 0);

  console.log(`\n${'─'.repeat(40)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

runTests().catch(err => {
  console.error('Test run failed:', err);
  process.exit(1);
});
