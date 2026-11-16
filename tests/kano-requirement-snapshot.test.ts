// 설문 배포 후 요구사항 순서가 바뀌어도 응답의 원래 항목을 식별하는지 검증한다.
import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { buildKanoOfflineFormHtml } from '../lib/kano-offline-form';
import { buildKanoUploadTemplateWorkbook, buildKanoGoogleFormsTemplateWorkbook } from '../lib/kano-upload-template';
import { embedKanoRequirementSnapshot, readKanoOfflineRequirementIds, readKanoExcelRequirementIds, kanoRequirementSnapshotRows, KANO_ORDER_SHEET } from '../lib/kano-requirement-snapshot';

const original = [{ id: 'a', requirement: '장애를 예측한다' }, { id: 'b', requirement: '원인을 안내한다' }];
const changed = [{ ...original[1], requirement: '변경한 요구사항' }, original[0], { id: 'c', requirement: '추가 요구사항' }];
describe('Kano 문항 식별 스냅샷', () => {
    it('HTML의 식별자는 재정렬·문구변경·새 항목 추가 후에도 원래 순서다', () => {
        const html = embedKanoRequirementSnapshot(buildKanoOfflineFormHtml({ projectId: 'p', projectName: '프로젝트', requirements: original }), original);
        expect(readKanoOfflineRequirementIds(html, changed)).toEqual(['a', 'b']);
        expect(() => readKanoOfflineRequirementIds(html, [original[0]])).toThrow('연결할 수 없습니다');
    });
    it('이전 HTML은 질문쌍으로 식별하며 중복·손상된 식별자는 거절한다', () => {
        const html = buildKanoOfflineFormHtml({ projectId: 'p', projectName: '프로젝트', requirements: original });
        expect(readKanoOfflineRequirementIds(html, [...original].reverse())).toEqual(['a', 'b']);
        expect(() => readKanoOfflineRequirementIds(html, [original[0], { ...original[0], id: 'x' }])).toThrow();
        expect(() => readKanoOfflineRequirementIds('<script id="kano-requirement-order">invalid</script>', original)).toThrow();
    });
    it('엑셀 스냅샷은 ID로 연결하고 이전 전용 양식은 질문목록으로 연결한다', () => {
        const workbook = buildKanoUploadTemplateWorkbook(original);
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        delete workbook.Sheets[KANO_ORDER_SHEET];
        workbook.SheetNames = workbook.SheetNames.filter(name => name !== KANO_ORDER_SHEET);
        expect(readKanoExcelRequirementIds(workbook, sheet, [...original].reverse())).toEqual(['a', 'b']);
        XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(kanoRequirementSnapshotRows(original)), KANO_ORDER_SHEET);
        expect(readKanoExcelRequirementIds(workbook, sheet, changed)).toEqual(['a', 'b']);
    });
    it('이전 Google 질문 헤더 문구와 새 ID 헤더 모두 원래 항목에 연결한다', () => {
        const workbook = buildKanoGoogleFormsTemplateWorkbook(original);
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        delete workbook.Sheets[KANO_ORDER_SHEET];
        workbook.SheetNames = workbook.SheetNames.filter(name => name !== KANO_ORDER_SHEET);
        expect(readKanoExcelRequirementIds(workbook, sheet, [...original].reverse())).toEqual(['a', 'b']);
        const ids = XLSX.utils.aoa_to_sheet([['email', '[1-1] old {id:a}', '[1-2] old {id:a}', '[2-1] old {id:b}', '[2-2] old {id:b}'], ['test@import.local', 1, 5, 2, 4]]);
        expect(readKanoExcelRequirementIds(XLSX.utils.book_new(), ids, changed)).toEqual(['a', 'b']);
    });
    it('항목 식별 정보가 없는 번호 전용 응답은 추측해서 저장하지 않는다', () => {
        const sheet = XLSX.utils.aoa_to_sheet([['email', 'Q1_positive', 'Q1_negative'], ['test@import.local', 1, 5]]);
        expect(() => readKanoExcelRequirementIds(XLSX.utils.book_new(), sheet, original)).toThrow();
    });
    it('연결 시트의 행을 이동해도 No로 Q문항을 복원하고 중복·누락 번호를 거절한다', () => {
        const workbook = XLSX.utils.book_new();
        const sheet = XLSX.utils.aoa_to_sheet([['email', 'Q1_positive', 'Q1_negative'], ['test@import.local', 1, 5]]);
        XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['No', 'requirementId'], [2, 'b'], [1, 'a']]), KANO_ORDER_SHEET);
        expect(readKanoExcelRequirementIds(workbook, sheet, changed)).toEqual(['a', 'b']);
        workbook.Sheets[KANO_ORDER_SHEET] = XLSX.utils.aoa_to_sheet([['No', 'requirementId'], [1, 'b'], [1, 'a']]);
        expect(() => readKanoExcelRequirementIds(workbook, sheet, changed)).toThrow();
        workbook.Sheets[KANO_ORDER_SHEET] = XLSX.utils.aoa_to_sheet([['No', 'requirementId'], [2, 'b']]);
        expect(() => readKanoExcelRequirementIds(workbook, sheet, changed)).toThrow();
    });

});

describe('오프라인 HTML 식별자 탐색', () => {
    const snapshotOf = (ids: string[]) => `<script type="application/json" id="kano-requirement-order">${JSON.stringify(ids)}</script>`;

    it('앞에 다른 script 가 있거나 따옴표·닫는 태그 모양이 달라도 식별자를 읽는다', () => {
        expect(readKanoOfflineRequirementIds(`<script>var x = 1 > 0;</script>${snapshotOf(['b', 'a'])}`, original)).toEqual(['b', 'a']);
        expect(readKanoOfflineRequirementIds(`<script id='kano-requirement-order'>["a","b"]</script >`, original)).toEqual(['a', 'b']);
    });

    it('이름이 다른 태그나 다른 id 는 식별자로 보지 않는다', () => {
        const legacy = buildKanoOfflineFormHtml({ projectId: 'p', projectName: '프로젝트', requirements: original });

        // 식별자로 잘못 읽으면 ["b","a"] 가 나온다. 질문쌍으로 읽어야 ['a','b'] 다.
        expect(readKanoOfflineRequirementIds(`<scripts id="kano-requirement-order">["b","a"]</scripts>${legacy}`, original)).toEqual(['a', 'b']);
        expect(readKanoOfflineRequirementIds(`<script id="other">["b","a"]</script>${legacy}`, original)).toEqual(['a', 'b']);
        expect(readKanoOfflineRequirementIds(`<script id="kano-requirement-order">["b","a"]${legacy}`.replace(/<\/script>/g, ''), original)).toEqual(['a', 'b']);
    });

    it('닫히지 않은 태그를 반복한 2MB 입력도 곧바로 끝낸다', () => {
        // 정규식 하나로 찾던 때는 입력 길이의 제곱으로 느려져 파일 하나에 몇 분이 걸렸다.
        const size = 2 * 1024 * 1024;
        const inputs = [
            '<script '.repeat(size / 8),
            '<script x>'.repeat(size / 10),
            '<script id="kano-requirement-order" '.repeat(size / 36),
            '<legend><strong>1</strong> 질문'.repeat(size / 30),
            '<legend><strong>'.repeat(size / 16),
        ];

        const startedAt = performance.now();
        for (const html of inputs) {
            expect(() => readKanoOfflineRequirementIds(html, original)).toThrow('연결할 수 없습니다');
        }

        expect(performance.now() - startedAt).toBeLessThan(2000);
    });
});
