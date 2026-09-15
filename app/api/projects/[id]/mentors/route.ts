// 기존 프로젝트별 화면도 소유 멘티의 단일 배정을 사용하게 한다.
import { NextRequest } from 'next/server';
import { handleMentorAssignment } from '@/lib/mentor-assignment-route';
export async function GET(request: NextRequest, props: { params: Promise<{ id: string }> }) {
    return handleMentorAssignment(request, (await props.params).id, true);
}
export const POST = GET;
export const DELETE = GET;
