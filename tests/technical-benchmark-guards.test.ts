// technical_benchmarks 테이블 부재 판정이 "그 테이블"만 골라내는지 확인한다.
//
// 이 판정이 헐거우면 다른 테이블이 없어서 난 오류까지 빈 목록으로 삼켜, 진짜 결함이
// 빈 화면 뒤로 숨는다. 그래서 참이 되는 경우와 거짓이 되는 경우를 모두 고정한다.
import { describe, expect, it } from 'vitest';
import { isMissingTechnicalBenchmarkTable } from '../lib/technical-benchmark-guards';

describe('isMissingTechnicalBenchmarkTable', () => {
    it('P2021 이고 meta.table 이 그 테이블이면 참이다', () => {
        expect(isMissingTechnicalBenchmarkTable({
            code: 'P2021',
            meta: { table: 'public.technical_benchmarks' },
        })).toBe(true);
    });

    it('드라이버 원본 코드 42P01 도 같게 본다', () => {
        expect(isMissingTechnicalBenchmarkTable({
            code: '42P01',
            meta: { table: 'technical_benchmarks' },
        })).toBe(true);
    });

    it('meta 가 없으면 메시지에서 테이블 이름을 찾는다', () => {
        expect(isMissingTechnicalBenchmarkTable({
            code: 'P2021',
            message: 'The table `public.technical_benchmarks` does not exist',
        })).toBe(true);
    });

    it('meta.table 이 문자열이 아니면 메시지로 넘어간다', () => {
        expect(isMissingTechnicalBenchmarkTable({
            code: 'P2021',
            meta: { table: 42 },
            message: 'relation "technical_benchmarks" does not exist',
        })).toBe(true);
    });

    it('다른 테이블이 없다는 오류는 거짓이다', () => {
        // 이걸 참으로 보면 benchmarks 테이블 장애가 빈 줄로 조용히 숨는다.
        expect(isMissingTechnicalBenchmarkTable({
            code: 'P2021',
            meta: { table: 'benchmarks' },
        })).toBe(false);
    });

    it('테이블 이름을 어디서도 찾을 수 없으면 거짓이다', () => {
        expect(isMissingTechnicalBenchmarkTable({ code: 'P2021' })).toBe(false);
        expect(isMissingTechnicalBenchmarkTable({ code: 'P2021', message: '알 수 없는 오류' })).toBe(false);
        expect(isMissingTechnicalBenchmarkTable({ code: 'P2021', message: 42 })).toBe(false);
    });

    it('다른 오류 코드는 거짓이다', () => {
        expect(isMissingTechnicalBenchmarkTable({
            code: 'P2002',
            meta: { table: 'technical_benchmarks' },
        })).toBe(false);
    });

    it('코드가 문자열이 아니면 거짓이다', () => {
        expect(isMissingTechnicalBenchmarkTable({
            code: 2021,
            meta: { table: 'technical_benchmarks' },
        })).toBe(false);
        expect(isMissingTechnicalBenchmarkTable({ meta: { table: 'technical_benchmarks' } })).toBe(false);
    });

    it('객체가 아니거나 null 이면 거짓이다', () => {
        expect(isMissingTechnicalBenchmarkTable(null)).toBe(false);
        expect(isMissingTechnicalBenchmarkTable(undefined)).toBe(false);
        expect(isMissingTechnicalBenchmarkTable('P2021 technical_benchmarks')).toBe(false);
        expect(isMissingTechnicalBenchmarkTable(2021)).toBe(false);
    });
});
