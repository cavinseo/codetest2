'use client';
// 단독 워크시트 페이지(/project/[id]/sales 등)의 편집 권한 관문.
//
// 프로젝트 홈은 역할을 보고 탭을 fieldset 으로 잠그지만, 단독 페이지는 표를 그대로 열어
// 조회 전용 회원(코치 등)도 편집할 수 있는 것처럼 보였다. 입력한 뒤 저장하면 403 이 나고
// 입력이 사라졌다(2026-10-25 코드 리뷰 B16). 홈과 같은 역할 기준·같은 잠금 방식을 쓴다.
import { useEffect, useState, type ReactNode } from 'react';
// 프로젝트 홈(app/project/[id]/page.tsx)의 canEditOverview 와 같은 기준이다.
import { isProjectWriteRole } from '@/lib/project-roles';

export type ProjectEditAccess = 'loading' | 'edit' | 'read' | 'unknown';

export function useProjectEditAccess(projectId: string): ProjectEditAccess {
    const [access, setAccess] = useState<ProjectEditAccess>('loading');

    useEffect(() => {
        let cancelled = false;
        setAccess('loading');
        fetch(`/api/projects/${projectId}/overview`)
            .then(async (res) => {
                if (!res.ok) throw new Error('권한 조회 실패');
                const data = await res.json();
                const role = data?.project?.role;
                if (!cancelled) setAccess(isProjectWriteRole(role) ? 'edit' : 'read');
            })
            .catch(() => {
                // 권한을 모르면 편집을 열지 않는다. 열었다가 저장에서 403 이 나면 입력만 잃는다.
                if (!cancelled) setAccess('unknown');
            });
        return () => {
            cancelled = true;
        };
    }, [projectId]);

    return access;
}

export function ReadOnlyNotice({ access }: { access: ProjectEditAccess }) {
    if (access === 'read') {
        return <p role="status" className="mb-4 text-sm text-amber-300">읽기 전용입니다. 워크시트 내용은 수정할 수 없습니다.</p>;
    }
    if (access === 'unknown') {
        return <p role="status" className="mb-4 text-sm text-amber-300">편집 권한을 확인하지 못해 수정을 막았습니다. 새로고침해 주세요.</p>;
    }
    return null;
}

export default function WorksheetEditGuard({ projectId, children }: { projectId: string; children?: ReactNode }) {
    const access = useProjectEditAccess(projectId);
    return (
        <>
            <ReadOnlyNotice access={access} />
            {/* 권한을 확인하는 동안에도 잠가 둔다. 확인 전에 입력한 값이 403 으로 사라지지 않게 한다. */}
            <fieldset disabled={access !== 'edit'} className="min-w-0">{children}</fieldset>
        </>
    );
}
