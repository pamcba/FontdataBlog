import { NextResponse } from 'next/server'
import { db } from '@/drizzle/db'
import { siteSettings } from '@/drizzle/schema'
import { eq } from 'drizzle-orm'

export const dynamic = 'force-dynamic'

async function getSetting(key: string): Promise<string | null> {
  const rows = await db.select().from(siteSettings).where(eq(siteSettings.key, key)).limit(1)
  return rows.length > 0 ? rows[0].value : null
}

async function upsertSetting(key: string, value: string) {
  const existing = await db.select().from(siteSettings).where(eq(siteSettings.key, key)).limit(1)
  if (existing.length > 0) {
    await db.update(siteSettings).set({ value, updated_at: new Date() }).where(eq(siteSettings.key, key))
  } else {
    await db.insert(siteSettings).values({ key, value, updated_at: new Date() })
  }
}

export async function GET() {
  try {
    const [apiKey, extraRaw] = await Promise.all([
      getSetting('firecrawl_api_key'),
      getSetting('agents_extra'),
    ])
    const agentsExtra: Record<string, { use_firecrawl?: boolean }> = extraRaw
      ? (JSON.parse(extraRaw) as Record<string, { use_firecrawl?: boolean }>)
      : {}
    return NextResponse.json({
      firecrawl_configured: !!(apiKey && apiKey.length > 0),
      agents_extra: agentsExtra,
    })
  } catch {
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json() as { agents_extra?: Record<string, { use_firecrawl?: boolean }> }
    if (body.agents_extra !== undefined) {
      await upsertSetting('agents_extra', JSON.stringify(body.agents_extra))
    }
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
