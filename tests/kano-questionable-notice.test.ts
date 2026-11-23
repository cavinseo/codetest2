// WS-7 Kano 집계표 밑 '주의' 칸 — 모순 응답자가 있을 때만 나타나고, 문항은 표 No 로 적히며,
// 분석 API 는 이메일 없이 인원·문항만 내려주는지 검증한다.
// @vitest-environment jsdom
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const responseFindMany = vi.fn();
const requirementFindMany = vi.fn();
vi.mock('../lib/prisma', () => ({
    prisma: {
        kanoResponse: { findMany: (...args: unknown[]) => responseFindMany(...(args as [])) },
        customerRequirement: { findMany: (...args: unknown[]) => requirementFindMany(...(args as [])) },
    },
}));
// 분석은 담당 멘토·관리자만 볼 수 있다(lib/kano-analysis-access). 관리자로 요청한다.
vi.mock('../lib/authorization', () => ({ requireProjectAccess: vi.fn(async () => ({ userId: 'u1', role: 'VIEWER', user: { role: 'ADMIN' } })) }));
vi.mock('../lib/logger', () => ({ createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) }));

const { default: KanoAggregationTable } = await import('../components/project/KanoAggregationTable');
const { GET } = await import('../app/api/projects/[id]/kano/analysis/route');

const aggregated = { M: 0, O: 0, A: 1, I: 0, R: 0, Q: 0, total: 1, dominantCategory: 'A' as const };
const analysis = [
    { requirementId: 'r1', requirementName: '빠른 처리', aggregated, better: 1, worse: 0 },
    { requirementId: 'r2', requirementName: '쉬운 설정', aggregated, better: 1, worse: 0 },
    { requirementId: 'r3', requirementName: '안정성', aggregated, better: 1, worse: 0 },
];

function renderTable(questionable?: Parameters<typeof KanoAggregationTable>[0]['questionable']) {
    const host = document.createElement('div');
    host.innerHTML = renderToStaticMarkup(createElement(KanoAggregationTable, { analysis, questionable }));
    return host;
}

describe('KanoAggregationTable 주의 칸', () => {
    it('모순 응답 요약이 없거나 0 명이면 그리지 않는다', () => {
        expect(renderTable().querySelector('[data-kano-questionable-notice]')).toBeNull();
        expect(renderTable(null).querySelector('[data-kano-questionable-notice]')).toBeNull();
        expect(renderTable({ respondentCount: 0, responseCount: 0, requirements: [] })
            .querySelector('[data-kano-questionable-notice]')).toBeNull();
    });

    it('표 밑에 주의 제목과 인원·건수·표 번호 순 문항을 적는다', () => {
        const host = renderTable({
            respondentCount: 2,
            responseCount: 3,
            // 요약 순서와 무관하게 표 번호 순으로 적고, 표에 없는 문항은 뺀다.
            requirements: [{ requirementId: 'r3', count: 1 }, { requirementId: 'gone', count: 4 }, { requirementId: 'r1', count: 2 }],
        });
        const notice = host.querySelector('[data-kano-questionable-notice]')!;
        expect(notice).not.toBeNull();
        // 집계표(table) 다음에 놓인다.
        expect(host.querySelector('table')!.compareDocumentPosition(notice) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(notice.querySelector('h4')!.textContent).toBe('주의');
        expect(notice.textContent).toContain('모순 응답자가 2명 있습니다');
        expect(notice.textContent).toContain('모순 응답 3건');
        expect(notice.textContent).toContain('회의적(Q)');
        expect(notice.textContent).toContain('해당 문항: 1번(2건), 3번(1건)');
    });

    it('표에 있는 문항이 하나도 없으면 문항 줄은 생략한다', () => {
        const notice = renderTable({ respondentCount: 1, responseCount: 1, requirements: [{ requirementId: 'gone', count: 1 }] })
            .querySelector('[data-kano-questionable-notice]')!;
        expect(notice.textContent).not.toContain('해당 문항');
    });
});

describe('GET /api/projects/[id]/kano/analysis 모순 응답 요약', () => {
    beforeEach(() => {
        responseFindMany.mockReset();
        requirementFindMany.mockReset();
        requirementFindMany.mockResolvedValue([
            { id: 'r1', kanoWeight: null, order: 0 },
            { id: 'r2', kanoWeight: null, order: 1 },
        ]);
    });

    it('이메일 없이 모순 응답자 수·건수·문항을 내려준다', async () => {
        responseFindMany.mockResolvedValue([
            { requirementId: 'r1', invitationId: 'i1', respondentEmail: 'secret@example.com', positiveAnswer: 1, negativeAnswer: 1 },
            { requirementId: 'r2', invitationId: 'i1', respondentEmail: 'secret@example.com', positiveAnswer: 1, negativeAnswer: 5 },
            { requirementId: 'r2', invitationId: 'i2', respondentEmail: 'other@example.com', positiveAnswer: 2, negativeAnswer: 5 },
        ]);
        const response = await GET(new NextRequest('http://localhost/api/projects/p1/kano/analysis'), { params: Promise.resolve({ id: 'p1' }) });
        const text = await response.text();
        expect(text).not.toContain('@example.com');
        expect(JSON.parse(text).questionable).toEqual({
            respondentCount: 1,
            responseCount: 1,
            requirements: [{ requirementId: 'r1', count: 1 }],
        });
    });
});
