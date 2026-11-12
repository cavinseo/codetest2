'use client';
// 「설문 질문 구성」 맨 앞에서 설문지 소개문의 다섯 빈칸을 입력받는다.
//
// 소개문은 질문과 함께 「질문 저장」으로 저장되고, 오프라인 HTML·Word 설문지는 저장된 값으로
// 완성된 문장을 낸다. 입력 바로 아래에 완성 문장을 보여 줘 내려받기 전에 확인할 수 있게 한다.
import {
    buildKanoSurveyIntroduction,
    KANO_INTRODUCTION_FIELDS,
    KANO_INTRODUCTION_MAX_LENGTH,
    type KanoSurveyIntroduction,
} from '@/lib/kano-survey-introduction';

interface Props {
    value: KanoSurveyIntroduction;
    onChange: (next: KanoSurveyIntroduction) => void;
    disabled?: boolean;
}

export default function KanoSurveyIntroductionFields({ value, onChange, disabled }: Props) {
    return (
        <fieldset disabled={disabled} className="mb-5 rounded-xl border border-white/[0.08] bg-white/[0.02] p-4">
            <legend className="px-1 text-sm font-semibold text-white">설문지 소개문</legend>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {KANO_INTRODUCTION_FIELDS.map(({ key, label }) => (
                    <label key={key} htmlFor={`kano-intro-${key}`} className="flex flex-col gap-1 text-xs text-gray-400">
                        {label}
                        <input
                            id={`kano-intro-${key}`}
                            type="text"
                            value={value[key]}
                            maxLength={KANO_INTRODUCTION_MAX_LENGTH}
                            placeholder={`${label} 입력`}
                            onChange={event => onChange({ ...value, [key]: event.target.value })}
                            className="w-full px-3 py-2 bg-white/[0.04] border border-white/[0.12] hover:border-white/[0.25] focus:border-primary-400/60 rounded-lg text-white text-sm transition-colors outline-none placeholder:text-gray-600 disabled:opacity-60"
                        />
                    </label>
                ))}
            </div>
            <p className="mt-3 text-xs text-gray-500">설문지에 들어갈 문장 (입력하지 않은 항목은 빈칸으로 남습니다)</p>
            <p data-testid="kano-intro-preview" className="mt-1 whitespace-pre-wrap rounded-lg bg-white/[0.04] p-3 text-sm text-gray-300">
                {buildKanoSurveyIntroduction(value)}
            </p>
        </fieldset>
    );
}
