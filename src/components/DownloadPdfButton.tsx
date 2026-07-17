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
                    h1 { font-size: 24pt; font-weight: bold; margin-bottom: 5px; margin-top: 0; }
                    h2 { font-size: 14pt; font-weight: bold; margin-top: 20px; margin-bottom: 20px; }
                    h3 { font-size: 14pt; font-weight: bold; margin-top: 25px; margin-bottom: 15px; border-bottom: 1px solid #ccc; padding-bottom: 5px; }
                    p { margin: 8px 0; }
                    ul { margin-top: 5px; margin-bottom: 15px; padding-left: 20px; }
                    li { margin-bottom: 4px; }
                    strong { font-weight: bold; }
                </style>
                ${await marked.parse(markdownText || '')}
            </div>
            `;

            const opt = {
                margin:       0,
                filename:     filename,
                image:        { type: 'jpeg' as const, quality: 0.98 },
                html2canvas:  { scale: 2 },
                jsPDF:        { unit: 'in' as const, format: 'letter', orientation: 'portrait' as const }
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
