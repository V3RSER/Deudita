import { NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.json({ message: 'Endpoint que dispara el cron de Gmail (Próximamente)' });
}
