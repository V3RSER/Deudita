import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({ message: 'Job que llama Vercel Cron (Próximamente)' });
}
