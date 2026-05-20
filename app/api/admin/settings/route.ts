import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/drizzle/db'
import { siteSettings } from '@/drizzle/schema'
import { getSettings } from '@/lib/settings'
import { getDefaultModels } from '@/lib/ai'

export const dynamic = 'force-dynamic'

const hexColor = z
  .string()
  .regex(/^#[0-9A-Fa-f]{6}$/, 'Cor inválida (use formato #RRGGBB)')

const putSchema = z.object({
  template: z.enum(['default', 'portal', 'business', 'news']).optional(),
  colors: z
    .object({
      primary: hexColor,
      secondary: hexColor,
      background: hexColor,
      surface: hexColor,
    })
    .optional(),
  company: z
    .object({
      logo_url: z.string().max(500).optional(),
      blog_name: z.string().max(100).optional(),
      blog_description: z.string().max(500).optional(),
      company_name: z.string().max(150).optional(),
      company_email: z.string().email().or(z.literal('')).optional(),
      company_phone: z.string().max(30).optional(),
      company_address: z.string().max(300).optional(),
      company_cnpj: z.string().max(20).optional(),
      social_facebook: z.string().max(200).optional(),
      social_instagram: z.string().max(200).optional(),
      social_twitter: z.string().max(200).optional(),
      social_youtube: z.string().max(200).optional(),
    })
    .optional(),
  ai: z
    .object({
      api_key: z.string().max(200).optional(),
      models: z.record(z.string(), z.string()).optional(),
    })
    .optional(),
})

export async function GET() {
  try {
    const settings = await getSettings()
    const defaults = getDefaultModels()

    let aiApiKey = ''
    let aiModels: Record<string, string> = {}

    try {
      const rows = await db.select().from(siteSettings)
      const map = Object.fromEntries(rows.map((r) => [r.key, r.value]))

      aiApiKey = map['ai_api_key'] ?? ''
      aiModels = map['ai_models'] ? { ...defaults, ...JSON.parse(map['ai_models']) } : { ...defaults }
    } catch {}

    return NextResponse.json({ ...settings, ai: { api_key: aiApiKey, models: aiModels } })
  } catch {
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json()
    const parsed = putSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Dados inválidos', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const { template, colors, company, ai } = parsed.data
    const now = new Date()

    if (template !== undefined) {
      await db
        .insert(siteSettings)
        .values({ key: 'active_template', value: template, updated_at: now })
        .onConflictDoUpdate({ target: siteSettings.key, set: { value: template, updated_at: now } })
    }

    if (colors !== undefined) {
      const colorsJson = JSON.stringify(colors)
      await db
        .insert(siteSettings)
        .values({ key: 'theme_colors', value: colorsJson, updated_at: now })
        .onConflictDoUpdate({ target: siteSettings.key, set: { value: colorsJson, updated_at: now } })
    }

    if (company !== undefined) {
      const current = await getSettings()
      const merged = { ...current.company, ...company }
      const companyJson = JSON.stringify(merged)
      await db
        .insert(siteSettings)
        .values({ key: 'company_info', value: companyJson, updated_at: now })
        .onConflictDoUpdate({ target: siteSettings.key, set: { value: companyJson, updated_at: now } })
    }

    if (ai !== undefined) {
      if (ai.api_key !== undefined) {
        await db
          .insert(siteSettings)
          .values({ key: 'ai_api_key', value: ai.api_key, updated_at: now })
          .onConflictDoUpdate({ target: siteSettings.key, set: { value: ai.api_key, updated_at: now } })
      }

      if (ai.models !== undefined) {
        const defaults = getDefaultModels()
        const merged = { ...defaults, ...ai.models }
        const modelsJson = JSON.stringify(merged)
        await db
          .insert(siteSettings)
          .values({ key: 'ai_models', value: modelsJson, updated_at: now })
          .onConflictDoUpdate({ target: siteSettings.key, set: { value: modelsJson, updated_at: now } })
      }
    }

    const current = await getSettings()
    return NextResponse.json(current)
  } catch {
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}
