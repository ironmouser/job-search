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
            const res = await fetch(`/api/jobs/${jobId}/resume/pdf`);
            if (!res.ok) throw new Error('Failed to generate PDF');
            
            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = 'Kurt_Charles_Resume.pdf';
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
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
