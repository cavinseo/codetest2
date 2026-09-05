// 여러 Kano 오프라인 HTML 응답지를 검증해 유효한 응답만 한 번에 저장하는 라우트다.
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireProjectAccess } from '@/lib/authorization';
import { createLogger } from '@/lib/logger';
import { parseKanoOfflineResponseHtml } from '@/lib/kano-offline-response';
import {
    parseWritePolicy,
    persistKanoUploadAnswers,
} from '@/lib/kano-response-store';
import type { ParsedKanoUploadAnswer } from '@/lib/kano-upload-parser';
import {
    guardUploadedOfflineHtml,
    MAX_OFFLINE_HTML_FILES,
} from '@/lib/upload-guard';

const log = createLogger('api/kano-upload-offline');

type OfflineUploadFileResult = {
    fileName: string;
    status: 'ok' | 'failed';
    answerCount?: number;
    reason?: string;
};

export async function POST(
    request: NextRequest,
    props: { params: Promise<{ id: string }> }
) {
    const { id: projectId } = await props.params;
    const accessResult = await requireProjectAccess(request, projectId, { write: true });
    if (accessResult instanceof NextResponse) return accessResult;

    try {
        const formData = await request.formData();
        const uploadedFiles = formData.getAll('files');
        if (uploadedFiles.length === 0) {
            return NextResponse.json(
                { error: '업로드할 HTML 응답지를 선택하세요.' },
                { status: 400 }
            );
        }
        if (uploadedFiles.length > MAX_OFFLINE_HTML_FILES) {
            return NextResponse.json(
                { error: '한 번에 100장까지 올릴 수 있습니다.' },
                { status: 400 }
            );
        }

        const writePolicy = parseWritePolicy(formData.get('writePolicy'));
        const requirements = await prisma.customerRequirement.findMany({
            where: { projectId },
            orderBy: { order: 'asc' },
            select: { id: true },
        });
        if (requirements.length === 0) {
            return NextResponse.json(
                { error: '먼저 고객요구사항을 등록하세요.' },
                { status: 400 }
            );
        }

        const results: OfflineUploadFileResult[] = [];
        const answers: ParsedKanoUploadAnswer[] = [];
        const respondentEmails = new Set<string>();

        // 파일별 오류를 해당 파일에 귀속하고 순번 기반 익명 이메일도 안정적으로 유지해야 한다.
        for (let index = 0; index < uploadedFiles.length; index += 1) {
            const uploadValue = uploadedFiles[index];
            const guarded = guardUploadedOfflineHtml(uploadValue);
            const fileName = guarded.ok
                ? (guarded.file.name || '(이름 없음)').slice(0, 100)
                : (uploadValue instanceof File
                    ? (uploadValue.name || '(이름 없음)').slice(0, 100)
                    : '(이름 없음)');

            if (!guarded.ok) {
                results.push({
                    fileName,
                    status: 'failed',
                    reason: guarded.failure.error,
                });
                continue;
            }

            const html = await guarded.file.text();
            const parsed = parseKanoOfflineResponseHtml(html, {
                requirementCount: requirements.length,
                projectId,
                fallbackEmail: `offline-html-${index + 1}@import.local`,
            });
            if (!parsed.ok) {
                results.push({ fileName, status: 'failed', reason: parsed.error });
                continue;
            }

            if (respondentEmails.has(parsed.respondentEmail)) {
                results.push({
                    fileName,
                    status: 'failed',
                    reason: '같은 응답자의 응답지가 이 묶음에 이미 있습니다.',
                });
                continue;
            }

            respondentEmails.add(parsed.respondentEmail);
            answers.push(...parsed.answers);
            results.push({ fileName, status: 'ok', answerCount: parsed.answers.length });
        }

        const okCount = results.filter((result) => result.status === 'ok').length;
        if (okCount === 0) {
            return NextResponse.json(
                { error: '저장할 수 있는 응답지가 없습니다.', results },
                { status: 400 }
            );
        }

        // replace 정책이 앞서 저장한 파일을 지우지 않도록 성공분 전체를 한 트랜잭션에 맡긴다.
        const persisted = await persistKanoUploadAnswers({
            projectId,
            invitedBy: accessResult.user.userId,
            writePolicy,
            requirements,
            answers,
        });
        const fileCount = uploadedFiles.length;

        return NextResponse.json({
            success: true,
            message: `${fileCount}장 중 ${okCount}장에서 ${persisted.respondentCount}명 응답자의 ${persisted.importedCount}개 Kano 응답을 업로드했습니다.`,
            respondentCount: persisted.respondentCount,
            importedCount: persisted.importedCount,
            fileCount,
            results,
        });
    } catch (error) {
        log.error('오프라인 응답지 업로드 실패', error, { projectId });
        return NextResponse.json(
            { error: '오프라인 응답지 업로드에 실패했습니다.' },
            { status: 500 }
        );
    }
}
