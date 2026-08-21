// Test script for computeRoleMatchScore
// Run with: npx tsx src/lib/roleMatcher.test.ts

import { computeRoleMatchScore } from './roleMatcher';

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

const target = 'Senior Product Manager';

console.log('\n📋 Exact & Phrase Matches');
const exactScore = computeRoleMatchScore('Senior Product Manager', target);
assert('Exact match returns 1000', exactScore === 1000, `Got ${exactScore}`);

const caseScore = computeRoleMatchScore('senior product manager', target);
assert('Case-insensitive exact match returns 1000', caseScore === 1000, `Got ${caseScore}`);

const phraseScore = computeRoleMatchScore('Senior Product Manager - Growth', target);
assert('Phrase containment returns 900', phraseScore === 900, `Got ${phraseScore}`);

console.log('\n📋 Core Alignment vs Seniority-Only Match');
const pmScore = computeRoleMatchScore('Product Manager', target);
const leadPmScore = computeRoleMatchScore('Lead Product Manager', target);
const accountantScore = computeRoleMatchScore('Senior Accountant', target);
const engineerScore = computeRoleMatchScore('Software Engineer', target);

console.log(`  Product Manager: ${pmScore}`);
console.log(`  Lead Product Manager: ${leadPmScore}`);
console.log(`  Senior Accountant: ${accountantScore}`);
console.log(`  Software Engineer: ${engineerScore}`);

assert('Product Manager has strong core score (> 600)', pmScore > 600, `Got ${pmScore}`);
assert('Lead Product Manager has strong score (> 600)', leadPmScore > 600, `Got ${leadPmScore}`);
assert('Senior Accountant (seniority only match) gets capped low (< 100)', accountantScore < 100, `Got ${accountantScore}`);
assert('Software Engineer has 0 score', engineerScore === 0, `Got ${engineerScore}`);
assert('Core PM matches rank significantly higher than Senior Accountant', pmScore > accountantScore);

console.log('\n📋 Edge Cases');
assert('Null title returns 0', computeRoleMatchScore(null, target) === 0);
assert('Empty title returns 0', computeRoleMatchScore('', target) === 0);
assert('Null target returns 0', computeRoleMatchScore('Product Manager', null) === 0);
assert('Empty target returns 0', computeRoleMatchScore('Product Manager', '') === 0);

console.log('\n📋 Description Fallback');
const descScore = computeRoleMatchScore('Team Member', target, 'We are looking for a Senior Product Manager to lead our growth strategy.');
console.log(`  Description match score: ${descScore}`);
assert('Description match fallback is > 0', descScore > 0, `Got ${descScore}`);

console.log('\n📋 Multi-Role Comma-Separated Matches');
const multiTarget = 'Administrative Assistant, quality control, medical, coding, billing';
const adminScore = computeRoleMatchScore('Administrative Assistant', multiTarget);
const qcScore = computeRoleMatchScore('Quality Control Inspector', multiTarget);
const codingScore = computeRoleMatchScore('Medical Billing and Coding Specialist', multiTarget);
const unrelatedScore = computeRoleMatchScore('Dentist', multiTarget);

console.log(`  Administrative Assistant: ${adminScore}`);
console.log(`  Quality Control Inspector: ${qcScore}`);
console.log(`  Medical Billing and Coding Specialist: ${codingScore}`);
console.log(`  Dentist: ${unrelatedScore}`);

assert('Administrative Assistant matches perfectly (1000)', adminScore === 1000, `Got ${adminScore}`);
assert('Quality Control matches strongly (> 700)', qcScore > 700, `Got ${qcScore}`);
assert('Medical Billing and Coding matches strongly (> 700)', codingScore > 700, `Got ${codingScore}`);
assert('Unrelated Dentist scores 0', unrelatedScore === 0, `Got ${unrelatedScore}`);

console.log(`\n${'─'.repeat(40)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
