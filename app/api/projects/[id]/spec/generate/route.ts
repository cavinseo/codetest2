import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireProjectAccess } from '@/lib/authorization';
import { createLogger } from '@/lib/logger';

const log = createLogger('api/spec/generate');

interface GeneratedSpec {
    id: string;
    level: 'CORE' | 'SUB' | 'DETAIL';
    parentId?: string;
    name: string;
    technology?: string;
    order: number;
}

interface Detail {
    name: string;
    technology?: string;
}

interface SubFunction {
    name: string;
    details: Detail[];
}

interface CoreFunction {
    name: string;
    subs: SubFunction[];
}

interface OverviewContext {
    projectName: string;
    simpleDescription: string;
    detailedDescription: string;
    additionalDescription: string;
    overviewText: string;
    subject: string;
    keywords: string[];
    actions: string[];
}

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: projectId } = await params;
        const accessResult = await requireProjectAccess(request, projectId, { write: true });
        if (accessResult instanceof NextResponse) return accessResult;

        const project = await prisma.project.findUnique({
            where: { id: projectId },
            select: {
                name: true,
                description: true,
                detailedDescription: true,
            },
        });

        if (!project) {
            return NextResponse.json({ error: 'Project not found.' }, { status: 404 });
        }

        const body = await request.json().catch(() => ({}));
        const additionalDescription =
            typeof body.additionalDescription === 'string' ? body.additionalDescription.trim() : '';

        const context = buildOverviewContext({
            projectName: project.name,
            simpleDescription: project.description || '',
            detailedDescription: project.detailedDescription || '',
            additionalDescription,
        });

        return NextResponse.json({
            specFunctions: flattenFastTree(generateFastTree(context)),
            source: 'overview-fast-analysis',
        });
    } catch (error: unknown) {
        log.error('Spec generation failed', error);
        return NextResponse.json({ error: 'Spec generation failed.' }, { status: 500 });
    }
}

function buildOverviewContext(input: {
    projectName: string;
    simpleDescription: string;
    detailedDescription: string;
    additionalDescription: string;
}): OverviewContext {
    const overviewText = compactText([
        input.simpleDescription,
        input.detailedDescription,
        input.additionalDescription,
        input.projectName,
    ]);
    const keywords = extractKeywords(overviewText);
    const actions = extractActionPhrases(overviewText);
    const subject = sanitizeTerm(input.projectName || keywords[0] || '제품 서비스');

    return {
        projectName: input.projectName,
        simpleDescription: input.simpleDescription,
        detailedDescription: input.detailedDescription,
        additionalDescription: input.additionalDescription,
        overviewText,
        subject,
        keywords,
        actions,
    };
}

function generateFastTree(context: OverviewContext): CoreFunction[] {
    const isDigital = hasAny(context.overviewText, [
        '앱', '웹', '플랫폼', '서비스', '시스템', 'ai', '인공지능', '데이터', '온라인',
        'app', 'web', 'platform', 'software', 'saas',
    ]);
    const isPhysical = hasAny(context.overviewText, [
        '제품', '장치', '기기', '센서', '하드웨어', '제조', '설비', '로봇', 'device',
        'sensor', 'hardware',
    ]);
    const isMarketplace = hasAny(context.overviewText, [
        '중개', '거래', '커미션', '매칭', '예약', '주문', '결제', '판매', '구매',
        'marketplace', 'commerce',
    ]);

    const valueDetails = detailFromActions(context.actions, [
        `${context.subject} 핵심 문제 정의`,
        `${context.subject} 이용 목적 식별`,
        `${context.subject} 기대 가치 구체화`,
    ], '제품개요 기능분석');

    const coreFunctions: CoreFunction[] = [
        {
            name: `${context.subject} 가치 제공`,
            subs: [
                {
                    name: '사용자 목적 달성',
                    details: valueDetails,
                },
                {
                    name: '제품 서비스 범위 정의',
                    details: [
                        detail(`${context.subject} 대상 사용자 구분`, '제품개요 기반 세그먼트 정의'),
                        detail(`${context.subject} 제공 범위 설정`, '서비스 범위 정의'),
                        detail(`${context.subject} 차별 가치 표현`, '가치 제안 구조화'),
                    ],
                },
            ],
        },
        {
            name: `${context.subject} 이용 흐름 처리`,
            subs: [
                {
                    name: '입력 및 요청 접수',
                    details: [
                        detail(`${context.subject} 요청 정보 입력`, inputTechnology(isDigital)),
                        detail(`${context.subject} 필수 조건 확인`, '입력 검증 규칙'),
                        detail(`${context.subject} 요청 내용 구조화`, '요청 데이터 모델'),
                    ],
                },
                {
                    name: '처리 및 결과 제공',
                    details: [
                        detail(`${context.subject} 처리 상태 관리`, workflowTechnology(isDigital)),
                        detail(`${context.subject} 결과 산출`, resultTechnology(isDigital, isPhysical)),
                        detail(`${context.subject} 결과 전달`, notificationTechnology(isDigital)),
                    ],
                },
            ],
        },
    ];

    if (isMarketplace) {
        coreFunctions.push({
            name: '거래 및 매칭 지원',
            subs: [
                {
                    name: '수요 공급 연결',
                    details: [
                        detail('사용자 조건 기반 매칭', '매칭 로직/필터링'),
                        detail('거래 조건 협의 지원', '견적/협의 워크플로우'),
                        detail('진행 상태 공유', '상태 알림/타임라인'),
                    ],
                },
                {
                    name: '거래 신뢰 확보',
                    details: [
                        detail('참여자 정보 확인', '프로필/인증 관리'),
                        detail('결제 및 정산 처리', '결제 게이트웨이/정산 모듈'),
                        detail('분쟁 및 예외 대응', 'CS 처리/증빙 이력'),
                    ],
                },
            ],
        });
    }

    if (isDigital) {
        coreFunctions.push({
            name: '디지털 서비스 운영',
            subs: [
                {
                    name: '사용자 인터페이스 제공',
                    details: [
                        detail('주요 화면 구성', 'React/Next.js UI'),
                        detail('사용자 입력 처리', 'Form/API route'),
                        detail('반응형 접근 제공', 'Responsive UI'),
                    ],
                },
                {
                    name: '데이터 및 권한 관리',
                    details: [
                        detail('업무 데이터 저장', 'Database/ORM'),
                        detail('사용자 권한 제어', 'Session/RBAC'),
                        detail('운영 이력 기록', 'Audit log'),
                    ],
                },
            ],
        });
    }

    if (isPhysical) {
        coreFunctions.push({
            name: '물리 제품 구현',
            subs: [
                {
                    name: '구조 및 동작 구현',
                    details: [
                        detail(`${context.subject} 구조 설계`, '기구 설계/CAD'),
                        detail(`${context.subject} 핵심 부품 구성`, 'BOM/부품 선정'),
                        detail(`${context.subject} 동작 성능 확보`, '시험/검증'),
                    ],
                },
                {
                    name: '품질 및 유지 관리',
                    details: [
                        detail('품질 기준 설정', '품질 규격/검사 기준'),
                        detail('고장 및 예외 대응', '진단/정비 프로세스'),
                        detail('사용 안전성 확보', '안전 설계/인증'),
                    ],
                },
            ],
        });
    }

    coreFunctions.push({
        name: '성과 및 개선 관리',
        subs: [
            {
                name: '성과 측정',
                details: [
                    detail(`${context.subject} 이용 지표 수집`, 'KPI 대시보드'),
                    detail(`${context.subject} 만족도 확인`, 'VOC/설문 분석'),
                    detail(`${context.subject} 개선 필요점 도출`, 'Gap 분석'),
                ],
            },
            {
                name: '지속 개선',
                details: [
                    detail('개선 우선순위 결정', 'Impact-effort 분석'),
                    detail('개선 과제 실행 계획 수립', 'Roadmap/WBS'),
                    detail('개선 효과 검증', '성과 추적/리포트'),
                ],
            },
        ],
    });

    return dedupeFastTree(coreFunctions).slice(0, 5);
}

function flattenFastTree(coreFunctions: CoreFunction[]): GeneratedSpec[] {
    const specs: GeneratedSpec[] = [];
    const idBase = `spec_${Date.now()}`;
    let order = 0;

    for (const core of coreFunctions) {
        const coreId = `${idBase}_${order}`;
        specs.push({ id: coreId, level: 'CORE', name: core.name, order: order++ });

        for (const sub of core.subs) {
            const subId = `${idBase}_${order}`;
            specs.push({ id: subId, level: 'SUB', parentId: coreId, name: sub.name, order: order++ });

            for (const item of sub.details) {
                specs.push({
                    id: `${idBase}_${order}`,
                    level: 'DETAIL',
                    parentId: subId,
                    name: item.name,
                    technology: item.technology,
                    order: order++,
                });
            }
        }
    }

    return specs;
}

function detail(name: string, technology: string): Detail {
    return { name: sanitizeTerm(name), technology };
}

function detailFromActions(actions: string[], fallbacks: string[], technology: string): Detail[] {
    const names = [...actions, ...fallbacks]
        .map((item) => toFunctionPhrase(item))
        .filter(Boolean);
    return Array.from(new Set(names)).slice(0, 3).map((name) => detail(name, technology));
}

function extractActionPhrases(text: string): string[] {
    const sentences = text
        .split(/[.!?\n\r。！？]+/)
        .map((item) => sanitizeTerm(item))
        .filter((item) => item.length >= 4);

    const actionSentences = sentences.filter((sentence) =>
        hasAny(sentence, ['제공', '지원', '관리', '연결', '처리', '분석', '추천', '생성', '개선', '확인', '수집'])
    );

    return actionSentences.slice(0, 5);
}

function toFunctionPhrase(text: string): string {
    const term = sanitizeTerm(text);
    if (!term) return '';
    if (/(제공|지원|관리|연결|처리|분석|추천|생성|개선|확인|수집|전달)$/.test(term)) return term;
    if (term.includes('문제') || term.includes('불편')) return `${term} 해결`;
    if (term.includes('요구') || term.includes('필요')) return `${term} 충족`;
    return `${term} 지원`;
}

function extractKeywords(text: string): string[] {
    const stopwords = new Set([
        'the', 'and', 'for', 'with', 'from', 'this', 'that', 'project', 'service',
        '제품', '서비스', '사용자', '고객', '기능', '제공', '지원', '관리', '위한',
        '통해', '기반', '대한', '있는', '한다', '하는', '하고', '및',
    ]);

    return Array.from(
        new Set(
            text
                .split(/[^0-9A-Za-z가-힣]+/)
                .map((word) => word.trim())
                .filter((word) => word.length >= 2 && !stopwords.has(word.toLowerCase()))
        )
    ).slice(0, 8);
}

function hasAny(text: string, keywords: string[]): boolean {
    const lowered = text.toLowerCase();
    return keywords.some((keyword) => lowered.includes(keyword.toLowerCase()));
}

function inputTechnology(isDigital: boolean): string {
    return isDigital ? 'UI form/API' : '요청서/접수 채널';
}

function workflowTechnology(isDigital: boolean): string {
    return isDigital ? 'Workflow state/API' : '업무 프로세스 관리';
}

function resultTechnology(isDigital: boolean, isPhysical: boolean): string {
    if (isPhysical) return '성능 시험/검증';
    return isDigital ? 'Business logic/Report' : '결과 산출 로직';
}

function notificationTechnology(isDigital: boolean): string {
    return isDigital ? 'Notification/Email' : '결과 안내 프로세스';
}

function compactText(values: Array<string | null | undefined>): string {
    return values
        .map((value) => value?.trim())
        .filter(Boolean)
        .join(' ');
}

function sanitizeTerm(text: string): string {
    return text
        .replace(/\s+/g, ' ')
        .replace(/[|/]+/g, ' ')
        .trim()
        .slice(0, 42);
}

function dedupeFastTree(coreFunctions: CoreFunction[]): CoreFunction[] {
    const coreSeen = new Set<string>();

    return coreFunctions.filter((core) => {
        if (coreSeen.has(core.name)) return false;
        coreSeen.add(core.name);

        const subSeen = new Set<string>();
        core.subs = core.subs.filter((sub) => {
            if (subSeen.has(sub.name)) return false;
            subSeen.add(sub.name);

            const detailSeen = new Set<string>();
            sub.details = sub.details.filter((item) => {
                if (detailSeen.has(item.name)) return false;
                detailSeen.add(item.name);
                return true;
            });

            return sub.details.length > 0;
        });

        return core.subs.length > 0;
    });
}
