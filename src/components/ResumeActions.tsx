"use client";

import { useState } from 'react';
import { Download, Copy, CheckCircle } from 'lucide-react';

export default function ResumeActions({ jobId, markdownText, selectedColor = "#06af9e" }: { jobId: string, markdownText: string, selectedColor?: string }) {
    const [isCopied, setIsCopied] = useState(false);
    const [isDownloading, setIsDownloading] = useState(false);
    const [showToast, setShowToast] = useState(false);

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
                    h1 { font-size: 24pt; font-weight: bold; margin-bottom: 5px; margin-top: 0; color: ${selectedColor} !important; border-bottom: none !important; page-break-inside: avoid; break-inside: avoid; }
                    h2 { font-size: 14pt; font-weight: bold; margin-top: 20px; margin-bottom: 20px; color: ${selectedColor} !important; border-bottom: none !important; page-break-inside: avoid; break-inside: avoid; }
                    h3 { font-size: 14pt; font-weight: bold; margin-top: 25px; margin-bottom: 15px; border-bottom: none !important; padding-bottom: 0; color: ${selectedColor} !important; page-break-inside: avoid; break-inside: avoid; }
                    h4, h5, h6 { color: ${selectedColor} !important; border-bottom: none !important; page-break-inside: avoid; break-inside: avoid; }
                    p { margin: 8px 0; page-break-inside: avoid; break-inside: avoid; }
                    ul { margin-top: 5px; margin-bottom: 15px; padding-left: 20px; }
                    li { margin-bottom: 4px; page-break-inside: avoid; break-inside: avoid; }
                    strong { font-weight: bold; }
                    a { color: ${selectedColor} !important; }
                </style>
                ${htmlContent}
            </div>
            `;

            let extractedName = 'My';
            const nameMatch = markdownText.match(/^#\s+([^\n]+)/);
            if (nameMatch && nameMatch[1]) {
                extractedName = nameMatch[1].trim().replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '');
            }

            const opt: any = {
                margin:       [0.5, 0, 0.5, 0],
                filename:     `${extractedName}_Resume.pdf`,
                image:        { type: 'jpeg', quality: 0.98 },
                html2canvas:  { scale: 2 },
                jsPDF:        { unit: 'in', format: 'letter', orientation: 'portrait' },
                pagebreak:    { mode: ['avoid-all', 'css', 'legacy'] }
            };

            await html2pdf().set(opt).from(html).save();
            setShowToast(true);
            setTimeout(() => setShowToast(false), 3000);
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
                <span>{isCopied ? 'Copied Markdown' : 'Copy Text'}</span>
            </button>
            <button 
                onClick={handleDownload}
                disabled={isDownloading}
                className="btn-outline" 
                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', padding: '0.5rem 1rem' }}
            >
                <Download size={16} className={isDownloading ? "animate-pulse" : ""} />
                <span>{isDownloading ? 'Generating...' : 'Download PDF'}</span>
            </button>

            {showToast && (
                <div style={{
                    position: 'fixed',
                    bottom: '2rem',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    background: 'var(--accent-primary)',
                    color: '#000',
                    padding: '0.8rem 1.5rem',
                    borderRadius: '50px',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    fontSize: '0.9rem',
                    fontWeight: 600,
                    zIndex: 9999,
                    animation: 'slideUp 0.3s ease-out'
                }}>
                    <CheckCircle size={18} />
                    File downloaded successfully!
                </div>
            )}
        </div>
    );
}
