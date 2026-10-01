// 멘토 분석 입력칸의 높이와 Markdown 미리보기·원문 저장을 검증한다.
// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import MentorWorksheetAnalysis from '../components/project/MentorWorksheetAnalysis';

vi.mock('next/navigation', () => ({ usePathname: () => '/project/project-1/spec' }));

let container: HTMLDivElement;
let root: Root;
let savedAnalysis: string;

beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    savedAnalysis = '# 진단\n\n- 첫째\n- 둘째';
    vi.stubGlobal('fetch', vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === 'PATCH') {
            savedAnalysis = JSON.parse(String(init.body)).analysis.analysis;
            return Promise.resolve({ ok: true, json: () => Promise.resolve({ version: 2 }) } as Response);
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ canEdit: true, canRead: true, version: 1, analysis: { analysis: savedAnalysis } }) } as Response);
    }));
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
});

afterEach(async () => {
    await act(async () => { root.unmount(); });
    container.remove();
    vi.unstubAllGlobals();
});

it('긴 분석칸을 12줄로 표시하고 Markdown 미리보기 뒤에도 원문을 저장한다', async () => {
    await act(async () => { root.render(createElement(MentorWorksheetAnalysis, { projectId: 'project-1', worksheetId: 'spec' })); });
    const editor = container.querySelector<HTMLTextAreaElement>('textarea[id="spec-분석 내용"]');
    expect(editor?.rows).toBe(12);
    expect(editor?.value).toBe('# 진단\n\n- 첫째\n- 둘째');
    const changed = '# 변경\n\n**강조**\n\n- 첫째\n- 둘째';
    await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(editor, changed);
        editor!.dispatchEvent(new Event('input', { bubbles: true }));
    });

    await act(async () => { [...container.querySelectorAll('button')].find(button => button.textContent === 'Markdown 미리보기')!.click(); });
    const preview = container.querySelector('[role="region"][aria-label="분석 내용 Markdown 미리보기"]');
    expect(preview?.querySelector('h1')?.textContent).toBe('변경');
    expect(preview?.querySelector('strong')?.textContent).toBe('강조');
    expect(preview?.querySelectorAll('li')).toHaveLength(2);

    await act(async () => { [...container.querySelectorAll('button')].find(button => button.textContent === '편집으로 돌아가기')!.click(); });
    const restored = container.querySelector<HTMLTextAreaElement>('textarea[id="spec-분석 내용"]')!;
    expect(restored.value).toBe(changed);
    await act(async () => { [...container.querySelectorAll('button')].find(button => button.textContent === '멘토 분석 저장')!.click(); });
    expect(savedAnalysis).toBe(changed);
});
