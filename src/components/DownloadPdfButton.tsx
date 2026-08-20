"use client";

import { useState } from 'react';
import { Download, CheckCircle, Loader2 } from 'lucide-react';
import { generateStyledPdfHtml, PdfStyleOptions } from '@/lib/pdfGeneratorHelper';

interface DownloadPdfButtonProps {
    markdownText?: string;
    filename: string;
    label?: string;
    html?: string;
    type?: 'resume' | 'coverLetter';
    jobId?: string;
    styleOptions?: PdfStyleOptions;
}

export default function DownloadPdfButton({ markdownText, filename, label = "Download", html, type = 'resume', jobId, styleOptions }: DownloadPdfButtonProps) {
    const [isDownloading, setIsDownloading] = useState(false);
    const [isDownloaded, setIsDownloaded] = useState(false);

    const handleDownload = async () => {
        setIsDownloading(true);
        try {
            const html2pdf = (await import('html2pdf.js')).default;
            let finalHtml = html;

            if (!finalHtml) {
                let options = styleOptions;

                if (!options) {
                    try {
                        const res = await fetch('/api/settings');
                        const settings = await res.json();
                        const prefix = type === 'coverLetter' ? 'coverLetterPdf' : 'resumePdf';
                        options = {
                            template: settings[`${prefix}Template`],
                            fontFamily: settings[`${prefix}FontFamily`],
                            fontSize: settings[`${prefix}FontSize`],
                            lineHeight: settings[`${prefix}LineHeight`],
                            primaryColor: settings[`${prefix}PrimaryColor`],
                            textColor: settings[`${prefix}TextColor`],
                            margin: settings[`${prefix}Margin`],
                            headerLayout: settings[`${prefix}HeaderLayout`],
                        };
                    } catch (e) {
                        console.warn('Could not fetch user PDF settings, using defaults');
                    }
                }

                finalHtml = generateStyledPdfHtml(markdownText || '', options);
            }

            const opt: any = {
                margin:       [0.4, 0, 0.4, 0],
                filename:     filename,
                image:        { type: 'jpeg', quality: 0.98 },
                html2canvas:  { scale: 2, useCORS: true },
                jsPDF:        { unit: 'in', format: 'letter', orientation: 'portrait' },
                pagebreak:    { mode: ['avoid-all', 'css', 'legacy'] }
            };

            await html2pdf().set(opt).from(finalHtml).save();
            
            // Track download asynchronously
            fetch('/api/analytics/track-download', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type, jobId }),
            }).catch((err) => console.warn('Could not record download tracking:', err));

            setIsDownloaded(true);
            setTimeout(() => setIsDownloaded(false), 2000);
        } catch (err: any) {
            console.error('Failed to download PDF:', err);
            alert(`Failed to download PDF: ${err.message}`);
        } finally {
            setIsDownloading(false);
        }
    };

    return (
        <button 
            onClick={handleDownload}
            disabled={isDownloading}
            className="btn-outline" 
            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', padding: '0.4rem 0.8rem' }}
        >
            {isDownloading ? (
                <Loader2 size={14} className="animate-spin" />
            ) : isDownloaded ? (
                <CheckCircle size={14} color="var(--success)" />
            ) : (
                <Download size={14} />
            )}
            <span>{isDownloading ? 'Generating...' : isDownloaded ? 'Downloaded!' : label}</span>
        </button>
    );
}

