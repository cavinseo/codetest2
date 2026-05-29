'use client';

import { useEffect, useState } from 'react';

type Theme = 'light' | 'dark';

const STORAGE_KEY = 'kano-qfd-theme';

export default function ThemeToggle() {
    const [theme, setTheme] = useState<Theme>('dark');

    useEffect(() => {
        const savedTheme = window.localStorage.getItem(STORAGE_KEY) as Theme | null;
        const nextTheme = savedTheme === 'light' || savedTheme === 'dark' ? savedTheme : 'dark';
        setTheme(nextTheme);
        document.documentElement.classList.toggle('light', nextTheme === 'light');
        document.documentElement.classList.toggle('dark', nextTheme === 'dark');
    }, []);

    const updateTheme = (nextTheme: Theme) => {
        setTheme(nextTheme);
        window.localStorage.setItem(STORAGE_KEY, nextTheme);
        document.documentElement.classList.toggle('light', nextTheme === 'light');
        document.documentElement.classList.toggle('dark', nextTheme === 'dark');
    };

    return (
        <div
            className="theme-toggle fixed right-4 top-4 z-[10000] inline-flex items-center gap-1 rounded-xl border border-white/10 bg-surface-900/80 p-1 shadow-lg backdrop-blur-xl sm:right-6"
            role="group"
            aria-label="화면 모드 선택"
        >
            <button
                type="button"
                onClick={() => updateTheme('light')}
                className={`theme-toggle-button ${theme === 'light' ? 'active' : ''}`}
                aria-pressed={theme === 'light'}
                title="주간 모드"
            >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 3v2m0 14v2m9-9h-2M5 12H3m15.36-6.36-1.42 1.42M7.05 16.95l-1.41 1.41m12.72 0-1.42-1.41M7.05 7.05 5.64 5.64M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z" />
                </svg>
                <span>주간</span>
            </button>
            <button
                type="button"
                onClick={() => updateTheme('dark')}
                className={`theme-toggle-button ${theme === 'dark' ? 'active' : ''}`}
                aria-pressed={theme === 'dark'}
                title="야간 모드"
            >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M21 12.79A8.5 8.5 0 1 1 11.21 3 6.5 6.5 0 0 0 21 12.79z" />
                </svg>
                <span>야간</span>
            </button>
        </div>
    );
}
