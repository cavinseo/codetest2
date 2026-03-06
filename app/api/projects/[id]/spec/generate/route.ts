import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
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

// 프로젝트 정보 기반 자동 스펙 생성
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: projectId } = await params;
        const project = await prisma.project.findUnique({
            where: { id: projectId },
        });

        if (!project) {
            return NextResponse.json(
                { error: '프로젝트를 찾을 수 없습니다' },
                { status: 404 }
            );
        }

        const projectInfo = `${project.name} ${project.description || ''} ${project.detailedDescription || ''}`.toLowerCase();

        const specs = generateSpecTemplate(projectInfo);

        return NextResponse.json({ specFunctions: specs });
    } catch (error: unknown) {
        log.error('스펙 자동 생성 실패', error);
        return NextResponse.json(
            { error: '스펙 자동 생성 실패' },
            { status: 500 }
        );
    }
}

function generateSpecTemplate(projectInfo: string): GeneratedSpec[] {
    const specs: GeneratedSpec[] = [];
    let orderCounter = 0;

    // 프로젝트 키워드 기반 카테고리 매칭
    const categories = detectCategories(projectInfo);

    for (const category of categories) {
        const coreId = `spec_${Date.now()}_${orderCounter}`;
        specs.push({
            id: coreId,
            level: 'CORE',
            name: category.name,
            order: orderCounter++,
        });

        for (const sub of category.subs) {
            const subId = `spec_${Date.now()}_${orderCounter}`;
            specs.push({
                id: subId,
                level: 'SUB',
                parentId: coreId,
                name: sub.name,
                order: orderCounter++,
            });

            for (const detail of sub.details) {
                specs.push({
                    id: `spec_${Date.now()}_${orderCounter}`,
                    level: 'DETAIL',
                    parentId: subId,
                    name: detail.name,
                    technology: detail.technology,
                    order: orderCounter++,
                });
            }
        }
    }

    return specs;
}

interface SubCategory {
    name: string;
    details: { name: string; technology?: string }[];
}

interface Category {
    name: string;
    subs: SubCategory[];
}

function detectCategories(info: string): Category[] {
    const templates: Record<string, Category[]> = {
        // 소프트웨어/앱 관련
        software: [
            {
                name: '사용자 인터페이스',
                subs: [
                    {
                        name: '화면 구성', details: [
                            { name: '메인 화면 레이아웃', technology: 'React/Next.js' },
                            { name: '네비게이션 시스템', technology: 'React Router' },
                            { name: '반응형 디자인', technology: 'CSS/Tailwind' },
                        ]
                    },
                    {
                        name: '사용자 입력', details: [
                            { name: '폼 입력 처리', technology: 'React Hook Form' },
                            { name: '데이터 검증', technology: 'Zod/Yup' },
                        ]
                    },
                ],
            },
            {
                name: '데이터 관리',
                subs: [
                    {
                        name: '데이터 저장', details: [
                            { name: '데이터베이스 연동', technology: 'PostgreSQL/MongoDB' },
                            { name: '캐싱 시스템', technology: 'Redis' },
                        ]
                    },
                    {
                        name: '데이터 처리', details: [
                            { name: 'API 통신', technology: 'REST API' },
                            { name: '실시간 동기화', technology: 'WebSocket' },
                        ]
                    },
                ],
            },
            {
                name: '보안 및 인증',
                subs: [
                    {
                        name: '사용자 인증', details: [
                            { name: '로그인/회원가입', technology: 'JWT/OAuth' },
                            { name: '권한 관리', technology: 'RBAC' },
                        ]
                    },
                ],
            },
        ],
        // 하드웨어/제품 관련
        hardware: [
            {
                name: '물리적 구조',
                subs: [
                    {
                        name: '외형 설계', details: [
                            { name: '케이스/하우징', technology: '사출 성형' },
                            { name: '인터페이스 포트', technology: 'USB-C/HDMI' },
                        ]
                    },
                    {
                        name: '내부 구조', details: [
                            { name: 'PCB 배치', technology: '4-Layer PCB' },
                            { name: '열 관리', technology: '히트싱크/팬' },
                        ]
                    },
                ],
            },
            {
                name: '전자 시스템',
                subs: [
                    {
                        name: '전원 관리', details: [
                            { name: '전원 공급', technology: 'SMPS' },
                            { name: '배터리 관리', technology: 'BMS' },
                        ]
                    },
                    {
                        name: '센서', details: [
                            { name: '환경 센서', technology: 'BME280' },
                            { name: '동작 센서', technology: 'IMU/가속도계' },
                        ]
                    },
                ],
            },
            {
                name: '통신',
                subs: [
                    {
                        name: '무선 통신', details: [
                            { name: 'WiFi 연결', technology: 'WiFi 6' },
                            { name: 'Bluetooth', technology: 'BLE 5.0' },
                        ]
                    },
                ],
            },
        ],
        // 서비스 관련
        service: [
            {
                name: '서비스 제공',
                subs: [
                    {
                        name: '핵심 서비스', details: [
                            { name: '서비스 등록/관리', technology: '웹 플랫폼' },
                            { name: '고객 대응', technology: 'CRM 시스템' },
                        ]
                    },
                    {
                        name: '부가 서비스', details: [
                            { name: '알림/통보', technology: 'Push/SMS' },
                            { name: '리포트 생성', technology: '대시보드' },
                        ]
                    },
                ],
            },
            {
                name: '운영 관리',
                subs: [
                    {
                        name: '모니터링', details: [
                            { name: '성과 추적', technology: 'KPI 대시보드' },
                            { name: '로그 관리', technology: '로깅 시스템' },
                        ]
                    },
                ],
            },
        ],
    };

    // 키워드 매칭
    const softwareKeywords = ['앱', 'app', '소프트웨어', 'software', '웹', 'web', '플랫폼', 'platform', '프로그램', '시스템', 'system', 'saas', '모바일'];
    const hardwareKeywords = ['하드웨어', 'hardware', '센서', 'sensor', 'iot', '디바이스', 'device', '로봇', '기계', '전자', '보드', '스마트', '제품'];
    const serviceKeywords = ['서비스', 'service', '컨설팅', '운영', '관리', '교육', '배송', '물류'];

    let matchedCategories: Category[] = [];

    const hasSoftware = softwareKeywords.some((k) => info.includes(k));
    const hasHardware = hardwareKeywords.some((k) => info.includes(k));
    const hasService = serviceKeywords.some((k) => info.includes(k));

    if (hasHardware) matchedCategories = [...matchedCategories, ...templates.hardware];
    if (hasSoftware) matchedCategories = [...matchedCategories, ...templates.software];
    if (hasService) matchedCategories = [...matchedCategories, ...templates.service];

    // 매칭되지 않으면 기본 소프트웨어 템플릿
    if (matchedCategories.length === 0) {
        matchedCategories = templates.software;
    }

    return matchedCategories;
}
