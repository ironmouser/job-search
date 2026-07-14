import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { marked } from 'marked';
import { chromium } from 'playwright';

export async function GET(request: Request, { params }: { params: { id: string } }) {
    try {
        const { id } = params;

        // Fetch the tailored resume markdown
        const { data: assets, error } = await supabase
            .from('application_assets')
            .select('tailored_resume_markdown')
            .eq('job_id', id)
            .single();

        if (error || !assets || !assets.tailored_resume_markdown) {
            return new NextResponse('Resume not found', { status: 404 });
        }

        // Convert markdown to HTML
        const htmlContent = marked.parse(assets.tailored_resume_markdown) as string;

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
        return new NextResponse(pdfBuffer, {
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
