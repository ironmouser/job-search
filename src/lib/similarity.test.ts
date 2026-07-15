// Test script for calculateResumeSimilarity
// Run with: npx tsx src/lib/similarity.test.ts

import { calculateResumeSimilarity } from './similarity';

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

// --- Edge Cases ---
console.log('\n📋 Edge Cases');
assert('Both null returns 0', calculateResumeSimilarity(null, null) === 0);
assert('Both empty returns 0', calculateResumeSimilarity('', '') === 0);
assert('One null returns 0', calculateResumeSimilarity('hello world', null) === 0);
assert('One empty returns 0', calculateResumeSimilarity('hello world', '') === 0);

// --- Identical Resumes ---
console.log('\n📋 Identical Resumes (same person, different account)');
const resume = 'Senior software engineer at Google with 10 years Python JavaScript TypeScript React Node.js experience';
const similarityIdentical = calculateResumeSimilarity(resume, resume);
assert('Identical = 1.0', similarityIdentical === 1.0, `Got ${similarityIdentical}`);
assert('Identical > 0.8 (should be blocked)', similarityIdentical > 0.8);

// --- Very Similar Resumes (minor edits) ---
console.log('\n📋 Very Similar Resumes (minor edit, abuser tweaking slightly)');
const resumeA = 'Experienced software engineer with skills in Python JavaScript TypeScript React Node.js databases';
const resumeB = 'Experienced software engineer with skills in Python JavaScript TypeScript React Node.js databases AWS cloud';
const similarityClose = calculateResumeSimilarity(resumeA, resumeB);
console.log(`    Similarity: ${(similarityClose * 100).toFixed(1)}%`);
assert('Very similar > 0.8 (should be pooled)', similarityClose > 0.8, `Got ${similarityClose.toFixed(3)}`);

// --- Clearly Different Resumes (roommates) ---
console.log('\n📋 Clearly Different Resumes (roommates)');
const roommate1 = 'Software engineer Python JavaScript React TypeScript databases cloud infrastructure DevOps Kubernetes';
const roommate2 = 'Marketing manager brand strategy social media content creation campaign management analytics SEO copywriting';
const similarityDiff = calculateResumeSimilarity(roommate1, roommate2);
console.log(`    Similarity: ${(similarityDiff * 100).toFixed(1)}%`);
assert('Different resumes < 0.2 (should NOT be pooled)', similarityDiff < 0.2, `Got ${similarityDiff.toFixed(3)}`);
assert('Different resumes NOT > 0.8', !(similarityDiff > 0.8));

// --- Moderate Similarity (students in same program) ---
console.log('\n📋 Moderate Similarity (students in same CS program, different people)');
const student1 = 'Computer science student proficient in Java Python data structures algorithms machine learning internship at startup';
const student2 = 'Computer science graduate skilled in Java Python algorithms software development internship experience research paper';
const similarityStudents = calculateResumeSimilarity(student1, student2);
console.log(`    Similarity: ${(similarityStudents * 100).toFixed(1)}%`);
assert('CS students < 0.8 (should NOT be pooled)', similarityStudents < 0.8, `Got ${similarityStudents.toFixed(3)}`);

// --- Summary ---
console.log(`\n${'─'.repeat(40)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
