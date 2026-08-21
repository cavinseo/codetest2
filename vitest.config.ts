import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
    resolve: {
        // 앱 코드는 tsconfig 의 "@/*" 별칭으로 import 한다. 라우트 핸들러를 직접
        // 부르는 테스트를 쓰려면 vitest 도 같은 별칭을 알아야 한다.
        alias: {
            '@': fileURLToPath(new URL('.', import.meta.url)),
        },
    },
    test: {
        // 이 저장소의 테스트는 tests/ 아래에만 둔다.
        // 범위를 고정하지 않으면 .claude/worktrees 같은 도구 상태 디렉터리에 생긴
        // 저장소 사본까지 수집돼 같은 테스트가 두 번 돌고 집계가 부풀려진다.
        include: ['tests/**/*.test.ts'],
        exclude: ['**/node_modules/**', '**/.next/**', '**/.claude/**', '**/tests/integration/**'],
    },
});
