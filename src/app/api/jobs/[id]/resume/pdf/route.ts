import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { marked } from 'marked';
import { chromium } from 'playwright';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return new NextResponse('Unauthorized', { status: 401 });
        }
        const userId = session.user.id;

        const { id } = await params;

        // Fetch the tailored resume markdown
        const assets = await prisma.applicationAsset.findFirst({
            where: { jobId: id, userId: userId },
            select: { tailoredResumeMarkdown: true }
        });

        if (!assets || !assets.tailoredResumeMarkdown) {
            return new NextResponse('Resume not found', { status: 404 });
        }

        // Convert markdown to HTML
        const htmlContent = marked.parse(assets.tailoredResumeMarkdown) as string;

        // Wrap in styled HTML
        const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <style>
                body {
                    font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
                    line-height: 1.5;
                    color: #000;
                    margin: 0;
                    padding: 40px;
                    font-size: 11pt;
                }
                h1 {
                    font-size: 24pt;
                    font-weight: bold;
                    margin-bottom: 5px;
                    margin-top: 0;
                }
                h2 {
                    font-size: 14pt;
                    font-weight: bold;
                    margin-top: 20px;
                    margin-bottom: 20px;
                }
                h3 {
                    font-size: 14pt;
                    font-weight: bold;
                    margin-top: 25px;
                    margin-bottom: 15px;
                    border-bottom: 1px solid #ccc;
                    padding-bottom: 5px;
                }
                p {
                    margin: 8px 0;
                }
                ul {
                    margin-top: 5px;
                    margin-bottom: 15px;
                    padding-left: 20px;
                }
                li {
                    margin-bottom: 4px;
                }
                strong {
                    font-weight: bold;
                }
                /* Print optimizations */
                @page {
                    margin: 20px;
                    size: letter;
                }
            </style>
        </head>
        <body>
            ${htmlContent}
        </body>
        </html>
        `;

        // Launch playwright to generate PDF
        const browser = await chromium.launch({ headless: true });
        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: 'networkidle' });
        
        const pdfBuffer = await page.pdf({
            format: 'Letter',
            printBackground: true,
            margin: { top: '20px', bottom: '20px', left: '20px', right: '20px' }
        });

        await browser.close();

        // Return PDF
        return new NextResponse(pdfBuffer as any, {
            status: 200,
            headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': 'attachment; filename="Kurt_Charles_Resume.pdf"'
            }
        });

    } catch (e: any) {
        console.error('PDF Generation Error:', e);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}
