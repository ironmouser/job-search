import { UserSearchCriteria } from './criteria';
import { computeSearchCriteriaSimilarity } from './searchSimilarity';

export interface SearchGroup {
  id: string;
  canonicalKeyword: string;
  canonicalLocation: string;
  remoteOnly: boolean;
  noInternational: boolean;
  mergedSources: Record<string, boolean>;
  mergedCustomCareerPages: string[];
  members: UserSearchCriteria[];
}

export const SIMILARITY_THRESHOLD = 60; // 60% minimum criteria overlap

/**
 * Clusters users into search groups where all members share >= 60% criteria similarity.
 */
export function clusterUsersIntoSearchGroups(
  users: UserSearchCriteria[],
  threshold: number = SIMILARITY_THRESHOLD
): SearchGroup[] {
  if (!users || users.length === 0) return [];

  const groups: SearchGroup[] = [];

  for (const user of users) {
    let bestGroup: SearchGroup | null = null;
    let highestSim = 0;

    for (const group of groups) {
      // Compare user criteria to group's representative criteria
      const representative = group.members[0];
      const sim = computeSearchCriteriaSimilarity(user, representative);

      if (sim >= threshold && sim > highestSim) {
        highestSim = sim;
        bestGroup = group;
      }
    }

    if (bestGroup) {
      bestGroup.members.push(user);
    } else {
      // Start a new group
      const newGroup: SearchGroup = {
        id: `group-${groups.length + 1}`,
        canonicalKeyword: user.searchKeyword,
        canonicalLocation: user.searchLocation,
        remoteOnly: user.remoteOnly,
        noInternational: user.noInternational,
        mergedSources: { ...user.sources },
        mergedCustomCareerPages: [...user.customCareerPages],
        members: [user],
      };
      groups.push(newGroup);
    }
  }

  // Refine each group: pick the member with the highest central similarity as canonical
  for (const group of groups) {
    if (group.members.length > 1) {
      let bestMember = group.members[0];
      let bestAvgSim = -1;

      for (const m of group.members) {
        let sum = 0;
        for (const other of group.members) {
          sum += computeSearchCriteriaSimilarity(m, other);
        }
        const avg = sum / group.members.length;
        if (avg > bestAvgSim) {
          bestAvgSim = avg;
          bestMember = m;
        }
      }

      group.canonicalKeyword = bestMember.searchKeyword;
      group.canonicalLocation = bestMember.searchLocation;
      group.remoteOnly = group.members.some(m => m.remoteOnly);
      group.noInternational = group.members.every(m => m.noInternational);
    }

    // Merge sources: enable a source if any member has it enabled
    const mergedSources: Record<string, boolean> = {};
    const mergedCustomPages = new Set<string>();

    for (const m of group.members) {
      for (const [src, enabled] of Object.entries(m.sources)) {
        if (enabled) {
          mergedSources[src] = true;
        }
      }
      for (const page of m.customCareerPages) {
        if (page && page.trim()) {
          mergedCustomPages.add(page.trim());
        }
      }
    }

    group.mergedSources = mergedSources;
    group.mergedCustomCareerPages = Array.from(mergedCustomPages);
  }

  return groups;
}
