// 사업계획 파일의 저장 형식, 경계값과 레거시 호환성을 검증하는 테스트

import { describe, expect, it } from 'vitest';
import {
    BUSINESS_PLAN_FILE_MAX_BYTES,
    BUSINESS_PLAN_FILE_NAME_MAX_LENGTH,
    BusinessPlanFileValidationError,
    getBusinessPlanFileValidationError,
    parseBusinessPlanFile,
    serializeBusinessPlanFile,
    validateBusinessPlanFileStorageValue,
} from '../lib/business-plan-file';

function makeDataUrl(mimeType: string, size: number) {
    const base64Length = Math.ceil(size / 3) * 4;
    const padding = size % 3 === 1 ? '==' : size % 3 === 2 ? '=' : '';
    return `data:${mimeType};base64,${'A'.repeat(base64Length - padding.length)}${padding}`;
}

describe('business plan file', () => {
    it('serializes and parses file metadata with its data URL', () => {
        const dataUrl = makeDataUrl('application/pdf', 12);
        const value = serializeBusinessPlanFile({
            fileName: '사업계획.pdf',
            mimeType: 'application/pdf',
            dataUrl,
        });

        expect(parseBusinessPlanFile(value)).toMatchObject({
            fileName: '사업계획.pdf',
            mimeType: 'application/pdf',
            dataUrl,
            size: 12,
            isLegacy: false,
        });
        expect(validateBusinessPlanFileStorageValue(value)).toBe(value);
    });

    it.each([
        ['plan.pdf', 'application/pdf'],
        ['plan.doc', 'application/msword'],
        ['plan.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
        ['plan.txt', 'text/plain'],
    ])('accepts an allowed file type: %s', (name, type) => {
        expect(getBusinessPlanFileValidationError({ name, type, size: 1 })).toBeNull();
    });

    it('rejects a disallowed extension or mismatched MIME type', () => {
        expect(getBusinessPlanFileValidationError({ name: 'plan.exe', type: 'application/octet-stream', size: 1 })).toContain('PDF');
        expect(getBusinessPlanFileValidationError({ name: 'plan.pdf', type: 'text/plain', size: 1 })).toContain('PDF');
    });

    it('rejects oversized file names', () => {
        expect(() => serializeBusinessPlanFile({
            fileName: `${'a'.repeat(BUSINESS_PLAN_FILE_NAME_MAX_LENGTH)}.pdf`,
            mimeType: 'application/pdf',
            dataUrl: makeDataUrl('application/pdf', 1),
        })).toThrow('파일명이 너무 깁니다');
    });

    it('accepts uppercase extensions, Unicode names, and an empty browser MIME type', () => {
        expect(getBusinessPlanFileValidationError({ name: '사업 계획서.PDF', type: '', size: 1 })).toBeNull();
    });

    it('accepts exactly 10MB and rejects a larger file', () => {
        expect(getBusinessPlanFileValidationError({ name: 'plan.pdf', type: 'application/pdf', size: BUSINESS_PLAN_FILE_MAX_BYTES })).toBeNull();
        expect(getBusinessPlanFileValidationError({ name: 'plan.pdf', type: 'application/pdf', size: BUSINESS_PLAN_FILE_MAX_BYTES + 1 })).toContain('10MB');

        const boundaryValue = serializeBusinessPlanFile({
            fileName: 'plan.pdf',
            mimeType: 'application/pdf',
            dataUrl: makeDataUrl('application/pdf', BUSINESS_PLAN_FILE_MAX_BYTES),
        });
        expect(validateBusinessPlanFileStorageValue(boundaryValue)).toBe(boundaryValue);
        expect(() => serializeBusinessPlanFile({
            fileName: 'plan.pdf',
            mimeType: 'application/pdf',
            dataUrl: makeDataUrl('application/pdf', BUSINESS_PLAN_FILE_MAX_BYTES + 1),
        })).toThrow(BusinessPlanFileValidationError);
    });

    it('supports valid legacy raw data URLs and ordinary text values', () => {
        const rawDataUrl = makeDataUrl('text/plain', 3);
        expect(parseBusinessPlanFile(rawDataUrl)).toMatchObject({
            fileName: '사업계획 파일.txt',
            dataUrl: rawDataUrl,
            isLegacy: true,
        });
        expect(validateBusinessPlanFileStorageValue(rawDataUrl)).toBe(rawDataUrl);
        expect(parseBusinessPlanFile('기존/사업계획서.pdf')).toMatchObject({
            dataUrl: null,
            displayValue: '기존/사업계획서.pdf',
            isLegacy: true,
        });
        expect(() => validateBusinessPlanFileStorageValue('기존/사업계획서.pdf')).toThrow(BusinessPlanFileValidationError);
        expect(() => validateBusinessPlanFileStorageValue('malware.exe')).toThrow(BusinessPlanFileValidationError);
    });

    it('does not throw while parsing damaged values but rejects them for API storage', () => {
        const damagedValue = 'business-plan-file:v1:{bad json';
        expect(() => parseBusinessPlanFile(damagedValue)).not.toThrow();
        expect(parseBusinessPlanFile(damagedValue)).toMatchObject({ dataUrl: null, isLegacy: true });
        expect(() => validateBusinessPlanFileStorageValue(damagedValue)).toThrow(BusinessPlanFileValidationError);
        expect(() => validateBusinessPlanFileStorageValue('data:text/html;base64,PGgxPk5PPC9oMT4=')).toThrow(BusinessPlanFileValidationError);
        expect(() => validateBusinessPlanFileStorageValue('data:application/pdf;base64,ab=c')).toThrow(BusinessPlanFileValidationError);
        expect(parseBusinessPlanFile('data:text/html;base64,PGgxPk5PPC9oMT4=')).toMatchObject({ dataUrl: null });
        expect(() => validateBusinessPlanFileStorageValue('business-plan-file:v1:{}')).toThrow(BusinessPlanFileValidationError);
    });

    it('maps empty values to an explicit attachment removal', () => {
        expect(validateBusinessPlanFileStorageValue('')).toBeNull();
        expect(validateBusinessPlanFileStorageValue(null)).toBeNull();
        expect(parseBusinessPlanFile('')).toBeNull();
    });
});
