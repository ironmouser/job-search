import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  computeSearchCriteriaSimilarity,
  computeLocationSimilarity,
  computeLevelSimilarity,
} from '../src/lib/jobMatch/searchSimilarity';
import { clusterUsersIntoSearchGroups, SIMILARITY_THRESHOLD } from '../src/lib/jobMatch/grouping';
import { evaluateJobRelevance, MATCH_THRESHOLD } from '../src/lib/jobMatch/jobRelevance';
import { signUnsubscribeToken, verifyUnsubscribeToken } from '../src/lib/jobMatch/unsubscribe';
import { UserSearchCriteria } from '../src/lib/jobMatch/criteria';

describe('Job Match Criteria Similarity', () => {
  const baseUser: UserSearchCriteria = {
    userId: 'user-1',
    email: 'user1@example.com',
    searchKeyword: 'Full Stack Engineer',
    jobLevel: 'Senior-level',
    searchLocation: 'Remote',
    normalizedLocation: 'remote',
    remoteOnly: true,
    noInternational: false,
    includeKeywords: ['react', 'node'],
    excludeKeywords: ['intern'],
    sources: { indeed: true, linkedin: true },
    customCareerPages: [],
    isPro: false,
  };

  it('yields 100% similarity for identical search criteria', () => {
    const score = computeSearchCriteriaSimilarity(baseUser, { ...baseUser, userId: 'user-2' });
    assert.strictEqual(score, 100);
  });

  it('yields >= 60% similarity for closely related engineering roles in Remote', () => {
    const user2: UserSearchCriteria = {
      ...baseUser,
      userId: 'user-2',
      searchKeyword: 'Senior Full Stack Developer',
      jobLevel: 'Senior-level',
      searchLocation: 'Remote',
    };
    const score = computeSearchCriteriaSimilarity(baseUser, user2);
    assert.ok(score >= 60, `Expected score >= 60, got ${score}`);
  });

  it('yields < 60% similarity for completely unrelated professions', () => {
    const nurseUser: UserSearchCriteria = {
      ...baseUser,
      userId: 'user-nurse',
      searchKeyword: 'Registered Nurse',
      jobLevel: 'Mid-level',
      searchLocation: 'Austin, TX',
      normalizedLocation: 'austin tx',
      remoteOnly: false,
    };
    const score = computeSearchCriteriaSimilarity(baseUser, nurseUser);
    assert.ok(score < 60, `Expected score < 60 for Engineer vs Nurse, got ${score}`);
  });
});

describe('Job Match Grouping & Clustering', () => {
  it('groups similar users together into shared search clusters', () => {
    const users: UserSearchCriteria[] = [
      {
        userId: 'u1',
        email: 'u1@example.com',
        searchKeyword: 'Frontend Developer',
        jobLevel: 'Mid-level',
        searchLocation: 'Remote',
        normalizedLocation: 'remote',
        remoteOnly: true,
        noInternational: false,
        includeKeywords: ['react'],
        excludeKeywords: [],
        sources: { indeed: true, linkedin: true },
        customCareerPages: [],
        isPro: false,
      },
      {
        userId: 'u2',
        email: 'u2@example.com',
        searchKeyword: 'Frontend Software Engineer',
        jobLevel: 'Mid-level',
        searchLocation: 'Remote',
        normalizedLocation: 'remote',
        remoteOnly: true,
        noInternational: false,
        includeKeywords: ['vue'],
        excludeKeywords: [],
        sources: { dice: true },
        customCareerPages: [],
        isPro: true,
      },
      {
        userId: 'u3',
        email: 'u3@example.com',
        searchKeyword: 'Chief Financial Officer',
        jobLevel: 'C-Suite (Executive)',
        searchLocation: 'New York, NY',
        normalizedLocation: 'new york ny',
        remoteOnly: false,
        noInternational: false,
        includeKeywords: ['accounting'],
        excludeKeywords: [],
        sources: { indeed: true },
        customCareerPages: [],
        isPro: false,
      },
    ];

    const groups = clusterUsersIntoSearchGroups(users, SIMILARITY_THRESHOLD);

    // Should create 2 distinct groups: one for frontend engineers and one for CFO
    assert.strictEqual(groups.length, 2);

    const devGroup = groups.find(g => g.members.some(m => m.userId === 'u1'));
    assert.ok(devGroup);
    assert.strictEqual(devGroup?.members.length, 2);
    assert.ok(devGroup?.members.some(m => m.userId === 'u2'));

    // Sources should be unioned across group members
    assert.strictEqual(devGroup?.mergedSources.indeed, true);
    assert.strictEqual(devGroup?.mergedSources.linkedin, true);
    assert.strictEqual(devGroup?.mergedSources.dice, true);

    const cfoGroup = groups.find(g => g.members.some(m => m.userId === 'u3'));
    assert.ok(cfoGroup);
    assert.strictEqual(cfoGroup?.members.length, 1);
  });
});

describe('Job Relevance Evaluation (60% Threshold)', () => {
  const user: UserSearchCriteria = {
    userId: 'u-target',
    email: 'target@example.com',
    searchKeyword: 'Senior Product Manager',
    jobLevel: 'Senior-level',
    searchLocation: 'Remote',
    normalizedLocation: 'remote',
    remoteOnly: true,
    noInternational: true,
    includeKeywords: ['saas', 'roadmap'],
    excludeKeywords: ['intern', 'junior'],
    sources: { indeed: true, greenhouse: true },
    customCareerPages: [],
    isPro: true,
  };

  it('approves a highly relevant matching job', () => {
    const job = {
      id: 'job-1',
      title: 'Senior Product Manager - Core Platform',
      company: 'TechCorp',
      location: 'Remote, US',
      description: 'We are seeking an experienced Senior PM to own our SaaS product roadmap.',
      url: 'https://example.com/job/1',
      source: 'greenhouse',
      status: 'active',
    };

    const res = evaluateJobRelevance(job, user, MATCH_THRESHOLD);
    assert.strictEqual(res.isMatch, true);
    assert.ok(res.score >= 60, `Score was ${res.score}`);
  });

  it('rejects a job matching excluded keywords', () => {
    const job = {
      id: 'job-2',
      title: 'Product Manager Intern',
      company: 'StartupX',
      location: 'Remote',
      description: 'Internship role.',
      url: 'https://example.com/job/2',
      source: 'indeed',
      status: 'active',
    };

    const res = evaluateJobRelevance(job, user, MATCH_THRESHOLD);
    assert.strictEqual(res.isMatch, false);
    assert.ok(res.rejectionReason?.includes('excluded keyword'));
  });

  it('rejects a job from a disabled source', () => {
    const job = {
      id: 'job-3',
      title: 'Senior Product Manager',
      company: 'TechCorp',
      location: 'Remote',
      description: 'Own SaaS roadmap.',
      url: 'https://example.com/job/3',
      source: 'linkedin', // disabled in user.sources
      status: 'active',
    };

    const userWithDisabledLinkedin = {
      ...user,
      sources: { indeed: true, greenhouse: true, linkedin: false },
    };

    const res = evaluateJobRelevance(job, userWithDisabledLinkedin, MATCH_THRESHOLD);
    assert.strictEqual(res.isMatch, false);
    assert.ok(res.rejectionReason?.includes('disabled by user'));
  });

  it('rejects an on-site job when user requires remoteOnly', () => {
    const job = {
      id: 'job-4',
      title: 'Senior Product Manager',
      company: 'TechCorp',
      location: 'New York, NY (On-site 5 days a week)',
      description: 'Own SaaS roadmap.',
      url: 'https://example.com/job/4',
      source: 'greenhouse',
      status: 'active',
    };

    const res = evaluateJobRelevance(job, user, MATCH_THRESHOLD);
    assert.strictEqual(res.isMatch, false);
    assert.ok(res.rejectionReason?.includes('requires remote'));
  });
});

describe('Unsubscribe Token HMAC Security', () => {
  it('signs and verifies valid unsubscribe tokens', () => {
    const userId = 'user-abc-123';
    const token = signUnsubscribeToken(userId);
    const verifiedUserId = verifyUnsubscribeToken(token);

    assert.strictEqual(verifiedUserId, userId);
  });

  it('rejects tampered tokens', () => {
    const userId = 'user-abc-123';
    const token = signUnsubscribeToken(userId);
    const tampered = token.slice(0, -4) + 'abcd';
    const result = verifyUnsubscribeToken(tampered);

    assert.strictEqual(result, null);
  });
});
