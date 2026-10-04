// 오프라인 소개문 편집과 HTML 저장·재열기 시 내용 및 응답 보존을 검증한다.
// @vitest-environment jsdom
import vm from 'node:vm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildKanoOfflineFormHtml } from '../lib/kano-offline-form';
import { parseKanoOfflineResponseHtml } from '../lib/kano-offline-response';

const introduction = { technology: '유로 성형', productType: '금속분리판', companyName: '테스트 기업', representativeName: '홍길동', offering: 'SOFC 제작 솔루션' };
const build = () => buildKanoOfflineFormHtml({ projectId: 'project', projectName: '제품', requirements: [{ requirement: '안전' }], introduction });

function open(html: string) {
    const document = new DOMParser().parseFromString(html, 'text/html');
    let savedHtml = '';
    let fileName = '';
    const confirm = vi.fn(() => true);
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
        fileName = this.download;
    });
    const script = document.querySelector('script:not([type])')!.textContent!;
    vm.runInNewContext(script, {
        document, confirm, Blob,
        URL: {
            createObjectURL: (blob: Blob) => {
                const reader = new FileReader();
                reader.onload = () => { savedHtml = String(reader.result); };
                reader.readAsText(blob);
                return 'blob:download';
            },
            revokeObjectURL: vi.fn(),
        },
    });
    return { document, confirm, saved: () => savedHtml, fileName: () => fileName };
}

afterEach(() => vi.restoreAllMocks());

describe('오프라인 소개문', () => {
    it('다섯 빈칸을 저장한 값으로 채우고 편집 입력에 복원한다', () => {
        const browser = open(build());
        for (const [key, value] of Object.entries(introduction)) {
            expect(browser.document.querySelector<HTMLInputElement>(`#kano-intro-${key}`)?.value).toBe(value);
            expect(browser.document.querySelector('.introduction')?.textContent).toContain(`「${value}」`);
        }
    });

    it('답변 전에도 양식을 저장하고 재열기 후 소개문과 응답을 보존한다', async () => {
        const browser = open(build());
        const unsafe = '</script><img src=x onerror=alert(1)>';
        const input = browser.document.querySelector<HTMLInputElement>('#kano-intro-companyName')!;
        input.value = unsafe;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        browser.document.querySelector<HTMLInputElement>('[name="q0-positive"][value="2"]')!.checked = true;
        browser.document.querySelector<HTMLInputElement>('#kano-respondent-email')!.value = 'a@example.test';
        browser.document.querySelector<HTMLButtonElement>('#kano-save-form')!.click();
        await vi.waitFor(() => expect(browser.saved()).not.toBe(''));
        expect(browser.confirm).not.toHaveBeenCalled();
        expect(browser.fileName()).toContain('Kano_오프라인_응답지_');
        const reopened = open(browser.saved());
        expect(reopened.document.querySelector<HTMLInputElement>('#kano-intro-companyName')!.value).toBe(unsafe);
        expect(reopened.document.querySelector('.introduction')!.textContent).toContain(unsafe);
        expect(reopened.document.querySelector('img')).toBeNull();
        expect(reopened.document.querySelector<HTMLInputElement>('[name="q0-positive"][value="2"]')!.checked).toBe(true);
        expect(reopened.document.querySelector<HTMLInputElement>('#kano-respondent-email')!.value).toBe('a@example.test');
        reopened.document.querySelector<HTMLInputElement>('[name="q0-negative"][value="5"]')!.checked = true;
        reopened.document.querySelector<HTMLButtonElement>('#kano-save')!.click();
        await vi.waitFor(() => expect(reopened.saved()).not.toBe(''));
        expect(reopened.saved()).toContain('&lt;/script&gt;');
        expect(reopened.confirm).not.toHaveBeenCalled();
        expect(parseKanoOfflineResponseHtml(reopened.saved(), { projectId: 'project', requirementCount: 1, fallbackEmail: 'fallback@example.test' })).toEqual({
            ok: true, respondentEmail: 'a@example.test', answers: [{ respondentEmail: 'a@example.test', requirementIndex: 0, positiveAnswer: 2, negativeAnswer: 5 }],
        });
    });
});
