// lib/agents/cta.ts
import { callOpenRouter } from '@/lib/ai'
import { getAgentConfig } from '@/lib/agent-configs'
import { AgentContext, AgentResult } from '@/lib/agents/types'

export async function runCtaAgent(
  ctx: AgentContext,
  apiKey: string
): Promise<AgentResult> {
  if (!ctx.articleContent) return { success: false, message: 'Artigo não disponível', error: 'NO_CONTENT' }

  const config = await getAgentConfig('cta')

  const briefingBlock = ctx.briefing
    ? `\nBriefing da empresa:\n${ctx.briefing.slice(0, 2000)}`
    : ''

  const plainText = ctx.articleContent.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').slice(0, 4000)

  const resp = await callOpenRouter(
    {
      model: config.model,
      messages: [
        { role: 'system', content: config.prompt },
        {
          role: 'user',
          content: `Título: ${ctx.articleTitle ?? ''}\n${briefingBlock}\n\nConteúdo do artigo:\n${plainText}`,
        },
      ],
      temperature: 0.7,
      max_tokens: 400,
    },
    apiKey
  )

  const ctaHtml = resp.choices[0]?.message?.content?.trim() ?? ''
  const contentWithCta = `${ctx.articleContent}\n\n${ctaHtml}`

  return {
    success: true,
    message: 'CTA inserido ao final do artigo',
    data: { articleContent: contentWithCta },
  }
}
