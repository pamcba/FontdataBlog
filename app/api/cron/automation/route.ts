import { NextRequest, NextResponse } from 'next/server'
import { runAutomationCycle } from '@/lib/automation'

export const maxDuration = 60

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  // If CRON_SECRET is set, enforce it. If not set (local dev), allow through.
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await runAutomationCycle(false) // respects interval check
    return NextResponse.json(result)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erro interno'
    console.error('[Cron] Automation cycle failed:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
