// 데이터 이관 모델 순서 정의가 FK 의존 관계와 일치하는지 검증하는 테스트입니다.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
    MIGRATION_MODEL_ORDER,
    MODEL_DEPENDENCIES,
    chunk,
} from '../scripts/db-migration-models.mjs';

const schema = readFileSync('prisma/schema.prisma', 'utf8');

describe('MIGRATION_MODEL_ORDER', () => {
    it('이관 대상 24개 모델을 중복 없이 담는다', () => {
        expect(MIGRATION_MODEL_ORDER).toHaveLength(24);
        expect(new Set(MIGRATION_MODEL_ORDER).size).toBe(24);
    });

    it('폐기 대상인 analyticsInsight 를 포함하지 않는다', () => {
        expect(MIGRATION_MODEL_ORDER).not.toContain('analyticsInsight');
    });

    it('모든 모델의 FK 부모가 자기보다 먼저 등장한다', () => {
        const seen = new Set<string>();

        for (const model of MIGRATION_MODEL_ORDER) {
            for (const parent of MODEL_DEPENDENCIES[model] ?? []) {
                expect(
                    seen.has(parent),
                    `${model} 이 아직 삽입되지 않은 ${parent} 를 참조합니다`
                ).toBe(true);
            }
            seen.add(model);
        }
    });

    it('의존 관계 표의 키와 값이 모두 이관 목록 안에 있다', () => {
        const known = new Set(MIGRATION_MODEL_ORDER);

        for (const [model, parents] of Object.entries(MODEL_DEPENDENCIES)) {
            expect(known.has(model), `${model} 이 이관 목록에 없습니다`).toBe(true);
            for (const parent of parents as string[]) {
                expect(known.has(parent), `${parent} 가 이관 목록에 없습니다`).toBe(true);
            }
        }
    });
});

describe('chunk', () => {
    it('지정한 크기로 배열을 나눈다', () => {
        expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    });

    it('빈 배열은 빈 결과를 낸다', () => {
        expect(chunk([], 10)).toEqual([]);
    });

    it('크기보다 짧은 배열은 한 덩어리로 둔다', () => {
        expect(chunk([1, 2], 10)).toEqual([[1, 2]]);
    });
});

describe('MemberProfile 모델', () => {
    it('스키마에 member_profiles 로 매핑돼 있다', () => {
        expect(schema).toContain('model MemberProfile');
        expect(schema).toContain('@@map("member_profiles")');
    });

    it('공통 항목은 필수, 역할별 항목은 nullable 이다', () => {
        // 멘토에게 companyName 을 NOT NULL 로 걸 수 없어 역할별 항목은 전부
        // nullable 이다. 필수 여부는 zod 스키마가 역할로 분기해 강제한다.
        const model = schema.slice(schema.indexOf('model MemberProfile'));
        const body = model.slice(0, model.indexOf('}'));

        expect(body).toMatch(/organization\s+String\s*$/m);
        expect(body).toMatch(/phone\s+String\s*$/m);
        expect(body).toMatch(/privacyConsentAt\s+DateTime\s*$/m);
        expect(body).toMatch(/expertise\s+String\?/);
        expect(body).toMatch(/companyName\s+String\?/);
    });

    it('User 에 mustChangePassword 가 있다', () => {
        expect(schema).toMatch(/mustChangePassword\s+Boolean\s+@default\(false\)/);
    });
});

describe('계정 파기 시 이력 익명화', () => {
    // 모델 블록만 떼어 검사한다. 스키마 전체에 걸면 다른 모델의 같은 이름
    // 컬럼(예: ProjectMember.invitedBy)이 대신 통과시켜, 정작 이 두 FK 가
    // NOT NULL 로 되돌아가도 테스트가 초록으로 남는다.
    function modelBlock(name: string): string {
        const match = schema.match(new RegExp(`model ${name} \\{[\\s\\S]*?\\n\\}`));
        if (!match) throw new Error(`${name} 모델을 찾지 못했습니다`);
        return match[0];
    }

    it('KanoSurveyInvitation.invitedBy 가 nullable + SetNull 이다', () => {
        // 되돌아가면 설문을 한 번이라도 보낸 멘티를 다시 지울 수 없게 된다.
        const block = modelBlock('KanoSurveyInvitation');
        expect(block).toMatch(/invitedBy\s+String\?/);
        expect(block).toMatch(/inviter\s+User\?\s+@relation\([^)]*onDelete: SetNull/);
    });

    it('MigrationHistory.userId 가 nullable + SetNull 이다', () => {
        const block = modelBlock('MigrationHistory');
        expect(block).toMatch(/userId\s+String\?/);
        expect(block).toMatch(/user\s+User\?\s+@relation\([^)]*onDelete: SetNull/);
    });

    it('KanoResponse.invitationId 는 여전히 삭제를 막는다', () => {
        // 응답이 초대 없이 남으면 안 된다. 이쪽까지 SetNull 로 풀면 설문
        // 결과의 출처를 잃는다. 익명화 대상은 사람이지 데이터가 아니다.
        const block = modelBlock('KanoResponse');
        expect(block).toMatch(/invitationId\s+String\b/);
        expect(block).not.toMatch(/invitation\s+KanoSurveyInvitation[^\n]*onDelete/);
    });

    it('Program.managerId 는 여전히 담당자 이관을 먼저 요구한다', () => {
        // 사람 하나를 지우는 것으로 기관 단위 프로그램이 사라지면 안 된다.
        const block = modelBlock('Program');
        expect(block).toMatch(/manager\s+User\s+@relation\([^)]*onDelete: Restrict/);
    });
});
