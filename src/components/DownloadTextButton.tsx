"use client";

import { useState } from 'react';
import { Download, CheckCircle } from 'lucide-react';

export default function DownloadTextButton({ textToDownload, filename, label = "Download" }: { textToDownload: string, filename: string, label?: string }) {
    const [isDownloaded, setIsDownloaded] = useState(false);

    const handleDownload = () => {
        try {
            const blob = new Blob([textToDownload], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            setIsDownloaded(true);
            setTimeout(() => setIsDownloaded(false), 2000);
        } catch (err) {
            console.error('Failed to download text:', err);
        }
    };

    return (
        <button 
            onClick={handleDownload}
            className="btn-outline" 
            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', padding: '0.4rem 0.8rem' }}
        >
            {isDownloaded ? <CheckCircle size={14} color="var(--success)" /> : <Download size={14} />}
            {isDownloaded ? 'Downloaded!' : label}
        </button>
    );
}
