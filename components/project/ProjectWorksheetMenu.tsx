// 프로젝트 워크시트 상단 공통 메뉴바를 렌더링하는 컴포넌트입니다.
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface ProjectWorksheetMenuProps {
    projectId: string;
}

const WORKSHEET_LINKS = [
    { href: 'sales', label: 'WS-1 자사매출추정표' },
    { href: 'spec', label: 'WS-2 AS-IS 스펙표' },
    { href: 'attributes', label: 'WS-3 제품속성서' },
    { href: 'attributes/fitness', label: 'WS-4 제품속성적합도' },
    { href: 'requirements', label: 'WS-5 고객요구사항도출표' },
    { href: 'kano', label: 'WS-6 Kano 질문지' },
    { href: 'kano/analysis', label: 'WS-7 Kano 분석 집계표' },
    { href: 'qfd', label: 'WS-9 QFD' },
    { href: 'tech-tree', label: 'WS-10 기능기술체계도' },
    { href: 'improvements', label: 'WS-11 개선포인트도출' },
    { href: 'target-spec', label: 'WS-12 최종목표스펙도출' },
    { href: 'tech-roadmap', label: 'WS-13 향후목표고객LIST' },
    { href: 'dev-plan', label: 'WS-14 개발계획서' },
    { href: 'assets', label: 'WS-15 핵심자산 및 보완자산 도출표' },
    { href: 'funding-plan', label: 'WS-16 자금소요계획표' },
    { href: 'funding-source', label: 'WS-17 자금조달계획표' },
];

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
            <div className="mx-auto flex w-full max-w-[1800px] items-center gap-2 overflow-x-auto px-3 py-3 sm:px-4 lg:px-6 2xl:px-8">
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
        </div>
    );
}
