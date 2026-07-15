"use client";

import { useEffect } from 'react';

export default function ThemeProvider({ children }: { children: React.ReactNode }) {
    useEffect(() => {
        const applyTheme = () => {
            fetch('/api/settings', { cache: 'no-store' })
                .then(res => {
                    if (!res.ok || res.headers.get('content-type')?.includes('text/html')) {
                        return null;
                    }
                    return res.json();
                })
                .then(data => {
                    if (!data) return;
                    if (data.theme === 'dark') {
                        document.body.classList.remove('light-theme');
                    } else {
                        document.body.classList.add('light-theme');
                    }
                })
                .catch(console.error);
        };

        applyTheme();

        // Listen for updates from the settings page
        window.addEventListener('settingsUpdated', applyTheme);
        return () => window.removeEventListener('settingsUpdated', applyTheme);
    }, []);

    return <>{children}</>;
}
