// 개인 AI 키의 DB 저장·조회. 키는 암호화된 형태로만 저장되고, 복호화는
// 서버 안에서 프로바이더를 만드는 순간에만 일어난다.
import { prisma } from '../prisma';
import { createLogger } from '../logger';
import { decryptSettingsValue, encryptSettingsValue } from '../settings-crypto';
import { parsePersonalAiVendor } from './personal-vendors';
import type { PersonalAiConnection } from './personal';

const log = createLogger('lib/ai/personal-store');

/** 화면에 보여줄 요약. 키는 존재 여부조차 값으로 싣지 않는다(행이 있으면 키가 있는 것). */
export async function getPersonalConnectionSummary(userId: string) {
    const row = await prisma.userAiConnection.findUnique({
        where: { userId },
        select: { vendor: true, model: true, updatedAt: true },
    });
    return row ?? null;
}

/** AI 실행 직전에 쓰는 복호화 조회. 키가 손상됐으면 없다고 답해 폴백을 태운다. */
export async function loadPersonalConnection(userId: string): Promise<PersonalAiConnection | null> {
    const row = await prisma.userAiConnection.findUnique({ where: { userId } });
    if (!row) return null;

    const vendor = parsePersonalAiVendor(row.vendor);
    if (!vendor) return null;

    const apiKey = decryptSettingsValue(row.apiKey);
    if (apiKey === null) {
        // 암호화 키가 바뀌었거나 값이 손상됐다. 키 내용 없이 사실만 남긴다.
        log.warn('개인 AI 키를 복호화하지 못해 미등록으로 처리합니다.', { userId });
        return null;
    }

    return { vendor, apiKey, model: row.model };
}

export async function upsertPersonalConnection(
    userId: string,
    input: { vendor: PersonalAiConnection['vendor']; apiKey?: string; model: string | null }
): Promise<void> {
    const encrypted = input.apiKey ? encryptSettingsValue(input.apiKey) : undefined;
    await prisma.userAiConnection.upsert({
        where: { userId },
        // 새로 만들 때는 키가 반드시 있어야 한다 — 라우트가 먼저 검증한다.
        create: { userId, vendor: input.vendor, apiKey: encrypted ?? '', model: input.model },
        update: {
            vendor: input.vendor,
            model: input.model,
            ...(encrypted ? { apiKey: encrypted } : {}),
        },
    });
}

export async function deletePersonalConnection(userId: string): Promise<void> {
    // 행이 없어도 조용히 성공해야 한다(삭제 버튼 연타 등).
    await prisma.userAiConnection.deleteMany({ where: { userId } });
}
