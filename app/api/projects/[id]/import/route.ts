import { NextRequest, NextResponse } from 'next/server';
import { parseExcelFile } from '@/lib/excel-parser';
import { mapExcelToDatabase } from '@/lib/data-mapper';

export async function POST(
    request: NextRequest,
    props: { params: Promise<{ id: string }> }
) {
    const params = await props.params;
    try {
        const projectId = params.id;

        // FormData에서 파일 가져오기
        const formData = await request.formData();
        const file = formData.get('file') as File;

        if (!file) {
            return NextResponse.json({ error: '파일이 없습니다.' }, { status: 400 });
        }

        // 파일 크기 확인 (10MB 제한)
        const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
        if (file.size > MAX_FILE_SIZE) {
            return NextResponse.json(
                { error: '파일 크기는 10MB를 초과할 수 없습니다.' },
                { status: 400 }
            );
        }

        // 파일 확장자 확인
        if (!file.name.endsWith('.xlsx')) {
            return NextResponse.json(
                { error: '.xlsx 파일만 업로드할 수 있습니다.' },
                { status: 400 }
            );
        }

        console.log(`📥 파일 업로드 시작: ${file.name} (${file.size} bytes)`);

        // 1. 엑셀 파일 파싱
        const parsedData = await parseExcelFile(file);
        console.log(`✅ 파싱 완료: ${parsedData.sheets.length}개 시트`);

        // 2. 데이터 매핑
        const mappingResult = mapExcelToDatabase(parsedData);
        console.log(`✅ 매핑 완료: ${mappingResult.customerRequirements.length}개 요구사항`);

        // 3. 데이터베이스 저장 (임시로 로그만)
        // TODO: 실제 Prisma를 사용한 저장
        console.log('💾 데이터베이스 저장 (임시 스킵)');

        // 4. 결과 반환
        return NextResponse.json({
            success: true,
            requirementCount: mappingResult.customerRequirements.length,
            sheetsProcessed: parsedData.sheets.length,
            warnings: mappingResult.warnings,
            errors: mappingResult.errors,
            migrationId: `migration_${Date.now()}`,
        });
    } catch (error: any) {
        console.error('마이그레이션 오류:', error);
        return NextResponse.json(
            {
                error: error.message || '엑셀 마이그레이션 중 오류가 발생했습니다.',
                details: error.toString(),
            },
            { status: 500 }
        );
    }
}

// 파일 크기 제한 설정 (Next.js 14+)
export const config = {
    api: {
        bodyParser: false,
    },
};
