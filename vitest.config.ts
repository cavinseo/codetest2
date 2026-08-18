import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        // 이 저장소의 테스트는 tests/ 아래에만 둔다.
        // 범위를 고정하지 않으면 .claude/worktrees 같은 도구 상태 디렉터리에 생긴
        // 저장소 사본까지 수집돼 같은 테스트가 두 번 돌고 집계가 부풀려진다.
        include: ['tests/**/*.test.ts'],
        exclude: ['**/node_modules/**', '**/.next/**', '**/.claude/**'],
    },
});
