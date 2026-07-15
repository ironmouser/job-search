"use client";

import { useState } from 'react';
import { Download, Copy, CheckCircle } from 'lucide-react';

export default function ResumeActions({ jobId, markdownText }: { jobId: string, markdownText: string }) {
    const [isCopied, setIsCopied] = useState(false);
    const [isDownloading, setIsDownloading] = useState(false);

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(markdownText);
            setIsCopied(true);
            setTimeout(() => setIsCopied(false), 3000);
        } catch (err) {
            console.error('Failed to copy text:', err);
        }
    };

    const handleDownload = async () => {
        setIsDownloading(true);
        try {
            const { marked } = await import('marked');
            const html2pdf = (await import('html2pdf.js')).default;

            const htmlContent = await marked.parse(markdownText);

            const html = `
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
                ${htmlContent}
            </div>
            `;

            const opt = {
                margin:       0,
                filename:     'Kurt_Charles_Resume.pdf',
                image:        { type: 'jpeg', quality: 0.98 },
                html2canvas:  { scale: 2 },
                jsPDF:        { unit: 'in', format: 'letter', orientation: 'portrait' }
            };

            await html2pdf().set(opt).from(html).save();
        } catch (e: any) {
            console.error(e);
            alert(`Error: ${e.message}`);
        } finally {
            setIsDownloading(false);
        }
    };

    return (
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
            <button 
                onClick={handleCopy}
                className="btn-outline" 
                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', padding: '0.5rem 1rem' }}
            >
                {isCopied ? <CheckCircle size={16} color="#10b981" /> : <Copy size={16} />}
                {isCopied ? 'Copied Markdown' : 'Copy Text'}
            </button>
            <button 
                onClick={handleDownload}
                disabled={isDownloading}
                className="btn-outline" 
                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', padding: '0.5rem 1rem' }}
            >
                <Download size={16} className={isDownloading ? "animate-pulse" : ""} />
                {isDownloading ? 'Generating...' : 'Download PDF'}
            </button>
        </div>
    );
}
