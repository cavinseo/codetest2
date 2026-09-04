// 오프라인 Kano 응답 파일의 파싱·대조·식별자 헬퍼 계약을 검증한다.
import { describe, expect, it, vi } from 'vitest';
import {
    KANO_OFFLINE_MAX_ANSWERS,
    describeKanoQuestionSetChange,
    extractKanoOfflinePayloadText,
    findDuplicateKanoOfflineFiles,
    kanoOfflineInvitationToken,
    parseKanoOfflineResponseText,
    reconcileKanoOfflineResponse,
    resolveKanoOfflineRespondentEmail,
    type KanoCurrentQuestionSet,
    type KanoOfflineResponseFile,
} from '../lib/kano-offline-response';

const NOW = new Date('2026-09-04T12:00:00.000Z');
const UUID = '123e4567-e89b-42d3-a456-426614174000';
const SET_HASH = 'a'.repeat(64);
const OTHER_SET_HASH = 'b'.repeat(64);
const H1 = '1'.repeat(16);
const H2 = '2'.repeat(16);
const H3 = '3'.repeat(16);
const T1 = 'a'.repeat(16);
const T2 = 'b'.repeat(16);
const T3 = 'c'.repeat(16);

function validPayload(): Record<string, unknown> {
    return {
        format: 'kano-offline-response',
        version: 1,
        projectId: 'project-1',
        questionSetHash: SET_HASH,
        questions: [{ id: 'req-1', h: H1, t: T1 }],
        submissionId: UUID,
        exportedAt: '2026-09-04T08:00:00.000Z',
        submittedAt: '2026-09-04T09:00:00.000Z',
        respondentEmail: null,
        answers: [{ requirementId: 'req-1', functional: 'LIKE', dysfunctional: 'DISLIKE' }],
    };
}

function payloadText(overrides: Record<string, unknown> = {}): string {
    return JSON.stringify({ ...validPayload(), ...overrides });
}

function expectFailure(rawText: string, reason: string): void {
    expect(parseKanoOfflineResponseText(rawText, NOW)).toEqual({ ok: false, reason });
}

function responseIsland(text: string): string {
    return '<script type="application/json" id="kano-offline-response">' + text + '</script>';
}

function parseSuccess(rawText = payloadText()): KanoOfflineResponseFile {
    const result = parseKanoOfflineResponseText(rawText, NOW);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.reason);
    return result.file;
}

function makeFile(overrides: Partial<KanoOfflineResponseFile> = {}): KanoOfflineResponseFile {
    return {
        projectId: 'project-1',
        questionSetHash: SET_HASH,
        questions: [{ id: 'req-1', h: H1, t: T1 }],
        submissionId: UUID,
        submittedAt: new Date('2026-09-04T09:00:00.000Z'),
        respondentEmail: null,
        answers: [{ requirementId: 'req-1', functional: 'LIKE', dysfunctional: 'DISLIKE' }],
        ...overrides,
    };
}

function makeCurrent(overrides: Partial<KanoCurrentQuestionSet> = {}): KanoCurrentQuestionSet {
    return {
        projectId: 'project-1',
        questionSetHash: SET_HASH,
        questionHashById: new Map([['req-1', H1]]),
        requirementIdsByTextHash: new Map([[T1, ['req-1']]]),
        ...overrides,
    };
}

describe('extractKanoOfflinePayloadText', () => {
    it('빈 문자열을 empty로 거절한다', () => {
        expect(extractKanoOfflinePayloadText('')).toEqual({ ok: false, reason: 'empty' });
    });

    it('BOM만 있는 문자열을 empty로 거절한다', () => {
        expect(extractKanoOfflinePayloadText('\uFEFF')).toEqual({ ok: false, reason: 'empty' });
    });

    it('BOM과 앞뒤 공백을 제거한 JSON을 돌려준다', () => {
        expect(extractKanoOfflinePayloadText('\uFEFF  {"ok":true}  ')).toEqual({
            ok: true,
            text: '{"ok":true}',
        });
    });

    it('JSON 내부의 BOM은 제거하지 않는다', () => {
        const json = payloadText();
        expectFailure(json.slice(0, 1) + '\uFEFF' + json.slice(1), 'not-json');
    });

    it('HTML에 응답 섬이 없으면 html-no-island로 거절한다', () => {
        expect(extractKanoOfflinePayloadText('<html><body>없음</body></html>')).toEqual({
            ok: false,
            reason: 'html-no-island',
        });
    });

    it('응답 섬이 모두 비어 있으면 survey-file로 거절한다', () => {
        const html = responseIsland('  ') + responseIsland('\n');
        expect(extractKanoOfflinePayloadText(html)).toEqual({ ok: false, reason: 'survey-file' });
    });

    it('채워진 응답 섬의 JSON을 파싱한다', () => {
        const file = parseSuccess('<!DOCTYPE html>' + responseIsland(payloadText()));
        expect(file.projectId).toBe('project-1');
        expect(file.answers).toHaveLength(1);
    });

    it('빈 섬과 채워진 섬이 함께 있으면 채워진 것을 쓴다', () => {
        const html = '<html>' + responseIsland('') + responseIsland(payloadText({ projectId: 'filled' })) + '</html>';
        expect(parseSuccess(html).projectId).toBe('filled');
    });

    it('채워진 섬이 여러 개면 마지막 것을 쓴다', () => {
        const html = '<html>'
            + responseIsland(payloadText({ projectId: 'first' }))
            + responseIsland(payloadText({ projectId: 'last' }))
            + '</html>';
        expect(parseSuccess(html).projectId).toBe('last');
    });

    it('섬 안의 이스케이프된 여는 꺾쇠를 JSON.parse가 복원한다', () => {
        const escaped = payloadText({ projectId: '</script>' }).replace('</script>', '\\u003c/script>');
        expect(parseSuccess('<html>' + responseIsland(escaped) + '</html>').projectId).toBe('</script>');
    });
});

describe('parseKanoOfflineResponseText 실패 사유', () => {
    it('빈 입력은 empty다', () => {
        expectFailure('   ', 'empty');
    });

    it('응답 섬 없는 HTML은 html-no-island다', () => {
        expectFailure('<html></html>', 'html-no-island');
    });

    it('빈 응답 섬 HTML은 survey-file이다', () => {
        expectFailure('<html>' + responseIsland('') + '</html>', 'survey-file');
    });

    it('깨진 JSON은 not-json이다', () => {
        expectFailure('{broken', 'not-json');
    });

    it('배열 JSON은 not-json이다', () => {
        expectFailure('[]', 'not-json');
    });

    it('숫자 JSON은 not-json이다', () => {
        expectFailure('1', 'not-json');
    });

    it('format이 다르면 format이다', () => {
        expectFailure(payloadText({ format: 'other' }), 'format');
    });

    it('version이 다르면 version이다', () => {
        expectFailure(payloadText({ version: 2 }), 'version');
    });

    it('projectId가 빈 문자열이면 project-id다', () => {
        expectFailure(payloadText({ projectId: '' }), 'project-id');
    });

    it('projectId가 문자열이 아니면 project-id다', () => {
        expectFailure(payloadText({ projectId: 1 }), 'project-id');
    });

    it('questionSetHash가 문자열이 아니면 question-set-hash다', () => {
        expectFailure(payloadText({ questionSetHash: null }), 'question-set-hash');
    });

    it('questionSetHash가 63자면 question-set-hash다', () => {
        expectFailure(payloadText({ questionSetHash: 'a'.repeat(63) }), 'question-set-hash');
    });

    it('questionSetHash가 배열이면 문자열처럼 변환돼도 question-set-hash다', () => {
        expectFailure(payloadText({ questionSetHash: [SET_HASH] }), 'question-set-hash');
    });

    it('questionSetHash 앞에 문자가 더 있으면 question-set-hash다', () => {
        expectFailure(payloadText({ questionSetHash: 'x' + SET_HASH }), 'question-set-hash');
    });

    it('questionSetHash 뒤에 문자가 더 있으면 question-set-hash다', () => {
        expectFailure(payloadText({ questionSetHash: SET_HASH + 'x' }), 'question-set-hash');
    });

    it('questionSetHash에 대문자가 있으면 question-set-hash다', () => {
        expectFailure(payloadText({ questionSetHash: 'A'.repeat(64) }), 'question-set-hash');
    });

    it('questions가 배열이 아니면 questions다', () => {
        expectFailure(payloadText({ questions: {} }), 'questions');
    });

    it('questions 원소가 객체가 아니면 questions다', () => {
        expectFailure(payloadText({ questions: [null] }), 'questions');
    });

    it('questions에 정상 원소와 잘못된 원소가 섞여도 questions다', () => {
        expectFailure(payloadText({
            questions: [{ id: 'req-1', h: H1, t: T1 }, null],
        }), 'questions');
    });

    it('questions id가 비어 있으면 questions다', () => {
        expectFailure(payloadText({ questions: [{ id: ' ', h: H1, t: T1 }] }), 'questions');
    });

    it('questions id가 문자열이 아니면 questions다', () => {
        expectFailure(payloadText({ questions: [{ id: 1, h: H1, t: T1 }] }), 'questions');
    });

    it('questions h가 문자열이 아니면 questions다', () => {
        expectFailure(payloadText({ questions: [{ id: 'req-1', h: null, t: T1 }] }), 'questions');
    });

    it('questions h가 배열이면 문자열처럼 변환돼도 questions다', () => {
        expectFailure(payloadText({ questions: [{ id: 'req-1', h: [H1], t: T1 }] }), 'questions');
    });

    it('questions h가 15자면 questions다', () => {
        expectFailure(payloadText({ questions: [{ id: 'req-1', h: '1'.repeat(15), t: T1 }] }), 'questions');
    });

    it('questions h 앞에 문자가 더 있으면 questions다', () => {
        expectFailure(payloadText({ questions: [{ id: 'req-1', h: 'x' + H1, t: T1 }] }), 'questions');
    });

    it('questions h 뒤에 문자가 더 있으면 questions다', () => {
        expectFailure(payloadText({ questions: [{ id: 'req-1', h: H1 + 'x', t: T1 }] }), 'questions');
    });

    it('questions t가 없으면 questions다', () => {
        expectFailure(payloadText({ questions: [{ id: 'req-1', h: H1 }] }), 'questions');
    });

    it('questions t가 배열이면 문자열처럼 변환돼도 questions다', () => {
        expectFailure(payloadText({ questions: [{ id: 'req-1', h: H1, t: [T1] }] }), 'questions');
    });

    it('questions t가 15자면 questions다', () => {
        expectFailure(payloadText({ questions: [{ id: 'req-1', h: H1, t: 'a'.repeat(15) }] }), 'questions');
    });

    it('questions t 앞에 문자가 더 있으면 questions다', () => {
        expectFailure(payloadText({ questions: [{ id: 'req-1', h: H1, t: 'x' + T1 }] }), 'questions');
    });

    it('questions t 뒤에 문자가 더 있으면 questions다', () => {
        expectFailure(payloadText({ questions: [{ id: 'req-1', h: H1, t: T1 + 'x' }] }), 'questions');
    });

    it('submissionId가 문자열이 아니면 submission-id다', () => {
        expectFailure(payloadText({ submissionId: null }), 'submission-id');
    });

    it('submissionId가 배열이면 문자열처럼 변환돼도 submission-id다', () => {
        expectFailure(payloadText({ submissionId: [UUID] }), 'submission-id');
    });

    it('submissionId에 하이픈이 없으면 submission-id다', () => {
        expectFailure(payloadText({ submissionId: UUID.replace(/-/g, '') }), 'submission-id');
    });

    it('submissionId 앞에 문자가 더 있으면 submission-id다', () => {
        expectFailure(payloadText({ submissionId: 'x' + UUID }), 'submission-id');
    });

    it('submissionId 뒤에 문자가 더 있으면 submission-id다', () => {
        expectFailure(payloadText({ submissionId: UUID + 'x' }), 'submission-id');
    });

    it('UUID 버전이 범위를 벗어나면 submission-id다', () => {
        expectFailure(payloadText({ submissionId: '123e4567-e89b-02d3-a456-426614174000' }), 'submission-id');
    });

    it('UUID variant가 범위를 벗어나면 submission-id다', () => {
        expectFailure(payloadText({ submissionId: '123e4567-e89b-42d3-7456-426614174000' }), 'submission-id');
    });

    it('이메일이 문자열이 아니면 email이다', () => {
        expectFailure(payloadText({ respondentEmail: 1 }), 'email');
    });

    it('이메일 모양이 아니면 email이다', () => {
        expectFailure(payloadText({ respondentEmail: 'not-an-email' }), 'email');
    });

    it('앞에 잘못된 주소가 붙은 이메일은 email이다', () => {
        expectFailure(payloadText({ respondentEmail: 'bad@user@example.com' }), 'email');
    });

    it('뒤에 잘못된 주소가 붙은 이메일은 email이다', () => {
        expectFailure(payloadText({ respondentEmail: 'user@example.com@bad' }), 'email');
    });

    it('공백뿐인 이메일은 email이다', () => {
        expectFailure(payloadText({ respondentEmail: '   ' }), 'email');
    });

    it('answers가 배열이 아니면 answers-empty다', () => {
        expectFailure(payloadText({ answers: {} }), 'answers-empty');
    });

    it('answers가 빈 배열이면 answers-empty다', () => {
        expectFailure(payloadText({ answers: [] }), 'answers-empty');
    });

    it('answers가 301개면 answers-too-many다', () => {
        const answers = Array.from({ length: KANO_OFFLINE_MAX_ANSWERS + 1 }, (_, index) => ({
            requirementId: 'req-' + index,
            functional: 'LIKE',
            dysfunctional: 'DISLIKE',
        }));
        expectFailure(payloadText({ answers }), 'answers-too-many');
    });

    it('answer가 객체가 아니면 answer-shape다', () => {
        expectFailure(payloadText({ answers: [null] }), 'answer-shape');
    });

    it('answer requirementId가 비어 있으면 answer-shape다', () => {
        expectFailure(payloadText({
            answers: [{ requirementId: ' ', functional: 'LIKE', dysfunctional: 'DISLIKE' }],
        }), 'answer-shape');
    });

    it('answer requirementId가 문자열이 아니면 answer-shape다', () => {
        expectFailure(payloadText({
            answers: [{ requirementId: 1, functional: 'LIKE', dysfunctional: 'DISLIKE' }],
        }), 'answer-shape');
    });

    it('functional이 문자열이 아니면 answer-value다', () => {
        expectFailure(payloadText({
            answers: [{ requirementId: 'req-1', functional: 1, dysfunctional: 'DISLIKE' }],
        }), 'answer-value');
    });

    it('dysfunctional이 문자열이 아니면 answer-value다', () => {
        expectFailure(payloadText({
            answers: [{ requirementId: 'req-1', functional: 'LIKE', dysfunctional: 1 }],
        }), 'answer-value');
    });

    it('functional 소문자 값은 answer-value다', () => {
        expectFailure(payloadText({
            answers: [{ requirementId: 'req-1', functional: 'like', dysfunctional: 'DISLIKE' }],
        }), 'answer-value');
    });

    it('dysfunctional 소문자 값은 answer-value다', () => {
        expectFailure(payloadText({
            answers: [{ requirementId: 'req-1', functional: 'LIKE', dysfunctional: 'dislike' }],
        }), 'answer-value');
    });

    it('requirementId가 중복되면 answer-duplicate다', () => {
        expectFailure(payloadText({
            answers: [
                { requirementId: 'req-1', functional: 'LIKE', dysfunctional: 'DISLIKE' },
                { requirementId: 'req-1', functional: 'EXPECT', dysfunctional: 'TOLERATE' },
            ],
        }), 'answer-duplicate');
    });
});

describe('parseKanoOfflineResponseText 성공', () => {
    it('유효한 JSON을 정규화된 응답 파일로 만든다', () => {
        const file = parseSuccess();
        expect(file).toEqual({
            projectId: 'project-1',
            questionSetHash: SET_HASH,
            questions: [{ id: 'req-1', h: H1, t: T1 }],
            submissionId: UUID,
            submittedAt: new Date('2026-09-04T09:00:00.000Z'),
            respondentEmail: null,
            answers: [{ requirementId: 'req-1', functional: 'LIKE', dysfunctional: 'DISLIKE' }],
        });
    });

    it('대문자 UUID는 허용하고 소문자로 정규화한다', () => {
        expect(parseSuccess(payloadText({ submissionId: UUID.toUpperCase() })).submissionId).toBe(UUID);
    });

    it('미래 10분의 submittedAt은 now로 대체한다', () => {
        expect(parseSuccess(payloadText({ submittedAt: '2026-09-04T12:10:00.000Z' })).submittedAt).toEqual(NOW);
    });

    it('미래 4분의 submittedAt은 유지한다', () => {
        expect(parseSuccess(payloadText({ submittedAt: '2026-09-04T12:04:00.000Z' })).submittedAt).toEqual(
            new Date('2026-09-04T12:04:00.000Z')
        );
    });

    it('정확히 미래 5분의 submittedAt은 유지한다', () => {
        expect(parseSuccess(payloadText({ submittedAt: '2026-09-04T12:05:00.000Z' })).submittedAt).toEqual(
            new Date('2026-09-04T12:05:00.000Z')
        );
    });

    it('파싱할 수 없는 submittedAt은 now로 대체한다', () => {
        expect(parseSuccess(payloadText({ submittedAt: 'not-a-date' })).submittedAt).toEqual(NOW);
    });

    it('문자열이 아닌 submittedAt은 now로 대체한다', () => {
        expect(parseSuccess(payloadText({ submittedAt: 1 })).submittedAt).toEqual(NOW);
    });

    it('이메일을 trim하고 소문자로 만든다', () => {
        expect(parseSuccess(payloadText({ respondentEmail: ' Hong@X.COM ' })).respondentEmail).toBe('hong@x.com');
    });

    it('도메인 이름이 여러 글자인 이메일을 허용한다', () => {
        expect(parseSuccess(payloadText({ respondentEmail: 'User@Example.COM' })).respondentEmail).toBe(
            'user@example.com'
        );
    });

    it('null 이메일은 익명으로 유지한다', () => {
        expect(parseSuccess(payloadText({ respondentEmail: null })).respondentEmail).toBeNull();
    });

    it('누락된 이메일은 익명으로 유지한다', () => {
        expect(parseSuccess(payloadText({ respondentEmail: undefined })).respondentEmail).toBeNull();
    });

    it('빈 이메일은 익명으로 유지한다', () => {
        expect(parseSuccess(payloadText({ respondentEmail: '' })).respondentEmail).toBeNull();
    });

    it('questions와 answers의 허용 필드만 결과에 담는다', () => {
        const file = parseSuccess(payloadText({
            questions: [{ id: 'req-1', h: H1, t: T1, secret: 'drop' }],
            answers: [{
                requirementId: 'req-1',
                functional: 'NEUTRAL',
                dysfunctional: 'TOLERATE',
                secret: 'drop',
            }],
        }));
        expect(file.questions).toEqual([{ id: 'req-1', h: H1, t: T1 }]);
        expect(file.answers).toEqual([{
            requirementId: 'req-1',
            functional: 'NEUTRAL',
            dysfunctional: 'TOLERATE',
        }]);
    });

    it('answers 300개를 허용한다', () => {
        const answers = Array.from({ length: KANO_OFFLINE_MAX_ANSWERS }, (_, index) => ({
            requirementId: 'req-' + index,
            functional: 'LIKE',
            dysfunctional: 'DISLIKE',
        }));
        expect(parseSuccess(payloadText({ answers })).answers).toHaveLength(KANO_OFFLINE_MAX_ANSWERS);
    });
});

describe('reconcileKanoOfflineResponse', () => {
    it('프로젝트가 다르면 wrong-project다', () => {
        expect(reconcileKanoOfflineResponse(makeFile({ projectId: 'other' }), makeCurrent())).toEqual({
            status: 'wrong-project',
        });
    });

    it('세트 해시가 같아도 미지 id가 있으면 unknown-requirement다', () => {
        const file = makeFile({
            answers: [
                { requirementId: 'unknown-1', functional: 'LIKE', dysfunctional: 'DISLIKE' },
                { requirementId: 'unknown-2', functional: 'EXPECT', dysfunctional: 'TOLERATE' },
            ],
        });
        expect(reconcileKanoOfflineResponse(file, makeCurrent())).toEqual({
            status: 'unknown-requirement',
            unknownIds: ['unknown-1', 'unknown-2'],
        });
    });

    it('세트 해시와 id가 모두 맞으면 답을 전부 돌려준다', () => {
        const file = makeFile();
        expect(reconcileKanoOfflineResponse(file, makeCurrent())).toEqual({
            status: 'ok',
            answers: file.answers,
            dropped: 0,
            rematched: 0,
        });
    });

    it('세트가 바뀌면 h가 같은 현재 id만 유지한다', () => {
        const file = makeFile({
            questionSetHash: OTHER_SET_HASH,
            questions: [
                { id: 'req-1', h: H1, t: T1 },
                { id: 'req-2', h: H2, t: T2 },
            ],
            answers: [
                { requirementId: 'req-1', functional: 'LIKE', dysfunctional: 'DISLIKE' },
                { requirementId: 'req-2', functional: 'EXPECT', dysfunctional: 'TOLERATE' },
            ],
        });
        const current = makeCurrent({
            questionHashById: new Map([['req-1', H1], ['req-2', H3]]),
            requirementIdsByTextHash: new Map([[T1, ['req-1']], [T2, ['req-2']]]),
        });
        expect(reconcileKanoOfflineResponse(file, current)).toEqual({
            status: 'question-set-changed',
            matched: [file.answers[0]],
            dropped: 1,
            rematched: 0,
        });
    });

    it('현재 id의 문구가 바뀌면 같은 t가 있어도 버린다', () => {
        const file = makeFile({ questionSetHash: OTHER_SET_HASH });
        const current = makeCurrent({
            questionHashById: new Map([['req-1', H2]]),
            requirementIdsByTextHash: new Map([[T1, ['req-1']]]),
        });
        expect(reconcileKanoOfflineResponse(file, current)).toEqual({
            status: 'question-set-changed',
            matched: [],
            dropped: 1,
            rematched: 0,
        });
    });

    it('id가 전부 바뀌고 t가 각각 하나와 같으면 모두 재매칭한다', () => {
        const file = makeFile({
            questionSetHash: OTHER_SET_HASH,
            questions: [
                { id: 'old-1', h: H1, t: T1 },
                { id: 'old-2', h: H2, t: T2 },
            ],
            answers: [
                { requirementId: 'old-1', functional: 'LIKE', dysfunctional: 'DISLIKE' },
                { requirementId: 'old-2', functional: 'EXPECT', dysfunctional: 'TOLERATE' },
            ],
        });
        const current = makeCurrent({
            questionHashById: new Map([['new-1', H1], ['new-2', H2]]),
            requirementIdsByTextHash: new Map([[T1, ['new-1']], [T2, ['new-2']]]),
        });
        expect(reconcileKanoOfflineResponse(file, current)).toEqual({
            status: 'question-set-changed',
            matched: [
                { ...file.answers[0], requirementId: 'new-1' },
                { ...file.answers[1], requirementId: 'new-2' },
            ],
            dropped: 0,
            rematched: 2,
        });
    });

    it('같은 t의 현재 문항이 둘이면 재매칭하지 않는다', () => {
        const file = makeFile({
            questionSetHash: OTHER_SET_HASH,
            questions: [{ id: 'old', h: H1, t: T1 }],
            answers: [{ requirementId: 'old', functional: 'LIKE', dysfunctional: 'DISLIKE' }],
        });
        const current = makeCurrent({
            questionHashById: new Map([['new-1', H1], ['new-2', H2]]),
            requirementIdsByTextHash: new Map([[T1, ['new-1', 'new-2']]]),
        });
        expect(reconcileKanoOfflineResponse(file, current)).toEqual({
            status: 'question-set-changed',
            matched: [],
            dropped: 1,
            rematched: 0,
        });
    });

    it('재매칭된 현재 id는 두 번 쓰지 않는다', () => {
        const file = makeFile({
            questionSetHash: OTHER_SET_HASH,
            questions: [
                { id: 'old-1', h: H1, t: T1 },
                { id: 'old-2', h: H2, t: T1 },
            ],
            answers: [
                { requirementId: 'old-1', functional: 'LIKE', dysfunctional: 'DISLIKE' },
                { requirementId: 'old-2', functional: 'EXPECT', dysfunctional: 'TOLERATE' },
            ],
        });
        const current = makeCurrent({
            questionHashById: new Map([['new-1', H3]]),
            requirementIdsByTextHash: new Map([[T1, ['new-1']]]),
        });
        expect(reconcileKanoOfflineResponse(file, current)).toEqual({
            status: 'question-set-changed',
            matched: [{ ...file.answers[0], requirementId: 'new-1' }],
            dropped: 1,
            rematched: 1,
        });
    });

    it('삭제 답이 앞서도 살아 있는 동일 문구 문항의 자리를 가로채지 않는다', () => {
        const deletedAnswer = { requirementId: 'deleted', functional: 'EXPECT' as const, dysfunctional: 'TOLERATE' as const };
        const liveAnswer = { requirementId: 'live', functional: 'LIKE' as const, dysfunctional: 'DISLIKE' as const };
        const file = makeFile({
            questionSetHash: OTHER_SET_HASH,
            questions: [
                { id: 'deleted', h: H1, t: T1 },
                { id: 'live', h: H2, t: T1 },
            ],
            answers: [deletedAnswer, liveAnswer],
        });
        const current = makeCurrent({
            questionHashById: new Map([['live', H2]]),
            requirementIdsByTextHash: new Map([[T1, ['live']]]),
        });
        const result = reconcileKanoOfflineResponse(file, current);

        expect(result).toEqual({
            status: 'question-set-changed',
            matched: [liveAnswer],
            dropped: 1,
            rematched: 0,
        });
        if (result.status === 'question-set-changed') {
            expect(result.matched.map((answer) => answer.requirementId)).toEqual(['live']);
        }
    });

    it('파일 questions에 설명이 없는 답은 버린다', () => {
        const file = makeFile({
            questionSetHash: OTHER_SET_HASH,
            questions: [],
        });
        expect(reconcileKanoOfflineResponse(file, makeCurrent())).toEqual({
            status: 'question-set-changed',
            matched: [],
            dropped: 1,
            rematched: 0,
        });
    });

    it('삭제된 문항에 t 후보가 없으면 dropped에 포함한다', () => {
        const file = makeFile({
            questionSetHash: OTHER_SET_HASH,
            questions: [{ id: 'deleted', h: H1, t: T3 }],
            answers: [{ requirementId: 'deleted', functional: 'LIKE', dysfunctional: 'DISLIKE' }],
        });
        expect(reconcileKanoOfflineResponse(file, makeCurrent({
            requirementIdsByTextHash: new Map(),
        }))).toEqual({
            status: 'question-set-changed',
            matched: [],
            dropped: 1,
            rematched: 0,
        });
    });
});

describe('오프라인 응답 식별자 헬퍼', () => {
    it('응답자 이메일이 있으면 그대로 쓴다', () => {
        expect(resolveKanoOfflineRespondentEmail(makeFile({ respondentEmail: 'user@example.com' }))).toBe(
            'user@example.com'
        );
    });

    it('이메일이 없으면 submissionId 앞 12자로 결정적 합성 이메일을 만든다', () => {
        const email = resolveKanoOfflineRespondentEmail(makeFile());
        expect(email).toBe('offline-123e4567e89b@import.local');
        expect(resolveKanoOfflineRespondentEmail(makeFile())).toBe(email);
        expect(email.split('@')[0]).toHaveLength('offline-'.length + 12);
    });

    it('초대 토큰에 offline_ 접두어를 붙인다', () => {
        expect(kanoOfflineInvitationToken(makeFile())).toBe('offline_' + UUID);
    });
});

describe('findDuplicateKanoOfflineFiles', () => {
    it('같은 이메일을 가진 두 파일의 인덱스를 돌려준다', () => {
        const files = [
            makeFile({ submissionId: 'id-1', respondentEmail: 'same@example.com' }),
            makeFile({ submissionId: 'id-2', respondentEmail: 'same@example.com' }),
        ];
        expect(findDuplicateKanoOfflineFiles(files)).toEqual([0, 1]);
    });

    it('같은 submissionId를 가진 두 파일의 인덱스를 돌려준다', () => {
        const files = [
            makeFile({ respondentEmail: 'one@example.com' }),
            makeFile({ respondentEmail: 'two@example.com' }),
        ];
        expect(findDuplicateKanoOfflineFiles(files)).toEqual([0, 1]);
    });

    it('이메일과 submissionId 중복이 겹쳐도 인덱스를 한 번씩 오름차순으로 돌려준다', () => {
        const files = [
            makeFile({ submissionId: 'shared', respondentEmail: 'same@example.com' }),
            makeFile({ submissionId: 'other', respondentEmail: 'same@example.com' }),
            makeFile({ submissionId: 'shared', respondentEmail: 'third@example.com' }),
        ];
        expect(findDuplicateKanoOfflineFiles(files)).toEqual([0, 1, 2]);
    });

    it('이메일이 없어도 서로 다른 submissionId면 중복이 아니다', () => {
        const files = [
            makeFile({ submissionId: '11111111-1111-4111-8111-111111111111' }),
            makeFile({ submissionId: '22222222-2222-4222-8222-222222222222' }),
        ];
        expect(findDuplicateKanoOfflineFiles(files)).toEqual([]);
    });

    it('빈 배치에는 중복이 없다', () => {
        expect(findDuplicateKanoOfflineFiles([])).toEqual([]);
    });

    it('중복 인덱스 정렬 비교기가 숫자 차를 사용한다', () => {
        const sortSpy = vi.spyOn(Array.prototype, 'sort');
        findDuplicateKanoOfflineFiles([
            makeFile({ submissionId: 'same', respondentEmail: 'same@example.com' }),
            makeFile({ submissionId: 'same', respondentEmail: 'same@example.com' }),
        ]);

        const compare = sortSpy.mock.calls[0]?.[0] as ((left: number, right: number) => number) | undefined;
        expect(compare).toBeTypeOf('function');
        expect(compare?.(1, 2)).toBe(-1);
        expect(compare?.(2, 1)).toBe(1);
        expect(compare?.(1, 1)).toBe(0);
        sortSpy.mockRestore();
    });
});

describe('describeKanoQuestionSetChange', () => {
    it('추가·삭제·변경 문항 수를 각각 센다', () => {
        expect(describeKanoQuestionSetChange(
            [
                { id: 'same', h: H1 },
                { id: 'changed', h: H2 },
                { id: 'removed', h: H3 },
            ],
            new Map([
                ['same', H1],
                ['changed', H3],
                ['added', H2],
            ])
        )).toEqual({ added: 1, removed: 1, changed: 1 });
    });

    it('세트가 같으면 모든 변화 수가 0이다', () => {
        expect(describeKanoQuestionSetChange(
            [{ id: 'same', h: H1 }],
            new Map([['same', H1]])
        )).toEqual({ added: 0, removed: 0, changed: 0 });
    });

    it('파일 문항이 없으면 현재 문항을 모두 added로 센다', () => {
        expect(describeKanoQuestionSetChange([], new Map([['a', H1], ['b', H2]]))).toEqual({
            added: 2,
            removed: 0,
            changed: 0,
        });
    });

    it('현재 문항이 없으면 파일 문항을 모두 removed로 센다', () => {
        expect(describeKanoQuestionSetChange(
            [{ id: 'a', h: H1 }, { id: 'b', h: H2 }],
            new Map()
        )).toEqual({ added: 0, removed: 2, changed: 0 });
    });
});
