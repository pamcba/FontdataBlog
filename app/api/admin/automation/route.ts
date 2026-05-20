import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/drizzle/db'
import { automationConfig } from '@/drizzle/schema'
import { eq } from 'drizzle-orm'
import { getOrCreateAutomationConfig } from '@/lib/automation'

export async function GET() {
  try {
    const config = await getOrCreateAutomationConfig()
    return NextResponse.json({
      enabled: config.enabled,
      interval_hours: config.interval_hours,
      theme_ids: JSON.parse(config.theme_ids),
      custom_prompt: config.custom_prompt ?? '',
      last_run_at: config.last_run_at,
      next_run_at: config.next_run_at,
    })
  } catch {
    return NextResponse.json({ error: 'Erro ao carregar configuração' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { enabled, interval_hours, theme_ids, custom_prompt } = body

    const config = await getOrCreateAutomationConfig()
    const now = new Date()
    const hours = Number(interval_hours) || 24

    // Recalculate next_run_at based on current time when enabling
    const nextRun = enabled
      ? new Date(now.getTime() + hours * 60 * 60 * 1000)
      : config.next_run_at

    await db.update(automationConfig).set({
      enabled: Boolean(enabled),
      interval_hours: hours,
      theme_ids: JSON.stringify(Array.isArray(theme_ids) ? theme_ids : []),
      custom_prompt: custom_prompt?.trim() || null,
      next_run_at: nextRun,
      updated_at: now,
    }).where(eq(automationConfig.id, config.id))

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Erro ao salvar configuração' }, { status: 500 })
  }
}
