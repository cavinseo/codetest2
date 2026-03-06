import Link from 'next/link';

export default function HomePage() {
    return (
        <div className="min-h-screen bg-surface-900 bg-grid relative overflow-hidden">
            {/* Animated Background Orbs */}
            <div className="bg-orb w-[600px] h-[600px] bg-primary-600 top-[-200px] left-[-200px] animate-pulse-slow" />
            <div className="bg-orb w-[500px] h-[500px] bg-accent-500 bottom-[-150px] right-[-150px] animate-pulse-slow" style={{ animationDelay: '2s' }} />
            <div className="bg-orb w-[300px] h-[300px] bg-primary-400 top-[40%] right-[20%] animate-float opacity-10" />

            {/* Navigation */}
            <nav className="relative z-10 flex items-center justify-between max-w-6xl mx-auto px-6 py-6">
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center text-white text-sm font-bold">
                        K
                    </div>
                    <span className="text-white font-display font-bold text-lg">Kano & QFD</span>
                </div>
                <div className="flex items-center gap-3">
                    <Link href="/login" className="btn-ghost">
                        로그인
                    </Link>
                    <Link href="/signup" className="btn-primary">
                        시작하기
                    </Link>
                </div>
            </nav>

            {/* Hero Section */}
            <main className="relative z-10 max-w-6xl mx-auto px-6 pt-20 pb-32">
                <div className="text-center max-w-3xl mx-auto animate-fade-in">
                    {/* Badge */}
                    <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass mb-8">
                        <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                        <span className="text-sm text-gray-300 font-medium">품질 혁신을 위한 올인원 플랫폼</span>
                    </div>

                    {/* Title */}
                    <h1 className="text-6xl md:text-7xl lg:text-8xl font-display font-extrabold leading-[0.9] tracking-tight mb-6">
                        <span className="text-white">제품 품질을</span>
                        <br />
                        <span className="text-gradient-static">데이터로 혁신</span>
                    </h1>

                    {/* Subtitle */}
                    <p className="text-lg md:text-xl text-gray-400 leading-relaxed max-w-2xl mx-auto mb-10 animate-slide-up" style={{ animationDelay: '0.15s' }}>
                        Kano 설문 분석과 QFD 매트릭스를 통해
                        <br className="hidden md:block" />
                        고객이 진정으로 원하는 제품을 만드세요.
                    </p>

                    {/* CTA */}
                    <div className="flex flex-col sm:flex-row items-center justify-center gap-4 animate-slide-up" style={{ animationDelay: '0.3s' }}>
                        <Link href="/signup" className="btn-primary px-8 py-3.5 text-base">
                            무료로 시작하기 →
                        </Link>
                        <Link href="/login" className="btn-secondary px-8 py-3.5 text-base">
                            데모 체험하기
                        </Link>
                    </div>
                </div>

                {/* Feature Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mt-24 animate-slide-up" style={{ animationDelay: '0.45s' }}>
                    {[
                        {
                            icon: '📊',
                            title: 'Kano 설문 분석',
                            desc: '매력적·일원적·당연적 품질 요소를 과학적으로 분류하고 Better-Worse 계수를 시각화합니다.',
                            gradient: 'from-blue-500/20 to-cyan-500/20',
                        },
                        {
                            icon: '🔗',
                            title: 'QFD 매트릭스',
                            desc: '고객 요구사항과 기술특성 간 관계를 체계적으로 매핑하여 개발 우선순위를 도출합니다.',
                            gradient: 'from-purple-500/20 to-pink-500/20',
                        },
                        {
                            icon: '👥',
                            title: '팀 협업',
                            desc: '프로젝트 단위 역할 기반 접근 제어와 실시간 협업으로 팀 워크플로를 강화합니다.',
                            gradient: 'from-amber-500/20 to-orange-500/20',
                        },
                    ].map((feature) => (
                        <div
                            key={feature.title}
                            className="card-hover group p-7"
                        >
                            <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${feature.gradient} flex items-center justify-center text-2xl mb-5 group-hover:scale-110 transition-transform duration-300`}>
                                {feature.icon}
                            </div>
                            <h3 className="text-lg font-display font-semibold text-white mb-2">
                                {feature.title}
                            </h3>
                            <p className="text-sm text-gray-400 leading-relaxed">
                                {feature.desc}
                            </p>
                        </div>
                    ))}
                </div>

                {/* Stats */}
                <div className="flex items-center justify-center gap-12 md:gap-20 mt-20 animate-fade-in" style={{ animationDelay: '0.6s' }}>
                    {[
                        { value: '5단계', label: 'Kano 감정 분류' },
                        { value: '4사분면', label: 'Better-Worse 분석' },
                        { value: '실시간', label: '팀 협업' },
                    ].map((stat) => (
                        <div key={stat.label} className="text-center">
                            <div className="text-2xl md:text-3xl font-display font-bold text-gradient-static">
                                {stat.value}
                            </div>
                            <div className="text-xs md:text-sm text-gray-500 mt-1">
                                {stat.label}
                            </div>
                        </div>
                    ))}
                </div>
            </main>

            {/* Bottom Accent Line */}
            <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary-500/50 to-transparent" />
        </div>
    );
}
