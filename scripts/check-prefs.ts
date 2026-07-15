const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function test() {
    try {
        const prefs = await prisma.userPreferences.findUnique({
            where: { userId: 'cmrkztpok0000pwmgabs4zj8w' } // Assuming this is the only user ID based on previous logs
        });
        console.log(prefs);
    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}
test();
