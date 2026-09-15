// 프로젝트가 없는 멘티에게도 동일한 배정 정책을 적용한다.
import { NextRequest } from 'next/server';
import { handleMentorAssignment } from '@/lib/mentor-assignment-route';
export async function GET(request: NextRequest, props: { params: Promise<{ id: string }> }) {
    return handleMentorAssignment(request, (await props.params).id);
}
export const POST = GET;
export const DELETE = GET;
