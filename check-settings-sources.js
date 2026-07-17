const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
    const settings = await prisma.userPreferences.findFirst({
        orderBy: { createdAt: 'desc' }
    });
    console.log("Sources:", settings.sources);
    console.log("RemoteOnly:", settings.remoteOnly);
}
main().catch(console.error).finally(() => prisma.$disconnect());
