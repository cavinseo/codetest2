// 오프라인 HTML 이 저장된 소개문으로 완성되어 나가고, 응답 저장·재열기 뒤에도 소개문과 응답이 보존되는지 검증한다.
// @vitest-environment jsdom
import vm from 'node:vm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildKanoOfflineFormHtml } from '../lib/kano-offline-form';
import { parseKanoOfflineResponseHtml } from '../lib/kano-offline-response';

const introduction = { technology: '유로 성형', productType: '금속분리판', companyName: '테스트 기업', representativeName: '홍길동', offering: 'SOFC 제작 솔루션' };
const build = (values = introduction) => buildKanoOfflineFormHtml({ projectId: 'project', projectName: '제품', requirements: [{ requirement: '안전' }], introduction: values });

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
        document, confirm, Blob, alert: vi.fn(),
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
    it('저장한 다섯 값으로 소개문을 완성하고 편집 입력은 싣지 않는다', () => {
        const browser = open(build());
        const text = browser.document.querySelector('.introduction')?.textContent ?? '';
        for (const value of Object.values(introduction)) expect(text).toContain(`「${value}」`);
        expect(browser.document.querySelectorAll('input[id^="kano-intro-"]')).toHaveLength(0);
        expect(browser.document.querySelector('#kano-save-form')).toBeNull();
    });

    it('응답 저장 후 다시 열어도 소개문과 응답을 보존하고 소개문의 마크업은 글자로만 남는다', async () => {
        const unsafe = '</script><img src=x onerror=alert(1)>';
        const browser = open(build({ ...introduction, companyName: unsafe }));
        expect(browser.document.querySelector('img')).toBeNull();
        browser.document.querySelector<HTMLInputElement>('[name="q0-positive"][value="2"]')!.checked = true;
        browser.document.querySelector<HTMLInputElement>('[name="q0-negative"][value="5"]')!.checked = true;
        browser.document.querySelector<HTMLInputElement>('#kano-respondent-email')!.value = 'a@example.test';
        browser.document.querySelector<HTMLButtonElement>('#kano-save')!.click();
        await vi.waitFor(() => expect(browser.saved()).not.toBe(''));
        expect(browser.confirm).not.toHaveBeenCalled();
        expect(browser.fileName()).toContain('Kano_오프라인_응답지_');
        expect(browser.saved()).toContain('&lt;/script&gt;');
        const reopened = open(browser.saved());
        expect(reopened.document.querySelector('.introduction')!.textContent).toContain(`「${unsafe}」`);
        expect(reopened.document.querySelector('img')).toBeNull();
        expect(reopened.document.querySelector<HTMLInputElement>('[name="q0-positive"][value="2"]')!.checked).toBe(true);
        expect(reopened.document.querySelector<HTMLInputElement>('#kano-respondent-email')!.value).toBe('a@example.test');
        expect(parseKanoOfflineResponseHtml(browser.saved(), { projectId: 'project', requirementCount: 1, fallbackEmail: 'fallback@example.test' })).toEqual({
            ok: true, respondentEmail: 'a@example.test', answers: [{ respondentEmail: 'a@example.test', requirementIndex: 0, positiveAnswer: 2, negativeAnswer: 5 }],
        });
    });
});
