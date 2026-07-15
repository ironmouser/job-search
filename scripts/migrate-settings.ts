const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const fs = require('fs');
const path = require('path');

async function main() {
    const email = 'kurt.charles@gmail.com';
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
        console.error("User not found");
        return;
    }

    const settingsPath = path.resolve(process.cwd(), 'src/lib/settings.json');
    const resumePath = path.resolve(process.cwd(), 'src/lib/base_resume.md');
    
    let resumeMarkdown = null;
    if (fs.existsSync(resumePath)) {
        resumeMarkdown = fs.readFileSync(resumePath, 'utf8');
    }

    let searchKeyword = null;
    let searchLocation = null;
    let customCareerPages = [];
    let sources = {};
    let remoteOnly = false;
    let profile = null;
    let theme = 'dark';
    let aiStrictness = 'Standard';
    let resumeCustomizationMaxPercentage = 50;

    if (fs.existsSync(settingsPath)) {
        const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
        searchKeyword = settings.searchKeyword;
        searchLocation = settings.searchLocation;
        customCareerPages = settings.customCareerPages || [];
        sources = settings.sources || {};
        remoteOnly = settings.remoteOnly || false;
        profile = settings.profile || null;
        theme = settings.theme || 'dark';
        aiStrictness = settings.aiStrictness || 'Standard';
        resumeCustomizationMaxPercentage = settings.resumeCustomizationMaxPercentage || 50;
    }

    await prisma.userPreferences.update({
        where: { userId: user.id },
        data: {
            searchKeyword,
            searchLocation,
            customCareerPages,
            sources,
            resumeMarkdown,
            remoteOnly,
            profile,
            theme,
            aiStrictness,
            resumeCustomizationMaxPercentage
        }
    });

    console.log("Settings migrated successfully!");
}

main().finally(() => prisma.$disconnect());
