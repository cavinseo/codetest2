import { ParsedExcelData, findSheet, getCellValue, getRangeData } from './excel-parser';

// 고객 요구사항 데이터 구조
export interface CustomerRequirementData {
    category: string;
    subcategory?: string;
    requirement: string;
}

// 매핑 결과
export interface MappingResult {
    customerRequirements: CustomerRequirementData[];
    warnings: string[];
    errors: string[];
}

/**
 * 엑셀 데이터를 데이터베이스 형식으로 매핑
 */
export function mapExcelToDatabase(parsedData: ParsedExcelData): MappingResult {
    const warnings: string[] = [];
    const errors: string[] = [];
    const customerRequirements: CustomerRequirementData[] = [];

    // 1. 고객요구사항도출표 매핑 (가장 중요)
    const requirementsSheet = findSheet(parsedData, '고객요구사항도출표');
    if (!requirementsSheet) {
        errors.push('필수 시트 "고객요구사항도출표"를 찾을 수 없습니다.');
    } else {
        try {
            // 헤더는 보통 4행까지, 데이터는 5행부터 시작
            // 열 구조: B=대분류, C=중분류?, D=요구사항, E=기타
            for (let row = 5; row <= requirementsSheet.rowCount; row++) {
                const category = getCellValue(requirementsSheet, row, 2); // B열
                const requirement = getCellValue(requirementsSheet, row, 3); // C열
                const subcategory = getCellValue(requirementsSheet, row, 4); // D열

                // 유효한 요구사항만 추가
                if (requirement && requirement.toString().trim()) {
                    customerRequirements.push({
                        category: category?.toString() || '미분류',
                        subcategory: subcategory?.toString(),
                        requirement: requirement.toString().trim(),
                    });
                }
            }

            if (customerRequirements.length === 0) {
                warnings.push('고객요구사항도출표에서 유효한 데이터를 찾지 못했습니다.');
            }
        } catch (error: any) {
            errors.push(`고객요구사항 매핑 실패: ${error.message}`);
        }
    }

    // 2. 기타 시트 검증 (존재 여부만 확인)
    const expectedSheets = [
        '자사매출추정표',
        'AS-IS스펙표',
        '제품속성표',
        '제품속성적합도',
        'KANO질문지',
        'kano분석 집계표',
        '만족계수 그래프',
        'TIMKO',
        '기능기술체계도',
        'QFD',
        '개선포인트도출',
        '최종목표스펙도출',
        '향후목표고객LIST',
        '핵심자산과 보완자산표',
        '자금소요계획표',
        '자금조달계획표',
    ];

    for (const sheetName of expectedSheets) {
        if (!findSheet(parsedData, sheetName)) {
            warnings.push(`선택적 시트 "${sheetName}"를 찾을 수 없습니다.`);
        }
    }

    return {
        customerRequirements,
        warnings,
        errors,
    };
}

/**
 * Kano 질문지 시트 분석
 */
export function extractKanoQuestions(parsedData: ParsedExcelData): any {
    const sheet = findSheet(parsedData, 'KANO질문지');
    if (!sheet) return null;

    // Kano 질문지는 매우 복잡한 구조 (4,446개 수식)
    // 현재는 존재만 확인하고 실제 데이터는 프로젝트 생성 후 재생성
    return {
        exists: true,
        formulaCount: sheet.formulas ? Object.keys(sheet.formulas).length : 0,
    };
}

/**
 * QFD 매트릭스 데이터 추출
 */
export function extractQFDMatrix(parsedData: ParsedExcelData): any {
    const sheet = findSheet(parsedData, 'QFD');
    if (!sheet) return null;

    // QFD도 복잡한 계산 구조 (314개 수식)
    // 실제 구현에서는 사용자가 재입력하도록 유도
    return {
        exists: true,
        formulaCount: sheet.formulas ? Object.keys(sheet.formulas).length : 0,
    };
}
