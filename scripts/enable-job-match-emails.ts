import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface RunOptions {
  setBlankLocationToUnitedStates?: boolean;
  dryRun?: boolean;
}

export async function updateUsersForJobMatchEmails(options: RunOptions = { dryRun: true }) {
  const users = await prisma.user.findMany({
    where: {
      isDisabled: false,
      userPreferences: { isNot: null },
    },
    include: {
      userPreferences: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  const toUpdateWithExistingLocation: Array<{
    userId: string;
    email: string | null;
    searchKeyword: string;
    searchLocation: string;
    prefId: string;
  }> = [];

  const toUpdateWithDefaultUnitedStates: Array<{
    userId: string;
    email: string | null;
    searchKeyword: string;
    prefId: string;
  }> = [];

  for (const u of users) {
    const pref = u.userPreferences;
    if (!pref) continue;
    if (pref.jobMatchEmailsEnabled) continue; // Already enabled

    const role = (pref.searchKeyword || '').trim();
    if (!role) continue; // Missing role/title

    const explicitLoc = (pref.searchLocation || pref.location || pref.city || (pref.remoteOnly ? 'Remote' : '') || '').trim();

    if (explicitLoc) {
      toUpdateWithExistingLocation.push({
        userId: u.id,
        email: u.email,
        searchKeyword: role,
        searchLocation: explicitLoc,
        prefId: pref.id,
      });
    } else if (options.setBlankLocationToUnitedStates) {
      toUpdateWithDefaultUnitedStates.push({
        userId: u.id,
        email: u.email,
        searchKeyword: role,
        prefId: pref.id,
      });
    }
  }

  const totalToUpdate = toUpdateWithExistingLocation.length + toUpdateWithDefaultUnitedStates.length;
  console.log(`\n--- UPDATE SUMMARY ---`);
  console.log(`Users with existing location to enable: ${toUpdateWithExistingLocation.length}`);
  console.log(`Users with blank location to set "United States" & enable: ${toUpdateWithDefaultUnitedStates.length}`);
  console.log(`Total users to be updated: ${totalToUpdate}`);

  if (options.dryRun) {
    console.log('\n[DRY RUN] No database changes were applied. Run with --commit to apply changes.');
    return { toUpdateWithExistingLocation, toUpdateWithDefaultUnitedStates };
  }

  const now = new Date();

  // 1. Update users who already had an explicit location
  let countExisting = 0;
  if (toUpdateWithExistingLocation.length > 0) {
    const res1 = await prisma.userPreferences.updateMany({
      where: {
        id: { in: toUpdateWithExistingLocation.map(c => c.prefId) },
      },
      data: {
        jobMatchEmailsEnabled: true,
        jobMatchEmailsOptedInAt: now,
      },
    });
    countExisting = res1.count;
  }

  // 2. Update users who had blank location: set searchLocation to "United States" and enable
  let countBlank = 0;
  if (toUpdateWithDefaultUnitedStates.length > 0) {
    const res2 = await prisma.userPreferences.updateMany({
      where: {
        id: { in: toUpdateWithDefaultUnitedStates.map(c => c.prefId) },
      },
      data: {
        searchLocation: 'United States',
        jobMatchEmailsEnabled: true,
        jobMatchEmailsOptedInAt: now,
      },
    });
    countBlank = res2.count;
  }

  console.log(`\n[SUCCESS] Applied updates to Railway PostgreSQL:`);
  console.log(`- Updated ${countExisting} users with existing locations`);
  console.log(`- Updated ${countBlank} users with searchLocation = "United States"`);
  console.log(`- Total records updated: ${countExisting + countBlank}`);

  return { toUpdateWithExistingLocation, toUpdateWithDefaultUnitedStates };
}

if (require.main === module) {
  const isCommit = process.argv.includes('--commit');
  const setBlank = process.argv.includes('--set-blank-us');
  updateUsersForJobMatchEmails({
    dryRun: !isCommit,
    setBlankLocationToUnitedStates: setBlank,
  })
    .catch(console.error)
    .finally(() => prisma.$disconnect());
}
