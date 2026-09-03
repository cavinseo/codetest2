-- 계정을 파기해도 그 사람이 남긴 이력은 남긴다. 이력의 주인만 비운다.
--
-- 지금은 두 컬럼이 NOT NULL + Restrict 라, 설문을 한 번이라도 보냈거나 엑셀을
-- 한 번이라도 가져온 멘티는 영구히 삭제할 수 없다. 그 둘이 멘티의 본업이라
-- 사실상 활동한 멘티 전부가 삭제 불가였다. 반면 두 컬럼을 읽는 화면은 하나도
-- 없어서, 아무도 보지 않는 기록이 개인정보 파기를 막고 있었다.
--
-- 기존 행의 값은 바뀌지 않는다. 제약만 교체한다.

ALTER TABLE "kano_survey_invitations" ALTER COLUMN "invitedBy" DROP NOT NULL;
ALTER TABLE "kano_survey_invitations" DROP CONSTRAINT "kano_survey_invitations_invitedBy_fkey";
ALTER TABLE "kano_survey_invitations" ADD CONSTRAINT "kano_survey_invitations_invitedBy_fkey"
    FOREIGN KEY ("invitedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "migration_histories" ALTER COLUMN "userId" DROP NOT NULL;
ALTER TABLE "migration_histories" DROP CONSTRAINT "migration_histories_userId_fkey";
ALTER TABLE "migration_histories" ADD CONSTRAINT "migration_histories_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
