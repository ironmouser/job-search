"use client";

import { useState } from 'react';
import { Download, CheckCircle, Loader2 } from 'lucide-react';

export default function DownloadPdfButton({ markdownText, filename, label = "Download", html }: { markdownText?: string, filename: string, label?: string, html?: string }) {
    const [isDownloading, setIsDownloading] = useState(false);
    const [isDownloaded, setIsDownloaded] = useState(false);

    const handleDownload = async () => {
        setIsDownloading(true);
        try {
            const { marked } = await import('marked');
            const html2pdf = (await import('html2pdf.js')).default;

            const htmlContent = html || `
            <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; line-height: 1.5; color: #000; padding: 40px; font-size: 11pt;">
                <style>
                    h1 { font-size: 24pt; font-weight: bold; margin-bottom: 5px; margin-top: 0; border-bottom: none !important; page-break-inside: avoid; break-inside: avoid; }
                    h2 { font-size: 14pt; font-weight: bold; margin-top: 20px; margin-bottom: 20px; border-bottom: none !important; page-break-inside: avoid; break-inside: avoid; }
                    h3 { font-size: 14pt; font-weight: bold; margin-top: 25px; margin-bottom: 15px; border-bottom: none !important; padding-bottom: 0; page-break-inside: avoid; break-inside: avoid; }
                    h4, h5, h6 { border-bottom: none !important; page-break-inside: avoid; break-inside: avoid; }
                    p { margin: 8px 0; page-break-inside: avoid; break-inside: avoid; }
                    ul { margin-top: 5px; margin-bottom: 15px; padding-left: 20px; }
                    li { margin-bottom: 4px; page-break-inside: avoid; break-inside: avoid; }
                    strong { font-weight: bold; }
                </style>
                ${await marked.parse(markdownText || '')}
            </div>
            `;

            const opt: any = {
                margin:       [0.5, 0, 0.5, 0],
                filename:     filename,
                image:        { type: 'jpeg', quality: 0.98 },
                html2canvas:  { scale: 2 },
                jsPDF:        { unit: 'in', format: 'letter', orientation: 'portrait' },
                pagebreak:    { mode: ['avoid-all', 'css', 'legacy'] }
            };

            await html2pdf().set(opt).from(htmlContent).save();
            
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
