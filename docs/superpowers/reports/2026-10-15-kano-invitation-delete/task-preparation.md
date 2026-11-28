# 초대 개별 삭제 준비 기록.

사용자가 잘못 보낸 Kano 초대 기록 삭제를 요청했고, 응답 대기 초대만 삭제하며 접수 응답은 보호하도록 선택했다. 개별 삭제·확인창·기존 링크 무효화가 구현 범위다. 기존 응답 삭제·전체 초대 리셋 계약은 유지한다.

현재 사용자 작업 폴더에는 다수의 기존 변경이 있으므로 그대로 빌드·배포하지 않는다. 관리 작업트리 `C:/Users/user/.codex/worktrees/kano-invitation-delete/codetest2`를 생성했고 최초 Git 상태가 깨끗한 것을 확인했다. 기준은 운영 manifest의 커밋 `8912af7d02e94642ae1e98db3c47beee18ba21ee`다. 기존 운영 override 25개를 반영한 뒤 816개 소스를 manifest SHA256과 모두 대조했다. digest는 `847c04c6a8ca36a63b5f5bb34f4de952136ef7e436d8d8d284dbd6060378dc07`다.

첫 대조의 799개 차이는 Git 체크아웃의 CRLF 변환이었다. AGENTS.md 바이트의 CRLF 58개 대 0개 및 LF 정규화 뒤 일치를 확인한 후, 기존 운영 배포 폴더에서 manifest 파일만 같은 바이트로 복원했다. 최종 verified 816·mismatchCount 0을 확인했다. Git 메타데이터·비공개 환경파일은 복사하지 않았다.

의존성은 검증된 이전 배포 폴더의 node_modules Junction을 재사용한다. 원격 DB·SQL·메일·개발 서버는 사용하지 않는다. 새 제품 변경은 기존 invitations route와 KanoManager로 제한하며 기존 mutation 대상 목록에 해당하지 않는다.

읽기 전용 API 검토에서 Forms 가져오기는 완료 표시 없이 응답을 연결할 수 있음을 확인했다. 실제 `_count.responses`를 삭제 가능 판정에 포함하며 DELETE 시에도 미응답·연결 응답 없음 조건과 필수 FK를 유지한다. 읽기 전용 UI 검토에서는 초대 목록의 프로젝트 소속 표시와 공통 삭제 잠금이 필요함을 확인했다. 구현 담당에게 두 조건을 전달했다.

수정 전 운영본 두 파일은 `tmp/invitation-delete-before/`, 원래 사용자 폴더의 두 파일은 `tmp/invitation-delete-workspace-before/`에 따로 보존했다. 구현 담당은 격리 작업트리만 수정하고 주 작업자가 기존 변경을 보존하며 통합한다.
