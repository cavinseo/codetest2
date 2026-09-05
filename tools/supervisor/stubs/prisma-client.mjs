// @prisma/client 는 설치할 수 없다. 테스트는 어차피 prisma 를 전부 mock 하므로
// 클라이언트 생성자만 있으면 모듈 그래프가 이어진다. 실제 DB 에는 닿지 않는다.
export class PrismaClient {
    constructor() {
        throw new Error('감리 스텁: 실제 PrismaClient 를 만들려 했다 — mock 이 빠졌다는 뜻이다');
    }
}
export const Prisma = { TransactionIsolationLevel: {}, DbNull: null, JsonNull: null };
export default { PrismaClient, Prisma };
