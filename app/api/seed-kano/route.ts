import { NextResponse } from 'next/server';

export async function GET() {
    return NextResponse.json({ error: 'Seed endpoint is disabled.' }, { status: 404 });
}
