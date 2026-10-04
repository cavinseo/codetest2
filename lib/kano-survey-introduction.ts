// 오프라인 설문 소개문의 다섯 입력값과 공통 문구를 관리한다.
import { z } from 'zod';

export const KANO_INTRODUCTION_MAX_LENGTH = 200;
const field = z.string().trim().max(KANO_INTRODUCTION_MAX_LENGTH);
export const kanoSurveyIntroductionSchema = z.object({
    technology: field,
    productType: field,
    companyName: field,
    representativeName: field,
    offering: field,
}).strict();
export type KanoSurveyIntroduction = z.infer<typeof kanoSurveyIntroductionSchema>;

export const EMPTY_KANO_INTRODUCTION: KanoSurveyIntroduction = {
    technology: '', productType: '', companyName: '', representativeName: '', offering: '',
};

export const KANO_INTRODUCTION_FIELDS = [
    { key: 'technology', label: '기술명', prefix: '(제품/서비스 소개) 안녕하세요. ', blank: '　　　　　　　' },
    { key: 'productType', label: '제품 종류', prefix: ' 기술을 활용하여 다양한 ', blank: '　　　　' },
    { key: 'companyName', label: '회사명', prefix: '제품을 개발하고 있는 ', blank: '　　　　' },
    { key: 'representativeName', label: '대표자명', prefix: ' 대표 ', blank: '　　　　' },
    { key: 'offering', label: '조사 대상 제품/서비스', prefix: '입니다. 본 설문은 자사에서 제공하는 ', blank: '　　　　' },
] as const;

export const KANO_INTRODUCTION_END =
    '에 대하여, 소비자의 의견을 수렴하여 좀 더 나은 서비스를 만드는데 필요한 기초 자료를 얻는 것에 '
    + '목적이 있습니다. 귀하께서 응답하시는 내용은 정답이 없으며, 오직 제품 레벨 업을 위한 용도로만 '
    + '사용할 것을 약속드립니다. 바쁘신 가운데 시간을 내어 주셔서 대단히 감사합니다. '
    + '/(필요시 이미지 자료 첨부가능)';

export function buildKanoSurveyIntroduction(values: KanoSurveyIntroduction = EMPTY_KANO_INTRODUCTION): string {
    return KANO_INTRODUCTION_FIELDS.map(({ key, prefix, blank }) =>
        `${prefix}「${values[key].trim() || blank}」`
    ).join('') + KANO_INTRODUCTION_END;
}
