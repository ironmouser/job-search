"use client";

import { useState } from 'react';
import { Download, Copy, CheckCircle } from 'lucide-react';

import { generateStyledPdfHtml, PdfStyleOptions } from '@/lib/pdfGeneratorHelper';
import { safeCopyToClipboard } from '@/lib/clipboard';

export default function ResumeActions({ jobId, markdownText, selectedColor = "#06af9e", pdfSettings }: { jobId: string, markdownText: string, selectedColor?: string, pdfSettings?: PdfStyleOptions }) {
    const [isCopied, setIsCopied] = useState(false);
    const [isDownloading, setIsDownloading] = useState(false);
    const [showToast, setShowToast] = useState(false);

    const handleCopy = async () => {
        const success = await safeCopyToClipboard(markdownText);
        if (success) {
            setIsCopied(true);
            setTimeout(() => setIsCopied(false), 3000);
        }
    };

    const handleDownload = async () => {
        setIsDownloading(true);
        try {
            const html2pdf = (await import('html2pdf.js')).default;
            let options = pdfSettings;

            if (!options) {
                try {
                    const res = await fetch('/api/settings');
                    const settings = await res.json();
                    options = {
                        template: settings.resumePdfTemplate,
                        fontFamily: settings.resumePdfFontFamily,
                        fontSize: settings.resumePdfFontSize,
                        lineHeight: settings.resumePdfLineHeight,
                        primaryColor: settings.resumePdfPrimaryColor,
                        textColor: settings.resumePdfTextColor,
                        margin: settings.resumePdfMargin,
                        headerLayout: settings.resumePdfHeaderLayout,
                    };
                } catch (e) {
                    console.warn('Could not fetch user PDF settings, using defaults');
                }
            }

            const html = generateStyledPdfHtml(markdownText || '', options);

            let extractedName = 'My';
            const nameMatch = markdownText.match(/^#\s+([^\n]+)/);
            if (nameMatch && nameMatch[1]) {
                extractedName = nameMatch[1].trim().replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '');
            }

            const opt: any = {
                margin:       [0.4, 0, 0.4, 0],
                filename:     `${extractedName}_Resume.pdf`,
                image:        { type: 'jpeg', quality: 0.98 },
                html2canvas:  { scale: 2, useCORS: true },
                jsPDF:        { unit: 'in', format: 'letter', orientation: 'portrait' },
                pagebreak:    { mode: ['avoid-all', 'css', 'legacy'] }
            };

            await html2pdf().set(opt).from(html).save();

            // Track download asynchronously
            fetch('/api/analytics/track-download', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type: 'resume', jobId }),
            }).catch((err) => console.warn('Could not record download tracking:', err));

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
