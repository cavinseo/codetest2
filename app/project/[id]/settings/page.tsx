'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

interface Member {
    id: string;
    userId: string;
    email?: string;
    name?: string;
    role: 'OWNER' | 'EDITOR' | 'COACH' | 'ADMIN';
    joinedAt: string;
}

interface ProjectInfo {
    id: string;
    name: string;
    description?: string | null;
}

export default function ProjectSettingsPage() {
    const params = useParams();
    const projectId = params.id as string;

    const [project, setProject] = useState<ProjectInfo | null>(null);
    const [members, setMembers] = useState<Member[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [projectError, setProjectError] = useState('');
    const [showInviteModal, setShowInviteModal] = useState(false);
    const [inviteEmail, setInviteEmail] = useState('');
    const [inviteRole, setInviteRole] = useState<'EDITOR' | 'COACH'>('EDITOR');
    const [inviteError, setInviteError] = useState('');
    const [isInviting, setIsInviting] = useState(false);
    const [activeTab, setActiveTab] = useState<'members' | 'data'>('members');
    const [isExporting, setIsExporting] = useState(false);
    const [isImporting, setIsImporting] = useState(false);
    const [importFile, setImportFile] = useState<File | null>(null);

    const loadProject = useCallback(async () => {
        setProjectError('');
        try {
            const response = await fetch(`/api/projects/${projectId}/overview`);
            const data = await response.json().catch(() => null);

            if (!response.ok) {
                throw new Error(data?.error || '프로젝트 정보를 불러오지 못했습니다.');
            }

            setProject(data.project);
        } catch (error) {
            console.error('프로젝트 로드 실패:', error);
            setProjectError(error instanceof Error ? error.message : '프로젝트 정보를 불러오지 못했습니다.');
        }
    }, [projectId]);

    const loadMembers = useCallback(async () => {
        try {
            const response = await fetch(`/api/projects/${projectId}/members`);
            if (response.ok) {
                const data = await response.json();
                setMembers(data.members);
            }
        } catch (error) {
            console.error('멤버 로드 실패:', error);
        } finally {
            setIsLoading(false);
        }
    }, [projectId]);

    useEffect(() => {
        loadProject();
        loadMembers();
    }, [loadMembers, loadProject]);

    const handleInvite = async (e: React.FormEvent) => {
        e.preventDefault();
        setInviteError('');
        setIsInviting(true);

        try {
            const response = await fetch(`/api/projects/${projectId}/members`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: inviteEmail,
                    role: inviteRole,
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || '초대 실패');
            }

            // 성공 시 목록 새로고침
            await loadMembers();
            setShowInviteModal(false);
            setInviteEmail('');
            setInviteRole('EDITOR');
        } catch (error: any) {
            setInviteError(error.message);
        } finally {
            setIsInviting(false);
        }
    };

    const getRoleBadgeColor = (role: string) => {
        switch (role) {
            case 'OWNER':
                return 'bg-purple-500/20 text-purple-300 border-purple-500';
            case 'EDITOR':
                return 'bg-blue-500/20 text-blue-300 border-blue-500';
            case 'COACH':
                return 'bg-green-500/20 text-green-300 border-green-500';
            case 'ADMIN':
                return 'bg-red-500/20 text-red-300 border-red-500';
            default:
                return 'bg-gray-500/20 text-gray-300 border-gray-500';
        }
    };

    const getRoleDescription = (role: string) => {
        switch (role) {
            case 'OWNER':
                return '모든 권한 보유';
            case 'EDITOR':
                return '편집 권한';
            case 'COACH':
                return '코멘트 및 피드백';
            case 'ADMIN':
                return '관리 권한';
            default:
                return '';
        }
    };

    const handleExport = async () => {
        setIsExporting(true);
        try {
            const response = await fetch(`/api/projects/${projectId}/export`);
            if (!response.ok) {
                throw new Error('데이터 내보내기 실패');
            }

            const data = await response.json();
            const dataStr = JSON.stringify(data, null, 2);
            const blob = new Blob([dataStr], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${project?.name || '프로젝트'}_${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            alert('데이터를 성공적으로 내보냈습니다!');
        } catch (error) {
            console.error('Export error:', error);
            alert('데이터 내보내기에 실패했습니다.');
        } finally {
            setIsExporting(false);
        }
    };

    const handleImport = async (options: { confirmCascade?: boolean } = {}) => {
        if (!importFile) {
            alert('파일을 선택해주세요.');
            return;
        }

        setIsImporting(true);
        try {
            const text = await importFile.text();
            const data = JSON.parse(text);
            if (options.confirmCascade) {
                data.confirmCascade = true;
            }

            const response = await fetch(`/api/projects/${projectId}/import-json`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });
            const result = await response.json();

            // 고객요구사항을 덮어쓰면 Kano 응답이 캐스케이드로 함께 지워진다.
            // 서버가 409 로 막아주므로, 무엇이 사라지는지 보여주고 한 번 더 확인받는다.
            if (response.status === 409 && result.needsCascadeConfirm) {
                if (window.confirm(`${result.error}\n\n그래도 계속하시겠습니까?`)) {
                    await handleImport({ confirmCascade: true });
                } else {
                    alert('가져오기를 취소했습니다. 기존 데이터는 그대로 유지됩니다.');
                }
                return;
            }

            if (!response.ok) {
                throw new Error(result.error || '데이터 가져오기 실패');
            }

            alert(`데이터를 성공적으로 가져왔습니다!\n${JSON.stringify(result.imported, null, 2)}`);
            setImportFile(null);

            // 페이지 리로드하여 새 데이터 반영
            window.location.reload();
        } catch (error: any) {
            console.error('Import error:', error);
            alert(`데이터 가져오기에 실패했습니다: ${error.message}`);
        } finally {
            setIsImporting(false);
        }
    };

    const projectName = project?.name || '현재 프로젝트';

    return (
        <div className="min-h-screen bg-gray-900">
            {/* 헤더 */}
            <header className="bg-gray-800 border-b border-gray-700">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-4">
                            <Link
                                href={`/project/${projectId}`}
                                className="text-gray-400 hover:text-white transition-colors"
                            >
                                ← 프로젝트로 돌아가기
                            </Link>
                            <div className="h-6 w-px bg-gray-700" />
                            <div>
                                <h1 className="text-2xl font-bold text-white">프로젝트 설정</h1>
                                <p className="text-sm text-gray-400 mt-1">{projectName}</p>
                                <p className="text-xs text-gray-500 mt-1">이 페이지의 설정은 현재 선택한 프로젝트에만 적용됩니다.</p>
                            </div>
                        </div>
                    </div>
                </div>
            </header>

            {/* 메인 콘텐츠 */}
            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                {projectError && (
                    <div className="mb-6 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                        {projectError}
                    </div>
                )}
                <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
                    {/* 사이드바 */}
                    <div className="lg:col-span-1">
                        <nav className="space-y-1">
                            <button
                                onClick={() => setActiveTab('members')}
                                className={`w-full text-left px-4 py-2 rounded-lg font-medium ${activeTab === 'members'
                                    ? 'bg-gray-800 text-white'
                                    : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                                    }`}
                            >
                                👥 팀원 관리
                            </button>
                            <button
                                onClick={() => setActiveTab('data')}
                                className={`w-full text-left px-4 py-2 rounded-lg font-medium ${activeTab === 'data'
                                    ? 'bg-gray-800 text-white'
                                    : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                                    }`}
                            >
                                💾 데이터 관리
                            </button>
                        </nav>
                    </div>

                    {/* Content Area */}
                    <div className="lg:col-span-3 space-y-6">
                        {activeTab === 'members' && (
                            <>
                                {/* 팀원 관리 섹션 */}
                                {/* 헤더 */}
                                <div className="flex items-center justify-between">
                                    <div>
                                        <h2 className="text-2xl font-bold text-white">팀원 관리</h2>
                                        <p className="text-gray-400 mt-1">
                                            프로젝트에 팀원을 초대하고 역할을 관리하세요
                                        </p>
                                    </div>
                                    <button
                                        onClick={() => setShowInviteModal(true)}
                                        className="btn-primary flex items-center space-x-2"
                                    >
                                        <span>+</span>
                                        <span>팀원 초대</span>
                                    </button>
                                </div>

                                {/* 역할 설명 */}
                                <div className="card bg-blue-500/10 border border-blue-500/30">
                                    <h3 className="font-semibold text-white mb-3">역할 안내</h3>
                                    <div className="grid grid-cols-2 gap-3 text-sm">
                                        <div>
                                            <span className="font-medium text-purple-300">👑 OWNER</span>
                                            <p className="text-gray-400">모든 권한 (삭제, 멤버 관리)</p>
                                        </div>
                                        <div>
                                            <span className="font-medium text-blue-300">✏️ EDITOR</span>
                                            <p className="text-gray-400">데이터 편집 및 수정</p>
                                        </div>
                                        <div>
                                            <span className="font-medium text-green-300">💬 COACH</span>
                                            <p className="text-gray-400">코멘트 및 피드백만 가능</p>
                                        </div>
                                        <div>
                                            <span className="font-medium text-red-300">⚙️ ADMIN</span>
                                            <p className="text-gray-400">설정 및 멤버 관리</p>
                                        </div>
                                    </div>
                                </div>

                                {/* 팀원 목록 */}
                                <div className="card">
                                    <h3 className="text-lg font-semibold text-white mb-4">
                                        팀원 목록 ({members.length}명)
                                    </h3>

                                    {isLoading ? (
                                        <div className="text-center py-8 text-gray-400">로딩 중...</div>
                                    ) : members.length === 0 ? (
                                        <div className="text-center py-8 text-gray-400">
                                            아직 팀원이 없습니다. 팀원을 초대해보세요!
                                        </div>
                                    ) : (
                                        <div className="space-y-3">
                                            {members.map((member) => (
                                                <div
                                                    key={member.id}
                                                    className="flex items-center justify-between p-4 bg-gray-700/50 rounded-lg hover:bg-gray-700 transition-colors"
                                                >
                                                    <div className="flex items-center space-x-4">
                                                        <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white font-bold">
                                                            {member.name?.charAt(0).toUpperCase() || '?'}
                                                        </div>
                                                        <div>
                                                            <h4 className="font-medium text-white">
                                                                {member.name || '알 수 없음'}
                                                            </h4>
                                                            <p className="text-sm text-gray-400">{member.email}</p>
                                                        </div>
                                                    </div>

                                                    <div className="flex items-center space-x-3">
                                                        <span
                                                            className={`px-3 py-1 rounded text-xs font-semibold border ${getRoleBadgeColor(
                                                                member.role
                                                            )}`}
                                                        >
                                                            {member.role}
                                                        </span>
                                                        {member.role !== 'OWNER' && (
                                                            <button className="text-gray-400 hover:text-red-400 transition-colors">
                                                                🗑️
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </>
                        )}

                        {/* 데이터 관리 섹션 */}
                        {activeTab === 'data' && (
                            <>
                                <div>
                                    <h2 className="text-2xl font-bold text-white mb-2">데이터 관리</h2>
                                    <p className="text-gray-400">프로젝트 데이터를 백업하거나 복원하세요</p>
                                </div>

                                {/* Export Section */}
                                <div className="card">
                                    <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                                        📤 데이터 내보내기 (Export)
                                    </h3>
                                    <p className="text-gray-400 mb-6 text-sm">
                                        프로젝트의 모든 데이터를 JSON 파일로 다운로드합니다. 백업이나 다른 환경으로 이전 시 사용하세요.
                                    </p>
                                    <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4 mb-6">
                                        <h4 className="text-white font-semibold mb-2 text-sm">📦 포함되는 데이터</h4>
                                        <ul className="text-gray-300 text-sm space-y-1 list-disc list-inside">
                                            <li>프로젝트 정보</li>
                                            <li>AS-IS 스펙표 (FAST 분석)</li>
                                            <li>제품 속성 및 적합도</li>
                                            <li>고객 요구사항</li>
                                            <li>기술특성 및 QFD 매트릭스</li>
                                            <li>Kano 설문 응답</li>
                                        </ul>
                                    </div>
                                    <button
                                        onClick={handleExport}
                                        disabled={isExporting}
                                        className="btn-primary flex items-center gap-2 disabled:opacity-50"
                                    >
                                        <span>📥</span>
                                        {isExporting ? '내보내는 중...' : 'JSON 파일로 내보내기'}
                                    </button>
                                </div>

                                {/* Import Section */}
                                <div className="card">
                                    <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                                        📥 데이터 가져오기 (Import)
                                    </h3>
                                    <p className="text-gray-400 mb-6 text-sm">
                                        이전에 내보낸 JSON 파일을 업로드하여 데이터를 복원합니다.
                                    </p>
                                    <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4 mb-6">
                                        <h4 className="text-amber-300 font-semibold mb-2 text-sm flex items-center gap-2">
                                            ⚠️ 주의사항
                                        </h4>
                                        <ul className="text-gray-300 text-sm space-y-1 list-disc list-inside">
                                            <li>기존 데이터가 모두 덮어씌워집니다</li>
                                            <li>이 작업은 되돌릴 수 없습니다</li>
                                            <li>먼저 현재 데이터를 백업하는 것을 권장합니다</li>
                                        </ul>
                                    </div>
                                    <div className="space-y-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-300 mb-2">
                                                JSON 파일 선택
                                            </label>
                                            <input
                                                type="file"
                                                accept=".json"
                                                onChange={(e) => setImportFile(e.target.files?.[0] || null)}
                                                className="block w-full text-sm text-gray-400
                                                    file:mr-4 file:py-2 file:px-4
                                                    file:rounded-lg file:border-0
                                                    file:text-sm file:font-semibold
                                                    file:bg-blue-500/20 file:text-blue-300
                                                    hover:file:bg-blue-500/30 file:cursor-pointer
                                                    cursor-pointer"
                                            />
                                            {importFile && (
                                                <p className="text-xs text-gray-500 mt-2">
                                                    선택된 파일: {importFile.name}
                                                </p>
                                            )}
                                        </div>
                                        <button
                                            onClick={() => handleImport()}
                                            disabled={isImporting || !importFile}
                                            className="btn-primary flex items-center gap-2 disabled:opacity-50"
                                        >
                                            <span>📤</span>
                                            {isImporting ? '가져오는 중...' : '데이터 가져오기'}
                                        </button>
                                    </div>
                                </div>
                            </>
                        )}

                    </div>
                </div>
            </main>

            {/* 초대 모달 */}
            {showInviteModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
                    <div className="card max-w-md w-full">
                        <h3 className="text-2xl font-bold text-white mb-6">팀원 초대</h3>

                        {inviteError && (
                            <div className="bg-red-500/10 border border-red-500 text-red-400 px-4 py-3 rounded-lg mb-4">
                                {inviteError}
                            </div>
                        )}

                        <form onSubmit={handleInvite} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-2">
                                    이메일 *
                                </label>
                                <input
                                    type="email"
                                    required
                                    value={inviteEmail}
                                    onChange={(e) => setInviteEmail(e.target.value)}
                                    className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-white"
                                    placeholder="teammate@example.com"
                                />
                                <p className="text-xs text-gray-500 mt-1">
                                    초대할 사용자는 먼저 회원가입이 되어 있어야 합니다.
                                </p>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-2">
                                    역할 *
                                </label>
                                <select
                                    value={inviteRole}
                                    onChange={(e) => setInviteRole(e.target.value as 'EDITOR' | 'COACH')}
                                    className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-white"
                                >
                                    <option value="EDITOR">✏️ Editor - 편집 권한</option>
                                    <option value="COACH">💬 Coach - 코멘트만</option>
                                </select>
                            </div>

                            <div className="flex space-x-3 pt-4">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setShowInviteModal(false);
                                        setInviteEmail('');
                                        setInviteError('');
                                    }}
                                    className="flex-1 btn-secondary py-3"
                                >
                                    취소
                                </button>
                                <button
                                    type="submit"
                                    disabled={isInviting}
                                    className="flex-1 btn-primary py-3 disabled:opacity-50"
                                >
                                    {isInviting ? '초대 중...' : '초대 보내기'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
