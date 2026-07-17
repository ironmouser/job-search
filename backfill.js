const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const prefs = await prisma.userPreferences.findMany();
    for (const pref of prefs) {
        let sources = typeof pref.sources === 'string' ? JSON.parse(pref.sources) : (pref.sources || {});
        sources.remotepoc = true;
        sources.kforce = true;
        await prisma.userPreferences.update({
            where: { id: pref.id },
            data: { sources }
        });
    }
    console.log(`Updated ${prefs.length} users.`);
}
main().catch(console.error).finally(() => prisma.$disconnect());
