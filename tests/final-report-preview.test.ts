// 완료 보고서의 긴 본문과 표가 입력칸 없이 전부 표시되는지 검증한다.
import React, { type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import FinalReportPreview from '../components/project/FinalReportPreview';
import type { FinalReportBlock } from '../lib/final-report-document';

const longParagraph = `첫째 줄\n${'완료된 보고서의 긴 본문입니다. '.repeat(300)}\n마지막 줄`;
const longCell = `첫째 행\n${'긴 기술적 특성 설명 '.repeat(100)}\n마지막 행`;
const blocks: FinalReportBlock[] = [
    { kind: 'heading', text: '대제목', level: 1 },
    { kind: 'heading', text: '소제목', level: 2 },
    { kind: 'paragraph', text: longParagraph },
    { kind: 'keyValueTable', rows: [{ label: '프로젝트 설명', value: longCell }] },
    { kind: 'dataTable', headers: ['기술 항목', '기술적 특성'], rows: [['핵심 스펙', longCell]] },
    { kind: 'image', title: '완료 당시 그림', pngDataUrl: 'data:image/jpeg;base64,/9j/2Q==', widthMm: 100, heightMm: 80, landscape: true },
];

function render(props: Partial<React.ComponentProps<typeof FinalReportPreview>> = {}) {
    return renderToStaticMarkup(React.createElement(FinalReportPreview, { blocks, ...props }));
}

function elements(node: ReactNode, found: ReactElement<Record<string, unknown>>[] = []) {
    React.Children.forEach(node, child => {
        if (!React.isValidElement<Record<string, unknown>>(child)) return;
        found.push(child);
        elements(child.props.children as ReactNode, found);
    });
    return found;
}

describe('결과보고서 읽기 전용 미리보기', () => {
    it('완료본은 긴 본문·표의 모든 문자열과 줄바꿈을 입력칸 없이 렌더링한다', () => {
        const html = render({ readOnly: true });
        expect(html).toContain(longParagraph);
        expect(html.match(new RegExp(longCell, 'g'))).toHaveLength(2);
        expect(html).toContain('whitespace-pre-wrap');
        expect(html).toContain('break-words');
        expect(html).not.toMatch(/<(?:input|textarea)\b/i);
        expect(html).not.toMatch(/contenteditable/i);
        expect(html).toMatch(/<h2\b[^>]*>대제목<\/h2>/);
        expect(html).toMatch(/<h3\b[^>]*>소제목<\/h3>/);
        expect(html).toContain('기술 항목');
        expect(html).toContain('핵심 스펙');
    });

    it('onEdit가 없으면 readOnly를 생략해도 편집 UI가 생기지 않는다', () => {
        expect(render()).not.toMatch(/<(?:input|textarea)\b/i);
    });

    it('onEdit가 전달되어도 readOnly가 우선하여 변경 핸들러를 만들지 않는다', () => {
        const onEdit = vi.fn();
        const tree = FinalReportPreview({ blocks, readOnly: true, onEdit });
        expect(elements(tree).every(element => element.props.onChange === undefined)).toBe(true);
        expect(render({ readOnly: true, onEdit })).not.toMatch(/<(?:input|textarea)\b/i);
        expect(onEdit).not.toHaveBeenCalled();
    });

    it('보고서의 마크업 문자열은 실행 가능한 HTML 대신 글자로 표시한다', () => {
        const html = render({ blocks: [{ kind: 'paragraph', text: '<script>alert("x")</script><img src=x onerror=alert(1)>' }], readOnly: true });
        expect(html).not.toContain('<script>');
        expect(html).not.toContain('<img src=x');
        expect(html).toContain('&lt;script&gt;');
        expect(html).toContain('&lt;img src=x');
    });

    it('저장된 완료 그림과 설명·치수·방향을 표시한다', () => {
        const html = render({ readOnly: true });
        expect(html).toContain('src="data:image/jpeg;base64,/9j/2Q=="');
        expect(html).toContain('alt="완료 당시 그림"');
        expect(html).toContain('100×80mm');
        expect(html).toContain('가로 페이지');
    });
});

describe('멘토 교정 화면', () => {
    it('편집 가능한 블록에만 입력칸을 제공하고 저장 중에는 모든 입력을 비활성화한다', () => {
        const onEdit = vi.fn();
        const editable = elements(FinalReportPreview({ blocks, onEdit })).filter(element => element.type === 'input' || element.type === 'textarea');
        expect(editable).toHaveLength(8);
        expect(editable.every(element => element.props.disabled === false)).toBe(true);
        const busy = elements(FinalReportPreview({ blocks, onEdit, disabled: true })).filter(element => element.type === 'input' || element.type === 'textarea');
        expect(busy).toHaveLength(8);
        expect(busy.every(element => element.props.disabled === true)).toBe(true);
        expect(busy.every(element => typeof element.props['aria-label'] === 'string')).toBe(true);
    });

    it('본문과 표의 교정 요청은 해당 블록·행·열로 전달된다', () => {
        const onEdit = vi.fn();
        const editable = elements(FinalReportPreview({ blocks, onEdit }));
        for (const [label, expected] of [
            ['문단 3', { kind: 'text', blockIndex: 2, text: '교정' }],
            ['프로젝트 설명', { kind: 'keyValue', blockIndex: 3, row: 0, value: '교정' }],
            ['머리글 2', { kind: 'tableHeader', blockIndex: 4, col: 1, value: '교정' }],
            ['1행 2열', { kind: 'tableCell', blockIndex: 4, row: 0, col: 1, value: '교정' }],
        ] as const) {
            const element = editable.find(item => item.props['aria-label'] === label)!;
            (element.props.onChange as (event: { target: { value: string } }) => void)({ target: { value: '교정' } });
            expect(onEdit).toHaveBeenLastCalledWith(expected);
        }
    });
});
