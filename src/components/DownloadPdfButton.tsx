"use client";

import { useState, useEffect } from 'react';
import { Download, CheckCircle, Loader2 } from 'lucide-react';
import { generateStyledPdfHtml, PdfStyleOptions } from '@/lib/pdfGeneratorHelper';
import { AssetFormat, generateDocxBlob } from '@/lib/docxGeneratorHelper';

interface DownloadPdfButtonProps {
    markdownText?: string;
    filename: string;
    label?: string;
    html?: string;
    type?: 'resume' | 'coverLetter' | 'networkingMessage';
    jobId?: string;
    styleOptions?: PdfStyleOptions;
    format?: AssetFormat;
}

function resolveDownloadFilename(filename: string, format: AssetFormat): string {
    const base = filename.replace(/\.(pdf|docx|txt)$/i, '');
    return `${base}.${format}`;
}

function resolveButtonLabel(label: string, format: AssetFormat): string {
    if (format === 'docx') {
        if (label.includes('PDF')) return label.replace(/PDF/g, 'DOCX');
        if (label === 'Download') return 'Download DOCX';
    } else {
        if (label === 'Download') return 'Download PDF';
    }
    return label;
}

export default function DownloadPdfButton({
    markdownText,
    filename,
    label = "Download",
    html,
    type = 'resume',
    jobId,
    styleOptions,
    format,
}: DownloadPdfButtonProps) {
    const [isDownloading, setIsDownloading] = useState(false);
    const [isDownloaded, setIsDownloaded] = useState(false);
    const [resolvedFormat, setResolvedFormat] = useState<AssetFormat>(format || 'pdf');

    useEffect(() => {
        if (format) {
            setResolvedFormat(format);
        }
    }, [format]);

    const handleDownload = async () => {
        setIsDownloading(true);
        try {
            let activeFormat: AssetFormat | undefined = format;
            let options = styleOptions;

            if (!options || !activeFormat) {
                try {
                    const res = await fetch('/api/settings');
                    const settings = await res.json();
                    if (!activeFormat) {
                        activeFormat = settings?.preferredAssetFormat === 'docx' ? 'docx' : 'pdf';
                        setResolvedFormat(activeFormat);
                    }
                    if (!options) {
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
                    }
                } catch {
                    console.warn('Could not fetch user asset settings, using defaults');
                }
            }

            const finalFormat: AssetFormat = activeFormat || 'pdf';
            const finalFilename = resolveDownloadFilename(filename, finalFormat);

            if (finalFormat === 'docx') {
                const textForDocx =
                    markdownText ||
                    (html ? html.replace(/<[^>]+>/g, '\n').replace(/\n{3,}/g, '\n\n').trim() : '');
                const blob = await generateDocxBlob(textForDocx, options);
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = finalFilename;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            } else {
                const html2pdf = (await import('html2pdf.js')).default;
                const finalHtml = html || generateStyledPdfHtml(markdownText || '', options);

                const opt: any = {
                    margin: [0.4, 0, 0.4, 0],
                    filename: finalFilename,
                    image: { type: 'jpeg', quality: 0.98 },
                    html2canvas: { scale: 2, useCORS: true },
                    jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' },
                    pagebreak: { mode: ['avoid-all', 'css', 'legacy'] },
                };

                await html2pdf().set(opt).from(finalHtml).save();
            }

            // Track download asynchronously
            fetch('/api/analytics/track-download', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type, jobId, format: finalFormat }),
            }).catch((err) => console.warn('Could not record download tracking:', err));

            setIsDownloaded(true);
            setTimeout(() => setIsDownloaded(false), 2000);
        } catch (err: any) {
            console.error('Failed to download asset:', err);
            alert(`Failed to download file: ${err.message}`);
        } finally {
            setIsDownloading(false);
        }
    };

    const displayLabel = resolveButtonLabel(label, resolvedFormat);

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
            <span>{isDownloading ? 'Generating...' : isDownloaded ? 'Downloaded!' : displayLabel}</span>
        </button>
    );
}
