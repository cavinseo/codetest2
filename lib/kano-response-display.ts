import type { KanoAnswer } from './kano-algorithm';

export function getKanoAnswerLabel(answer: number | KanoAnswer | null | undefined): string {
    switch (answer) {
        case 1: return '마음에 든다';
        case 2: return '당연하다';
        case 3: return '아무런느낌이 없다';
        case 4: return '하는수 없다';
        case 5: return '마음에 안든다';
        default: return '-';
    }
}

export function getKanoCategoryLabel(category: string | null | undefined): string {
    switch (category) {
        case 'M': return '당연(M)';
        case 'O': return '일원(O)';
        case 'A': return '매력(A)';
        case 'I': return '무관심(I)';
        case 'R': return '역품질(R)';
        case 'Q': return '의심(Q)';
        default: return '-';
    }
}
