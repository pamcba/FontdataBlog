import { NextRequest, NextResponse } from 'next/server'
import { getArticleConfig, saveArticleConfig, ARTICLE_CONFIG_DEFAULTS } from '@/lib/article-config'
import type { ArticleGenerationConfig } from '@/lib/article-config'

export async function GET() {
  try {
    const config = await getArticleConfig()
    return NextResponse.json({ config })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erro interno'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json() as Partial<ArticleGenerationConfig>

    const config: ArticleGenerationConfig = {
      minWords: typeof body.minWords === 'number' ? body.minWords : ARTICLE_CONFIG_DEFAULTS.minWords,
      voiceTone: body.voiceTone ?? ARTICLE_CONFIG_DEFAULTS.voiceTone,
      language: body.language ?? ARTICLE_CONFIG_DEFAULTS.language,
      creativity: typeof body.creativity === 'number' ? Math.min(1, Math.max(0.1, body.creativity)) : ARTICLE_CONFIG_DEFAULTS.creativity,
      includeExamples: typeof body.includeExamples === 'boolean' ? body.includeExamples : ARTICLE_CONFIG_DEFAULTS.includeExamples,
      includeLists: typeof body.includeLists === 'boolean' ? body.includeLists : ARTICLE_CONFIG_DEFAULTS.includeLists,
      includeQuotes: typeof body.includeQuotes === 'boolean' ? body.includeQuotes : ARTICLE_CONFIG_DEFAULTS.includeQuotes,
      includeTables: typeof body.includeTables === 'boolean' ? body.includeTables : ARTICLE_CONFIG_DEFAULTS.includeTables,
      extraInstructions: typeof body.extraInstructions === 'string' ? body.extraInstructions : ARTICLE_CONFIG_DEFAULTS.extraInstructions,
    }

    await saveArticleConfig(config)
    return NextResponse.json({ config })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erro interno'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
