import { db } from '@/drizzle/db'
import { siteSettings } from '@/drizzle/schema'
import { eq } from 'drizzle-orm'

export type ArticleVoiceTone =
  | 'profissional'
  | 'informal'
  | 'tecnico'
  | 'jornalistico'
  | 'descontraido'

export type ArticleLanguage = 'pt-BR' | 'en' | 'es'

export interface ArticleGenerationConfig {
  minWords: number
  voiceTone: ArticleVoiceTone
  language: ArticleLanguage
  creativity: number
  includeExamples: boolean
  includeLists: boolean
  includeQuotes: boolean
  includeTables: boolean
  extraInstructions: string
}

export const ARTICLE_CONFIG_DEFAULTS: ArticleGenerationConfig = {
  minWords: 800,
  voiceTone: 'profissional',
  language: 'pt-BR',
  creativity: 0.7,
  includeExamples: false,
  includeLists: true,
  includeQuotes: false,
  includeTables: false,
  extraInstructions: '',
}

const SETTINGS_KEY = 'article_generation_config'

export async function getArticleConfig(): Promise<ArticleGenerationConfig> {
  try {
    const rows = await db
      .select()
      .from(siteSettings)
      .where(eq(siteSettings.key, SETTINGS_KEY))
      .limit(1)

    if (rows.length > 0 && rows[0].value) {
      return { ...ARTICLE_CONFIG_DEFAULTS, ...JSON.parse(rows[0].value) }
    }
  } catch {}

  return { ...ARTICLE_CONFIG_DEFAULTS }
}

export async function saveArticleConfig(config: ArticleGenerationConfig): Promise<void> {
  const value = JSON.stringify(config)
  const existing = await db
    .select()
    .from(siteSettings)
    .where(eq(siteSettings.key, SETTINGS_KEY))
    .limit(1)

  if (existing.length > 0) {
    await db
      .update(siteSettings)
      .set({ value, updated_at: new Date() })
      .where(eq(siteSettings.key, SETTINGS_KEY))
  } else {
    await db.insert(siteSettings).values({ key: SETTINGS_KEY, value })
  }
}

const VOICE_TONE_LABELS: Record<ArticleVoiceTone, string> = {
  profissional: 'Profissional',
  informal: 'Informal',
  tecnico: 'Técnico',
  jornalistico: 'Jornalístico',
  descontraido: 'Descontraído',
}

const LANGUAGE_LABELS: Record<ArticleLanguage, string> = {
  'pt-BR': 'Português (BR)',
  en: 'Inglês',
  es: 'Espanhol',
}

export function buildArticleConfigPromptSection(config: ArticleGenerationConfig): string {
  const parts: string[] = []

  parts.push(`CONFIGURAÇÕES DE GERAÇÃO:`)
  parts.push(`- Tamanho mínimo: ${config.minWords} palavras`)
  parts.push(`- Tom de voz: ${VOICE_TONE_LABELS[config.voiceTone]}`)
  parts.push(`- Idioma: ${LANGUAGE_LABELS[config.language]}`)

  const formats: string[] = []
  if (config.includeExamples) formats.push('exemplos práticos')
  if (config.includeLists) formats.push('listas (ul/ol)')
  if (config.includeQuotes) formats.push('blockquotes/citações')
  if (config.includeTables) formats.push('tabelas')
  if (formats.length > 0) {
    parts.push(`- Incluir: ${formats.join(', ')}`)
  }

  if (config.extraInstructions.trim()) {
    parts.push(`\nINSTRUÇÕES ADICIONAIS FIXAS:\n${config.extraInstructions.trim()}`)
  }

  return parts.join('\n')
}
