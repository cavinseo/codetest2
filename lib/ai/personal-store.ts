// 개인 AI 키의 DB 저장·조회. 키는 암호화된 형태로만 저장되고, 복호화는
// 서버 안에서 프로바이더를 만드는 순간에만 일어난다.
import { prisma } from '../prisma';
import { createLogger } from '../logger';
import { decryptSettingsValue, encryptSettingsValue } from '../settings-crypto';
import { parseMemberAiMode, parsePersonalAiVendor, toStoredMemberAiMode } from './personal-vendors';
import type { PersonalAiConnection } from './personal';

const log = createLogger('lib/ai/personal-store');

/** 화면에 보여줄 요약. 인증 키는 어떤 형태로도 싣지 않는다. */
export async function getPersonalConnectionSummary(userId: string) {
    const row = await prisma.userAiConnection.findUnique({
        where: { userId },
        select: {
            mode: true,
            vendor: true,
            model: true,
            remoteBaseUrl: true,
            remoteModel: true,
            localBaseUrl: true,
            localModel: true,
            updatedAt: true,
        },
    });
    if (!row) return null;
    // 저장값(예전 이름 mcp)을 화면·라우트가 쓰는 모드 이름으로 옮긴다. 모르는 값은 그대로 둔다.
    return { ...row, mode: parseMemberAiMode(row.mode) ?? row.mode };
}

/** AI 실행 직전에 쓰는 복호화 조회. 키가 손상됐으면 없다고 답해 폴백을 태운다. */
export async function loadPersonalConnection(userId: string): Promise<PersonalAiConnection | null> {
    const row = await prisma.userAiConnection.findUnique({ where: { userId } });
    if (!row) return null;

    const mode = parseMemberAiMode(row.mode);
    if (!mode) return null;

    const vendor = parsePersonalAiVendor(row.vendor);
    const apiKey = row.apiKey ? decryptSettingsValue(row.apiKey) : null;
    if (row.apiKey && apiKey === null) {
        // 암호화 키가 바뀌었거나 값이 손상됐다. 키 내용 없이 사실만 남긴다.
        log.warn('개인 AI 키를 복호화하지 못했습니다.', { userId });
    }
    if (mode === 'api' && (!vendor || !apiKey)) return null;

    return {
        mode,
        vendor,
        apiKey,
        model: row.model,
        remoteBaseUrl: row.remoteBaseUrl,
        remoteModel: row.remoteModel,
        localBaseUrl: row.localBaseUrl,
        localModel: row.localModel,
    };
}

export async function upsertPersonalConnection(
    userId: string,
    input: {
        mode?: PersonalAiConnection['mode'];
        vendor?: PersonalAiConnection['vendor'];
        /** 문자열은 새 키로 바꾸고, null 은 저장된 키를 지우고, 생략하면 그대로 둔다. */
        apiKey?: string | null;
        model?: string | null;
        remoteBaseUrl?: string | null;
        remoteModel?: string | null;
        localBaseUrl?: string | null;
        localModel?: string | null;
    }
): Promise<void> {
    const encrypted = input.apiKey ? encryptSettingsValue(input.apiKey) : undefined;
    const mode = toStoredMemberAiMode(input.mode ?? 'api');
    await prisma.userAiConnection.upsert({
        where: { userId },
        create: {
            userId,
            mode,
            vendor: input.vendor ?? null,
            apiKey: encrypted ?? null,
            model: input.model ?? null,
            remoteBaseUrl: input.remoteBaseUrl ?? null,
            remoteModel: input.remoteModel ?? null,
            localBaseUrl: input.localBaseUrl ?? null,
            localModel: input.localModel ?? null,
        },
        update: {
            mode,
            ...(input.vendor !== undefined ? { vendor: input.vendor } : {}),
            ...(input.model !== undefined ? { model: input.model } : {}),
            ...(input.remoteBaseUrl !== undefined ? { remoteBaseUrl: input.remoteBaseUrl } : {}),
            ...(input.remoteModel !== undefined ? { remoteModel: input.remoteModel } : {}),
            ...(input.localBaseUrl !== undefined ? { localBaseUrl: input.localBaseUrl } : {}),
            ...(input.localModel !== undefined ? { localModel: input.localModel } : {}),
            ...(encrypted ? { apiKey: encrypted } : input.apiKey === null ? { apiKey: null } : {}),
        },
    });
}

export async function deletePersonalConnection(userId: string): Promise<void> {
    // 행이 없어도 조용히 성공해야 한다(삭제 버튼 연타 등).
    await prisma.userAiConnection.deleteMany({ where: { userId } });
}
