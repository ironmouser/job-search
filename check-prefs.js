const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
    const prefs = await prisma.userPreferences.findFirst({
        where: { userId: 'cmrnyibv50000qt1dkhtsy55s' }
    });
    console.log("Remote Only:", prefs?.remoteOnly);
    console.log("Sources:", prefs?.sources);
}
main().catch(console.error).finally(() => prisma.$disconnect());
