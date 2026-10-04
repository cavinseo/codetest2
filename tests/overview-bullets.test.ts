// 글머리 목록의 본문 보존과 커서 위치별 자동 이어쓰기·종료를 검증한다.
import { expect, it } from 'vitest';
import { continueOverviewBullet } from '../lib/overview-bullets';

it.each(['•', '○', '▪', '-', '·', '*'])('%s 글머리와 들여쓰기를 Enter에서 이어 쓴다', marker => {
    const value = `  ${marker} 고객 문제`;
    const result = continueOverviewBullet(value, value.length, value.length)!;
    expect(result.value).toBe(`${value}\n  ${marker} `);
    expect(result.selectionStart).toBe(result.value.length);
    expect(result.selectionEnd).toBe(result.value.length);
});

it('글머리만 있는 줄에서 Enter를 누르면 해당 글머리만 지우고 다음 내용을 보존한다', () => {
    const value = '• 첫 항목\n  • \n다음 설명';
    expect(continueOverviewBullet(value, 11, 11)).toEqual({ value: '• 첫 항목\n\n다음 설명', selectionStart: 7, selectionEnd: 7 });
});

it('항목 중간에서 Enter를 누르면 나머지 문장을 다음 글머리로 옮긴다', () => {
    expect(continueOverviewBullet('• 고객 문제와 기능', 7, 7)).toEqual({ value: '• 고객 문제\n• 와 기능', selectionStart: 10, selectionEnd: 10 });
});

it('일반 문장, 글머리 앞 커서, 여러 줄 선택에는 기본 Enter 동작을 사용한다', () => {
    expect(continueOverviewBullet('고객 문제', 5, 5)).toBeNull();
    expect(continueOverviewBullet('• 고객 문제', 0, 0)).toBeNull();
    expect(continueOverviewBullet('• 고객\n다음 설명', 3, 9)).toBeNull();
});

it('선택된 항목 본문만 Enter로 교체하고 뒤의 내용을 보존한다', () => {
    expect(continueOverviewBullet('• 고객 문제와 기능', 5, 9)?.value).toBe('• 고객 \n• 기능');
});
