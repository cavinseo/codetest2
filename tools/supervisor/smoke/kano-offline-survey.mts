// Task 8 Step 1 — 컨테이너 스모크.
//
// 렌더 → 실제 Chromium 왕복 → 서버가 쓰는 파서·대조까지를 한 번에 잇는다. 앞의 Task
// 감리는 각 조각을 따로 봤고, 여기서는 브라우저가 실제로 저장한 바이트가 서버 코드에
// 그대로 들어가는지를 본다. 네트워크는 file:// 말고 전부 끊는다 — 오프라인이 전제다.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
    buildKanoOfflineSurveyModel,
    renderKanoOfflineSurveyHtml,
    kanoOfflineSurveyFileName,
} from '../../../lib/kano-offline-survey.ts';
import {
    parseKanoOfflineResponseText,
    reconcileKanoOfflineResponse,
    resolveKanoOfflineRespondentEmail,
    kanoOfflineInvitationToken,
    describeKanoQuestionSetChange,
} from '../../../lib/kano-offline-response.ts';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kano-task8-'));
const step = (n: string, message: string) => console.log(`  ${n}. ${message}`);
const islands = (html: string) =>
    [...html.matchAll(/id="kano-offline-response">([\s\S]*?)<\/script>/g)].map((m) => m[1]);

// 라우트가 하는 것과 같은 방식으로 현재 질문 세트를 만든다(route.ts:56-63).
function currentSetOf(model: ReturnType<typeof buildKanoOfflineSurveyModel>) {
    const requirementIdsByTextHash = new Map<string, string[]>();
    for (const q of model.questions) {
        requirementIdsByTextHash.set(q.t, [...(requirementIdsByTextHash.get(q.t) ?? []), q.id]);
    }
    return {
        projectId: model.projectId,
        questionSetHash: model.questionSetHash,
        questionHashById: new Map(model.questions.map((q) => [q.id, q.h])),
        requirementIdsByTextHash,
    };
}

const REQUIREMENTS = [
    { id: 'req_a', category: '성능', requirement: '응답이 빨라야 한다', kanoPositiveQ: '응답이 1초 이내라면 어떻습니까?', kanoNegativeQ: '응답이 5초 이상이라면 어떻습니까?' },
    { id: 'req_b', category: '안전', requirement: '오경보를 억제해야 한다' },
    { id: 'req_c', category: '', requirement: '주석 </script><script>alert(1)</script> 주입 시도' },
];

const model = buildKanoOfflineSurveyModel({
    projectId: 'proj_1',
    projectName: '스마트팜 <실증>',
    requirements: REQUIREMENTS,
    exportedAt: new Date('2026-09-04T00:00:00.000Z'),
});
const surveyHtml = renderKanoOfflineSurveyHtml(model);
const surveyPath = path.join(dir, 'survey.html');
fs.writeFileSync(surveyPath, surveyHtml, 'utf8');

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ acceptDownloads: true });
const offSite: string[] = [];
const consoleErrors: string[] = [];

async function open(file: string) {
    const page = await ctx.newPage();
    page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(`${file}: ${m.text()}`); });
    page.on('pageerror', (e) => consoleErrors.push(`${file}: ${e.message}`));
    await page.route('**/*', (route) => {
        const url = route.request().url();
        if (!url.startsWith('file://')) { offSite.push(url); return route.abort(); }
        return route.continue();
    });
    await page.goto('file://' + file);
    return page;
}

// ---- 1. 미답 저장은 막히고 첫 미답만 강조된다 ----
const page = await open(surveyPath);
assert.equal(await page.locator('input[type=radio]').count(), REQUIREMENTS.length * 2 * 5);
assert.equal(await page.locator('#fallback').isVisible(), false);
await page.check('input[name="f_req_a"][value="LIKE"]');
let leaked: unknown = null;
page.once('download', (d) => { leaked = d; });
await page.click('#save');
await page.waitForTimeout(600);
assert.equal(leaked, null, '미답 상태에서 다운로드가 일어났다');
const partial = await page.textContent('#status');
assert.equal(partial, '아직 답하지 않은 질문이 5개 있습니다.');
assert.equal(await page.locator('.q.missing').count(), 1, '강조는 첫 미답 하나여야 한다');
step('1', `미답 저장 차단 · "${partial}" · missing 1개 · 다운로드 0`);

// ---- 2. 전부 답하고 저장하면 계약대로 내려온다 ----
const ANSWERS = { f_req_a: 'LIKE', d_req_a: 'DISLIKE', f_req_b: 'EXPECT', d_req_b: 'TOLERATE', f_req_c: 'NEUTRAL', d_req_c: 'LIKE' };
for (const [name, value] of Object.entries(ANSWERS)) await page.check(`input[name="${name}"][value="${value}"]`);
await page.fill('#email', 'Respondent@Example.com');
const [download] = await Promise.all([page.waitForEvent('download'), page.click('#save')]);
const savedPath = path.join(dir, 'answered.html');
await download.saveAs(savedPath);
const savedHtml = fs.readFileSync(savedPath, 'utf8');
assert.match(download.suggestedFilename(), /^kano-response-[0-9a-f]{8}\.html$/, `파일명: ${download.suggestedFilename()}`);
assert.equal(islands(savedHtml).length, 1, '응답 섬은 하나여야 한다');
const island = JSON.parse(islands(savedHtml)[0]);
step('2', `저장 · ${download.suggestedFilename()} · ${Buffer.byteLength(savedHtml)} B · 섬 1개`);

// ---- 3. 저장본을 다시 열면 답·이메일·폴백이 복원된다 ----
const page2 = await open(savedPath);
const restored = await page2.locator('input[type=radio]:checked')
    .evaluateAll((els) => Object.fromEntries((els as HTMLInputElement[]).map((e) => [e.name, e.value])));
assert.deepEqual(restored, ANSWERS, '선택이 복원되지 않았다');
assert.equal(await page2.inputValue('#email'), 'Respondent@Example.com');
assert.equal(await page2.textContent('#status'), '이전에 저장한 답변이 실려 있습니다. 수정 후 다시 저장할 수 있습니다.');
assert.equal(await page2.locator('#fallback').isVisible(), true);
const payloadText = await page2.inputValue('#payload');
assert.deepEqual(JSON.parse(payloadText), island, '#payload 가 응답 섬과 달라졌다');
step('3', `다시 열기 · 선택 6개·이메일 복원 · 상태문구 일치 · #payload ${payloadText.length}자 = 섬과 동일`);

// ---- 4. 답 하나를 바꿔 재저장해도 같은 응답이다 ----
await page2.check('input[name="f_req_a"][value="DISLIKE"]');
const [download2] = await Promise.all([page2.waitForEvent('download'), page2.click('#save')]);
const resavedPath = path.join(dir, 'answered-2.html');
await download2.saveAs(resavedPath);
const resavedHtml = fs.readFileSync(resavedPath, 'utf8');
assert.equal(islands(resavedHtml).length, 1, '재저장 뒤에도 섬은 하나여야 한다');
const island2 = JSON.parse(islands(resavedHtml)[0]);
assert.equal(island2.submissionId, island.submissionId, 'submissionId 가 바뀌면 멱등 갱신이 깨진다');
assert.equal(island2.answers.find((a: any) => a.requirementId === 'req_a').functional, 'DISLIKE');
assert.equal(download2.suggestedFilename(), download.suggestedFilename());
step('4', `재저장 · submissionId 동일(${island.submissionId.slice(0, 8)}) · req_a LIKE→DISLIKE · 섬 1개`);

// ---- 5. 서버 파서·대조가 브라우저 산출물을 그대로 받는다 ----
const parsed = parseKanoOfflineResponseText(savedHtml);
assert.equal(parsed.ok, true, `저장본 파싱 실패: ${(parsed as any).reason}`);
const file = (parsed as { ok: true; file: any }).file;
assert.equal(file.answers.length, 3);
const reconciled = reconcileKanoOfflineResponse(file, currentSetOf(model));
assert.equal(reconciled.status, 'ok', `같은 모델인데 상태가 ${reconciled.status}`);
assert.equal((reconciled as any).answers.length, 3);
// 브라우저는 사람이 친 대로 저장하고(대문자 포함), 파서가 소문자로 맞춘다 — 라우트의
// 사칭 방어가 소문자 집합으로 비교하므로 이 정규화가 깨지면 방어가 통째로 빗나간다.
assert.equal(island.respondentEmail, 'Respondent@Example.com', '저장 파일은 입력 그대로여야 한다');
assert.equal(resolveKanoOfflineRespondentEmail(file), 'respondent@example.com', '파서가 소문자로 맞춰야 한다');
assert.equal(kanoOfflineInvitationToken(file), `offline_${file.submissionId}`);
step('5', `저장본 → 파서 → 대조 · status 'ok' · answers 3 · 이메일 소문자 정규화 · 토큰 offline_<submissionId>`);

// ---- 6. 원본(미답) 설문 파일은 survey-file 로 거절된다 ----
const rejected = parseKanoOfflineResponseText(surveyHtml);
assert.equal(rejected.ok, false);
assert.equal((rejected as any).reason, 'survey-file', `원본 거절 사유가 ${(rejected as any).reason}`);
step('6', `원본(미답) HTML → 거절 · 사유 'survey-file'`);

// ---- 7. 「내용 복사」로 받은 #payload JSON 도 같은 파서를 통과한다 ----
const fromPayload = parseKanoOfflineResponseText(payloadText);
assert.equal(fromPayload.ok, true, `#payload 파싱 실패: ${(fromPayload as any).reason}`);
assert.deepEqual((fromPayload as any).file, file, 'HTML 경로와 JSON 경로의 결과가 다르다');
step('7', `#payload JSON → 파서 통과 · HTML 경로와 결과 동일`);

// ---- 8. 문구 하나를 바꾼 모델과 대조하면 그 답만 버려진다 ----
const changed = buildKanoOfflineSurveyModel({
    projectId: 'proj_1',
    projectName: '스마트팜 <실증>',
    requirements: REQUIREMENTS.map((r) => (r.id === 'req_b' ? { ...r, requirement: '오경보를 크게 줄여야 한다' } : r)),
    exportedAt: new Date('2026-09-04T00:00:00.000Z'),
});
const mismatch = reconcileKanoOfflineResponse(file, currentSetOf(changed));
assert.equal(mismatch.status, 'question-set-changed');
assert.equal((mismatch as any).dropped, 1, `버린 답이 ${(mismatch as any).dropped}개`);
assert.equal((mismatch as any).matched.length, 2);
assert.equal((mismatch as any).matched.some((a: any) => a.requirementId === 'req_b'), false, 'req_b 는 버려져야 한다');
// 라우트가 409 안내에 싣는 것과 같은 호출(route.ts:81).
const described = describeKanoQuestionSetChange(file.questions, currentSetOf(changed).questionHashById);
assert.deepEqual(described, { added: 0, removed: 0, changed: 1 }, '409 안내 수치가 실제 변경과 다르다');
step('8', `문구 1건 변경 대조 → 'question-set-changed' · dropped 1 · matched 2 · 안내(추가 ${described.added}·삭제 ${described.removed}·변경 ${described.changed})`);

// ---- 9. </script> 주입 요구사항이 브라우저에서 문서를 깨지 않는다 ----
const injected = await page.textContent('.q');
const bodyText = await page.locator('body').innerText();
assert.ok(bodyText.includes('</script><script>alert(1)</script>'), '주입 문구가 본문에 글자로 보여야 한다');
assert.equal(await page.locator('script:not([type])').count(), 1, '문서의 실행 스크립트는 렌더러의 것 하나뿐이어야 한다');
assert.equal(await page.evaluate(() => (window as any).__pwned ?? null), null);
assert.equal(kanoOfflineSurveyFileName('스마트팜 <실증>').endsWith('.html'), true);
step('9', `</script> 주입 요구사항 · 본문에 글자로 표시 · 실행 스크립트 1개 · 문서 정상`);

// ---- 10. 자급자족 ----
assert.deepEqual(offSite, [], `외부 요청: ${offSite.join(', ')}`);
assert.deepEqual(consoleErrors, [], `콘솔 오류: ${consoleErrors.join(' | ')}`);
step('10', `외부 요청 0건 · 콘솔 오류 0건 (열어 본 문서 3개)`);

await browser.close();
fs.rmSync(dir, { recursive: true, force: true });
console.log(`\nTask 8 Step 1 컨테이너 스모크: 10단계 전부 통과 (파일명 ${kanoOfflineSurveyFileName('스마트팜 <실증>')})`);
