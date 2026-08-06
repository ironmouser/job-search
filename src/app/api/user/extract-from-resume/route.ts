import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

/**
 * POST /api/user/extract-from-resume
 *
 * Extracts candidate contact information (Name, Email, Phone, Location, LinkedIn, GitHub, Portfolio)
 * from the user's saved resume markdown.
 */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const prefs = await prisma.userPreferences.findUnique({
      where: { userId: session.user.id },
      select: { resumeMarkdown: true },
    });

    const resume = prefs?.resumeMarkdown?.trim();
    if (!resume) {
      return NextResponse.json(
        { error: 'No saved resume found. Please upload or paste a resume first.' },
        { status: 400 }
      );
    }

    // 1. Name: Heading `# Full Name` or top line
    let name = '';
    const nameMatch = resume.match(/^#\s+([^\n]+)/m);
    if (nameMatch) {
      name = nameMatch[1].replace(/[*_#]/g, '').trim();
    } else {
      const firstLine = resume.split('\n')[0]?.replace(/[*_#]/g, '').trim();
      if (firstLine && firstLine.length < 50 && !firstLine.includes('@')) {
        name = firstLine;
      }
    }

    // 2. Email
    let email = '';
    const emailMatch = resume.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    if (emailMatch) {
      email = emailMatch[0].trim();
    }

    // 3. Phone
    let phone = '';
    const phoneMatch = resume.match(/(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/);
    if (phoneMatch) {
      phone = phoneMatch[0].trim();
    }

    // 4. Location & Address
    let location = '';
    let streetAddress = '';
    let city = '';
    let state = '';
    let postalCode = '';

    // Match City, State ZIP (e.g., "San Francisco, CA 94105" or "New York, NY")
    const cityStateZipMatch = resume.match(/\b([A-Z][a-zA-Z\s]+),\s*([A-Z]{2})(?:\s+(\d{5}(?:-\d{4})?))?\b/);
    if (cityStateZipMatch) {
      city = cityStateZipMatch[1].trim();
      state = cityStateZipMatch[2].trim();
      if (cityStateZipMatch[3]) {
        postalCode = cityStateZipMatch[3].trim();
      }
      location = `${city}, ${state}`;
    }

    // Match Street Address line
    const streetMatch = resume.match(/\b(\d{1,5}\s+[A-Za-z0-9\s.,#-]+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Court|Ct|Way|Place|Pl|Suite|Ste|Apt)\b[^\n,]*)/i);
    if (streetMatch) {
      streetAddress = streetMatch[1].trim();
    }

    // 5. LinkedIn URL
    let linkedinUrl = '';
    const linkedinMatch = resume.match(/(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/[a-zA-Z0-9_-]+\/?/i);
    if (linkedinMatch) {
      linkedinUrl = linkedinMatch[0].startsWith('http')
        ? linkedinMatch[0]
        : `https://${linkedinMatch[0]}`;
    }

    // 6. GitHub URL
    let githubUrl = '';
    const githubMatch = resume.match(/(?:https?:\/\/)?(?:www\.)?github\.com\/[a-zA-Z0-9_-]+\/?/i);
    if (githubMatch) {
      githubUrl = githubMatch[0].startsWith('http')
        ? githubMatch[0]
        : `https://${githubMatch[0]}`;
    }

    // 7. Personal Portfolio / Website URL
    let websiteUrl = '';
    const urls = resume.match(/https?:\/\/[^\s()<>]+\.[^\s()<]+/gi) || [];
    for (const url of urls) {
      if (!url.includes('linkedin.com') && !url.includes('github.com')) {
        websiteUrl = url;
        break;
      }
    }

    return NextResponse.json({
      name,
      email,
      phone,
      location,
      streetAddress,
      city,
      state,
      postalCode,
      linkedinUrl,
      githubUrl,
      websiteUrl,
      success: true,
    });
  } catch (error: any) {
    console.error('[extract-from-resume] Error:', error);
    return NextResponse.json({ error: 'Failed to extract resume data' }, { status: 500 });
  }
}
