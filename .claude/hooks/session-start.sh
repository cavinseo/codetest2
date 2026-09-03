#!/bin/bash
# 저장소가 벤더링해 둔 스킬(.agents/skills/, 정본은 skills-lock.json)을 이
# 컨테이너의 스킬 스캔 경로(~/.claude/skills/)로 복사하는 SessionStart 훅.
#
# 원격 세션은 매번 새 컨테이너에서 시작해 ~/.claude/skills/ 가 비어 있다.
# 저장소 안의 .agents/skills/ 는 git 으로 커밋돼 세션마다 살아남지만, Claude
# Code 가 실제로 스캔하는 자리가 아니다(HOME 밑이라 저장소 클론과 별개다).
# 이 훅이 그 간극을 메운다. 로컬 개발 환경은 이미 자기 ~/.claude/skills/ 를
# 쓰므로 원격에서만 돈다.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
    exit 0
fi

SRC_DIR="$CLAUDE_PROJECT_DIR/.agents/skills"
DEST_DIR="$HOME/.claude/skills"

if [ ! -d "$SRC_DIR" ]; then
    exit 0
fi

mkdir -p "$DEST_DIR"

for skill_dir in "$SRC_DIR"/*/; do
    [ -d "$skill_dir" ] || continue
    name="$(basename "$skill_dir")"
    # 매번 지우고 새로 복사한다 — 저장소 쪽이 바뀌었는데 컨테이너 쪽에 예전
    # 버전이 남아 있으면 훅이 있으나 마나이므로 다시 사용하는 방식은 쓰지 않는다.
    rm -rf "${DEST_DIR:?}/$name"
    cp -r "$skill_dir" "$DEST_DIR/$name"
done
