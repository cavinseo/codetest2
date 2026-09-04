// 오프라인 Kano 답변 파일을 검증하고 수입하는 API 라우트다.
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireProjectAccess } from '@/lib/authorization';
import { createLogger } from '@/lib/logger';
import { toErrorResponse } from '@/lib/api-error';
import { guardUploadedFile } from '@/lib/upload-guard';
import { KANO_ANSWER_SCORE } from '@/lib/constants';
import { buildKanoOfflineSurveyModel } from '@/lib/kano-offline-survey';
import {
    describeKanoQuestionSetChange, findDuplicateKanoOfflineFiles, kanoOfflineInvitationToken,
    parseKanoOfflineResponseText, reconcileKanoOfflineResponse, resolveKanoOfflineRespondentEmail,
    type KanoOfflineResponseFile,
} from '@/lib/kano-offline-response';
import { importKanoResponses, type KanoImportRespondent } from '@/lib/kano-response-import';

const log = createLogger('api/kano-offline-responses');
// Vercel 서버리스의 본문 상한(약 4.5 MB)과 실행 시간 안에 들어야 한다. 답변 HTML 은 문항당
// 약 2.3 KB 라 100문항이어도 250 KB 안팎이고, 10 × 400 KB = 4 MB 로 상한 아래다. 화면이 10개씩 나눠 보낸다.
const MAX_FILES = 10;
const MAX_FILE_BYTES = 400 * 1024;
// 답변 HTML 이 기본 경로, .json 은 「내용 복사」 폴백. 업로드된 HTML 은 파싱만 하고 어디에도 렌더하지 않는다.
const FILE_RULE = { extensions: ['.html', '.htm', '.json'], maxBytes: MAX_FILE_BYTES, label: '답변' };

export const maxDuration = 60;

type FailureCode =
    | 'GUARD' | 'PARSE' | 'WRONG_PROJECT' | 'UNKNOWN_REQUIREMENT'
    | 'DUPLICATE_IN_BATCH' | 'RESPONDENT_EXISTS';

interface FileFailure { index: number; fileName: string; code: FailureCode; detail?: string }

// 오프라인 답변 파일(.kano.json)을 여러 개 받아 응답 기록을 만든다. 파일 단위로 판정하고
// 통과한 파일만 한 트랜잭션으로 쓴다 — 담당자가 폴더째 올리는 현실에서 한 장 때문에
// 전부 막히는 것과, 한 장이 조용히 빠지는 것을 둘 다 피하기 위해 실패 목록을 함께 돌려준다.
export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
    const { id: projectId } = await props.params;
    const accessResult = await requireProjectAccess(request, projectId, { write: true });
    if (accessResult instanceof NextResponse) return accessResult;

    try {
        const formData = await request.formData();
        const entries = formData.getAll('files');
        if (entries.length === 0) return NextResponse.json({ error: '업로드할 답변 파일이 필요합니다.' }, { status: 400 });
        if (entries.length > MAX_FILES) return NextResponse.json({ error: `한 번에 ${MAX_FILES}개까지 올릴 수 있습니다.` }, { status: 400 });
        const acceptQuestionSetMismatch = formData.get('acceptQuestionSetMismatch') === 'true';
        // 파일별 덮어쓰기 승인. 인덱스 목록("0,3") — 이메일을 폼에 다시 실어 보내지 않기 위해 인덱스로 가리킨다.
        const overwriteFiles = new Set(String(formData.get('overwriteFiles') ?? '').split(',').filter(Boolean).map(Number));

        const requirements = await prisma.customerRequirement.findMany({
            where: { projectId },
            orderBy: { order: 'asc' },
            select: { id: true, requirement: true, category: true, kanoPositiveQ: true, kanoNegativeQ: true },
        });
        if (requirements.length === 0) return NextResponse.json({ error: '먼저 고객요구사항을 등록하세요.' }, { status: 400 });
        const model = buildKanoOfflineSurveyModel({ projectId, projectName: '', requirements });
        const requirementIdsByTextHash = new Map<string, string[]>();
        for (const q of model.questions) requirementIdsByTextHash.set(q.t, [...(requirementIdsByTextHash.get(q.t) ?? []), q.id]);
        const current = {
            projectId,
            questionSetHash: model.questionSetHash,
            questionHashById: new Map(model.questions.map((q) => [q.id, q.h])),
            requirementIdsByTextHash,
        };

        const failures: FileFailure[] = [];
        const parsed: Array<{ index: number; fileName: string; file: KanoOfflineResponseFile }> = [];
        for (const [index, entry] of entries.entries()) {
            const guard = guardUploadedFile(entry, FILE_RULE);
            const fileName = entry instanceof File ? entry.name : `file-${index}`;
            if (!guard.ok) { failures.push({ index, fileName, code: 'GUARD', detail: guard.failure.error }); continue; }
            const result = parseKanoOfflineResponseText(await guard.file.text());
            if (!result.ok) { failures.push({ index, fileName, code: 'PARSE', detail: result.reason }); continue; }
            parsed.push({ index, fileName, file: result.file });
        }

        // 질문 세트 대조. 하나라도 어긋나면 수락 플래그 없이는 전체를 멈춘다 — 대개 전 파일이 같은 배포본이다.
        const reconciled = parsed.map((p) => ({ ...p, outcome: reconcileKanoOfflineResponse(p.file, current) }));
        const changedFiles = reconciled.filter((r) => r.outcome.status === 'question-set-changed');
        if (changedFiles.length > 0 && !acceptQuestionSetMismatch) {
            const summary = describeKanoQuestionSetChange(changedFiles[0].file.questions, current.questionHashById);
            return NextResponse.json({
                error: '설문 배포 후 질문이 바뀌어 답을 그대로 등록할 수 없습니다.',
                code: 'QUESTION_SET_CHANGED',
                ...summary,
                affectedFiles: changedFiles.map((r) => r.fileName),
            }, { status: 409 });
        }

        const candidates: Array<{ index: number; fileName: string; file: KanoOfflineResponseFile; answers: KanoOfflineResponseFile['answers']; dropped: number; rematched: number }> = [];
        for (const r of reconciled) {
            if (r.outcome.status === 'wrong-project') failures.push({ index: r.index, fileName: r.fileName, code: 'WRONG_PROJECT' });
            else if (r.outcome.status === 'unknown-requirement') failures.push({ index: r.index, fileName: r.fileName, code: 'UNKNOWN_REQUIREMENT' });
            else if (r.outcome.status === 'ok') candidates.push({ ...r, answers: r.outcome.answers, dropped: 0, rematched: 0 });
            else if (r.outcome.matched.length === 0) failures.push({ index: r.index, fileName: r.fileName, code: 'UNKNOWN_REQUIREMENT' });
            else candidates.push({ ...r, answers: r.outcome.matched, dropped: r.outcome.dropped, rematched: r.outcome.rematched });
        }

        for (const dupIndex of findDuplicateKanoOfflineFiles(candidates.map((c) => c.file))) {
            const c = candidates[dupIndex];
            failures.push({ index: c.index, fileName: c.fileName, code: 'DUPLICATE_IN_BATCH' });
        }
        const deduped = candidates.filter((c) => !failures.some((f) => f.index === c.index));

        // 다른 경로(온라인·엑셀·구글폼)로 이미 존재하는 이메일은 파일별 승인 없이는 덮어쓰지 않는다 — 파일의
        // 이메일은 자기 신고 값이라 사칭으로 타인의 응답을 지울 수 있다. 같은 오프라인 경로(offline_ 토큰)는 재수입으로 본다.
        // 대소문자는 DB 질의가 아니라 자바스크립트에서 맞춘다. 이 저장소가 mode:'insensitive' 를
        // 쓰는 곳은 전부 equals 이고(app/api/admin/users/route.ts:269 등), in 필터에서 어떻게
        // 동작하는지는 실DB 없이 확인할 수 없다 — 확인 못 한 동작에 사칭 방어를 걸지 않는다.
        // 초대는 프로젝트당 많아야 수백 건이라 두 컬럼만 읽어 비교해도 싸다.
        const existing = deduped.length === 0 ? [] : await prisma.kanoSurveyInvitation.findMany({
            where: { projectId },
            select: { email: true, token: true },
        });
        const foreign = new Set(existing.filter((inv) => !inv.token.startsWith('offline_')).map((inv) => inv.email.toLowerCase()));
        const respondents: KanoImportRespondent[] = [];
        let droppedAnswerCount = 0;
        let rematchedAnswerCount = 0;
        for (const c of deduped) {
            const email = resolveKanoOfflineRespondentEmail(c.file);
            if (foreign.has(email) && !overwriteFiles.has(c.index)) {
                failures.push({ index: c.index, fileName: c.fileName, code: 'RESPONDENT_EXISTS' });
                continue;
            }
            droppedAnswerCount += c.dropped;
            rematchedAnswerCount += c.rematched;
            respondents.push({
                email,
                respondedAt: c.file.submittedAt,
                token: kanoOfflineInvitationToken(c.file),
                answers: c.answers.map((a) => ({ requirementId: a.requirementId, positiveAnswer: KANO_ANSWER_SCORE[a.functional], negativeAnswer: KANO_ANSWER_SCORE[a.dysfunctional] })),
            });
        }

        if (respondents.length === 0) {
            return NextResponse.json({ error: '등록할 수 있는 답변 파일이 없습니다.', failures }, { status: 400 });
        }

        const result = await prisma.$transaction((tx) => importKanoResponses(tx as unknown as Parameters<typeof importKanoResponses>[0], respondents, {
            projectId,
            invitedBy: accessResult.user.userId,
            tokenPrefix: 'offline',
            writePolicy: 'append',
            // 즉시 만료: 리셋으로 respondedAt 이 비어도 이 초대로는 온라인 응답을 할 수 없어야 한다.
            invitationExpiresAt: (now) => now,
        }), { timeout: 60_000, maxWait: 10_000 });

        log.info('오프라인 답변 파일 업로드', { projectId, fileCount: entries.length, ...result, droppedAnswerCount, rematchedAnswerCount, failedCount: failures.length });
        return NextResponse.json({
            success: true,
            message: `${result.respondentCount}명 응답자의 ${result.importedCount}개 응답을 등록했습니다.`,
            ...result,
            droppedAnswerCount,
            rematchedAnswerCount,
            failures,
        });
    } catch (error) {
        return toErrorResponse(error, { log, message: '오프라인 답변 파일 업로드에 실패했습니다.', context: { projectId } });
    }
}
