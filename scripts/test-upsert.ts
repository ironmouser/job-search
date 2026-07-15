const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function test() {
    try {
        const prefs = await prisma.userPreferences.upsert({
            where: { userId: 'cmrkztpok0000pwmgabs4zj8w' }, // using the id from previous error
            update: {
                searchKeyword: 'Senior Product Manager',
                searchLocation: 'Remote',
                remoteOnly: true,
                customCareerPages: ['https://boards.greenhouse.io/anthropic'],
                sources: { indeed: true },
                profile: 'I am a PM',
                resumeMarkdown: ''
            },
            create: {
                userId: 'cmrkztpok0000pwmgabs4zj8w',
                searchKeyword: 'Senior Product Manager',
                searchLocation: 'Remote',
                remoteOnly: true,
                customCareerPages: ['https://boards.greenhouse.io/anthropic'],
                sources: { indeed: true },
                profile: 'I am a PM',
                resumeMarkdown: ''
            }
        });
        console.log("Success", prefs);
    } catch(e) {
        console.error("Prisma error:", e);
    } finally {
        await prisma.$disconnect();
    }
}
test();
