// 프로젝트 워크시트 상단 공통 메뉴바를 렌더링하는 컴포넌트입니다.
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import ThemeToggle from '@/components/ThemeToggle';
import { WORKSHEET_LINKS } from '@/lib/worksheet-pages';

interface ProjectWorksheetMenuProps {
    projectId: string;
}
const HIDDEN_SEGMENTS = new Set(['', 'import', 'settings']);

export default function ProjectWorksheetMenu({ projectId }: ProjectWorksheetMenuProps) {
    const pathname = usePathname();
    const basePath = `/project/${projectId}`;
    const suffix = pathname.startsWith(basePath) ? pathname.slice(basePath.length).replace(/^\/+/, '') : '';
    const isWorksheetPage = !HIDDEN_SEGMENTS.has(suffix);

    if (!isWorksheetPage) {
        return null;
    }

    return (
        <div className="sticky top-0 z-40 border-b border-white/[0.08] bg-surface-900/95 backdrop-blur">
            <div className="mx-auto flex w-full max-w-[1800px] items-center gap-2 px-3 py-3 sm:px-4 lg:px-6 2xl:px-8">
                {/* 탭만 가로로 스크롤시키고 주/야간 버튼은 스크롤 밖에 둔다 — 안에 넣으면
                    탭과 함께 흘러가고, 위에 띄우면 스크롤되는 탭을 가린다. */}
                <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto">
                    <Link
                        href={basePath}
                        className="flex-shrink-0 rounded-lg border border-white/[0.08] px-3 py-2 text-xs font-semibold text-gray-300 transition-colors hover:border-white/[0.14] hover:text-white"
                    >
                        프로젝트 개요
                    </Link>
                    {WORKSHEET_LINKS.map((item) => {
                        const targetHref = `${basePath}/${item.href}`;
                        const isActive = pathname === targetHref || pathname.startsWith(`${targetHref}/`);

                        return (
                            <Link
                                key={item.href}
                                href={targetHref}
                                className={`flex-shrink-0 rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${
                                    isActive
                                        ? 'border border-primary-500/30 bg-primary-500/15 text-white'
                                        : 'border border-white/[0.06] text-gray-400 hover:border-white/[0.12] hover:text-white'
                                }`}
                            >
                                {item.label}
                            </Link>
                        );
                    })}
                </div>
                <ThemeToggle />
            </div>
        </div>
    );
}
