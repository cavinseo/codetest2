// WS-3 가치 분석 API의 권한과 현재 입력 우선순위 및 기존 멘토링 호환성을 검증한다.
import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
const mocks = vi.hoisted(() => ({ access: vi.fn(), project: vi.fn(), connection: vi.fn(), task: vi.fn() }));
vi.mock('../lib/authorization', () => ({ requireProjectAccess: mocks.access }));
vi.mock('../lib/prisma', () => ({ prisma: { project: { findUnique: mocks.project } } }));
vi.mock('../lib/ai/personal-store', () => ({ loadPersonalConnection: mocks.connection }));
vi.mock('../lib/ai/registry', () => ({ runAiTask: mocks.task }));
import { ruleProvider } from '../lib/ai/provider-rule';
import { POST } from '../app/api/projects/[id]/attributes/mentor/route';

const call = (body: unknown) => POST(new NextRequest('http://localhost/api/projects/p/attributes/mentor', {
    method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' },
}), { params: Promise.resolve({ id: 'p' }) });

beforeEach(() => {
    vi.resetAllMocks();
    mocks.access.mockResolvedValue({ user: { userId: 'requester' } });
    mocks.connection.mockResolvedValue(null);
    mocks.project.mockResolvedValue({ name: '프로젝트', productName: '개요 제품명', description: '설명', detailedDescription: '상세', productAttributes: [{ productName: '저장 제품명', customerNeed: '기존 불편사항' }], specFunctions: [{ name: '실제 기능', level: 'SUB', technology: '실제 기술' }] });
    mocks.task.mockImplementation(async task => ({ result: await task(ruleProvider), provider: 'rule', requestedProvider: 'rule', degraded: false }));
});

it('현재 제품명과 미저장 행, 문진 답변 및 DB의 WS-2 기능으로 분석한다', async () => {
    const response = await call({ mode: 'value-analysis', userId: 'other', context: { productName: '현재 제품', existingRows: [{ customerNeed: '미저장 니즈' }] }, answers: { expectedBenefits: '문진 혜택' } });
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.summary).toContain('현재 제품');
    const text = JSON.stringify(data);
    for (const value of ['미저장 니즈', '문진 혜택', '실제 기능', '실제 기술']) expect(text).toContain(value);
    expect(text).not.toContain('기존 불편사항');
    expect(mocks.connection).toHaveBeenCalledWith('requester');
    expect(mocks.access).toHaveBeenCalledWith(expect.anything(), 'p', { write: true });
});

it('현재 입력이 생략되면 저장된 제품속성을 사용한다', async () => {
    const data = await (await call({ mode: 'value-analysis' })).json();
    expect(data.summary).toContain('저장 제품명');
    expect(JSON.stringify(data)).toContain('기존 불편사항');
});

it('사용자가 모두 지운 현재 행은 빈 배열 그대로 분석한다', async () => {
    const data = await (await call({ mode: 'value-analysis', context: { existingRows: [] } })).json();
    expect(JSON.stringify(data)).not.toContain('기존 불편사항');
    expect(JSON.stringify(data)).toContain('고객 니즈 확인 필요');
});

it('권한 없는 요청은 DB 조회와 AI 호출 전에 차단한다', async () => {
    mocks.access.mockResolvedValue(NextResponse.json({ error: 'Forbidden' }, { status: 403 }));
    expect((await call({ mode: 'value-analysis' })).status).toBe(403);
    expect(mocks.project).not.toHaveBeenCalled();
    expect(mocks.task).not.toHaveBeenCalled();
});

it('잘못된 현재 입력은 AI에 보내지 않는다', async () => {
    expect((await call({ mode: 'value-analysis', context: { existingRows: [{ customerNeed: 42 }] } })).status).toBe(400);
    expect(mocks.task).not.toHaveBeenCalled();
});

it('문진과 초안 생성의 기존 응답을 유지한다', async () => {
    expect((await (await call({ mode: 'questions' })).json()).questions).toHaveLength(5);
    expect((await (await call({ mode: 'draft', answers: { marketSegments: '시장', customerNames: '고객' } })).json()).rows).toEqual([{ marketSegment: '시장', customerName: '고객', customerNeed: '', benefit: '' }]);
});
