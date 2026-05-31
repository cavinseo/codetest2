import * as XLSX from 'xlsx';

export interface KanoTemplateRequirement {
    category?: string | null;
    subcategory?: string | null;
    requirement: string;
    kanoPositiveQ?: string | null;
    kanoNegativeQ?: string | null;
}

const ANSWER_GUIDE = [
    ['점수', '응답 의미'],
    [1, '마음에 든다'],
    [2, '당연하다'],
    [3, '아무런느낌이 없다'],
    [4, '하는수 없다'],
    [5, '마음에 안든다'],
];

export function buildKanoUploadTemplateWorkbook(
    requirements: KanoTemplateRequirement[],
    projectName = 'Kano 설문'
) {
    const headers = ['email'];
    for (let index = 0; index < requirements.length; index++) {
        headers.push(`Q${index + 1}_positive`, `Q${index + 1}_negative`);
    }

    const exampleRow = ['respondent1@example.com'];
    for (let index = 0; index < requirements.length; index++) {
        exampleRow.push('', '');
    }

    const responseRows = [
        [`${projectName} Kano 응답 업로드 양식`],
        ['각 응답자는 한 행에 입력하고, 답변 칸에는 1~5 점수를 입력하세요.'],
        headers,
        exampleRow,
    ];
    const responsesSheet = XLSX.utils.aoa_to_sheet(responseRows);
    responsesSheet['!cols'] = headers.map((header) => ({ wch: Math.max(16, header.length + 2) }));

    const questionRows = [
        ['No', '항목', '긍정 질문', '부정 질문'],
        ...requirements.map((requirement, index) => [
            index + 1,
            requirement.requirement,
            requirement.kanoPositiveQ ?? '',
            requirement.kanoNegativeQ ?? '',
        ]),
    ];
    const questionsSheet = XLSX.utils.aoa_to_sheet(questionRows);
    questionsSheet['!cols'] = [{ wch: 8 }, { wch: 36 }, { wch: 48 }, { wch: 48 }];

    const guideSheet = XLSX.utils.aoa_to_sheet(ANSWER_GUIDE);
    guideSheet['!cols'] = [{ wch: 10 }, { wch: 20 }];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, responsesSheet, 'Kano응답업로드');
    XLSX.utils.book_append_sheet(workbook, questionsSheet, 'Kano질문목록');
    XLSX.utils.book_append_sheet(workbook, guideSheet, '응답점수안내');
    return workbook;
}

export function writeKanoUploadTemplateBuffer(
    requirements: KanoTemplateRequirement[],
    projectName = 'Kano 설문'
): Buffer {
    return XLSX.write(buildKanoUploadTemplateWorkbook(requirements, projectName), {
        type: 'buffer',
        bookType: 'xlsx',
    });
}

function googleFormsQuestionTitle(
    requirement: KanoTemplateRequirement,
    type: 'positive' | 'negative'
): string {
    const categoryLabel = requirement.category
        ? `[${requirement.category}${requirement.subcategory ? ` > ${requirement.subcategory}` : ''}] `
        : '';
    const prefix = type === 'positive' ? '👍 [긍정]' : '👎 [부정]';
    return `${prefix} ${categoryLabel}${requirement.requirement}`;
}

export function buildKanoGoogleFormsTemplateWorkbook(
    requirements: KanoTemplateRequirement[],
    projectName = 'Kano 설문'
) {
    const headers = ['타임스탬프', '이메일 주소'];
    for (const requirement of requirements) {
        headers.push(
            googleFormsQuestionTitle(requirement, 'positive'),
            googleFormsQuestionTitle(requirement, 'negative')
        );
    }

    const exampleRow = ['2026-05-29 10:00:00', 'respondent1@example.com'];
    for (let index = 0; index < requirements.length; index++) {
        exampleRow.push('', '');
    }

    const responsesSheet = XLSX.utils.aoa_to_sheet([
        headers,
        exampleRow,
    ]);
    responsesSheet['!cols'] = headers.map((header, index) => ({
        wch: index < 2 ? 18 : Math.min(56, Math.max(24, header.length + 4)),
    }));

    const guideRows = [
        [`${projectName} Google Forms 응답 시트 업로드 안내`],
        ['Google Forms 응답을 스프레드시트로 연결한 뒤 xlsx로 다운로드한 파일을 그대로 업로드할 수 있습니다.'],
        ['긍정/부정 질문 열은 Google Forms 생성 시 사용한 순서대로 요구사항과 매칭됩니다.'],
        [],
        ...ANSWER_GUIDE,
    ];
    const guideSheet = XLSX.utils.aoa_to_sheet(guideRows);
    guideSheet['!cols'] = [{ wch: 18 }, { wch: 80 }];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, responsesSheet, '설문지 응답 시트1');
    XLSX.utils.book_append_sheet(workbook, guideSheet, '응답점수안내');
    return workbook;
}

export function writeKanoGoogleFormsTemplateBuffer(
    requirements: KanoTemplateRequirement[],
    projectName = 'Kano 설문'
): Buffer {
    return XLSX.write(buildKanoGoogleFormsTemplateWorkbook(requirements, projectName), {
        type: 'buffer',
        bookType: 'xlsx',
    });
}
