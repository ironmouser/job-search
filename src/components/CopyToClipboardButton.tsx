"use client";

import { useState } from 'react';
import { Copy, CheckCircle } from 'lucide-react';
import { safeCopyToClipboard } from '@/lib/clipboard';

export default function CopyToClipboardButton({ textToCopy, label = "Copy" }: { textToCopy: string, label?: string }) {
    const [isCopied, setIsCopied] = useState(false);

    const handleCopy = async () => {
        const success = await safeCopyToClipboard(textToCopy);
        if (success) {
            setIsCopied(true);
            setTimeout(() => setIsCopied(false), 2000);
        }
    };

    return (
        <button 
            onClick={handleCopy}
            className="btn-outline" 
            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', padding: '0.4rem 0.8rem' }}
        >
            {isCopied ? <CheckCircle size={14} color="var(--success)" /> : <Copy size={14} />}
            {isCopied ? 'Copied!' : label}
        </button>
    );
}
