"use client";

import { useEffect } from 'react';

export default function ThemeProvider({ children }: { children: React.ReactNode }) {
    useEffect(() => {
        const applyTheme = () => {
            fetch('/api/settings', { cache: 'no-store' })
                .then(res => res.json())
                .then(data => {
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
