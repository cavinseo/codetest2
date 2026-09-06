'use client';

import { useEffect, useState } from 'react';

type Theme = 'light' | 'dark';

const STORAGE_KEY = 'kano-qfd-theme';

function applyTheme(theme: Theme) {
    document.documentElement.classList.toggle('light', theme === 'light');
    document.documentElement.classList.toggle('dark', theme === 'dark');
}

interface ThemeToggleProps {
    // 헤더 안에서는 흐름 배치로 쓰고, 헤더가 없는 화면(로그인·가입 등)에서만 바깥에서
    // fixed 위치를 준다. 화면 위에 떠 있는 버튼은 헤더 내용과 겹치기 때문이다.
    className?: string;
}

export default function ThemeToggle({ className = '' }: ThemeToggleProps) {
    const [theme, setTheme] = useState<Theme>('dark');

    useEffect(() => {
        const savedTheme = window.localStorage.getItem(STORAGE_KEY) as Theme | null;
        const nextTheme: Theme = savedTheme === 'light' ? 'light' : 'dark';
        setTheme(nextTheme);
        applyTheme(nextTheme);
    }, []);

    const toggleTheme = () => {
        const nextTheme: Theme = theme === 'light' ? 'dark' : 'light';
        setTheme(nextTheme);
        window.localStorage.setItem(STORAGE_KEY, nextTheme);
        applyTheme(nextTheme);
    };

    // 아이콘은 현재 모드를 보여 주고, 설명은 누르면 무엇이 되는지를 말한다 —
    // 아이콘만으로는 현재 상태인지 전환 대상인지 읽는 사람마다 다르게 읽는다.
    const actionLabel = theme === 'light' ? '야간 모드로 전환' : '주간 모드로 전환';

    return (
        <button
            type="button"
            onClick={toggleTheme}
            className={`theme-toggle inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border border-white/10 transition-colors ${className}`}
            title={actionLabel}
            aria-label={actionLabel}
        >
            {theme === 'light' ? (
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 3v2m0 14v2m9-9h-2M5 12H3m15.36-6.36-1.42 1.42M7.05 16.95l-1.41 1.41m12.72 0-1.42-1.41M7.05 7.05 5.64 5.64M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z" />
                </svg>
            ) : (
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M21 12.79A8.5 8.5 0 1 1 11.21 3 6.5 6.5 0 0 0 21 12.79z" />
                </svg>
            )}
        </button>
    );
}
