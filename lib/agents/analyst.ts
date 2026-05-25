// lib/agents/analyst.ts
import { callOpenRouter } from '@/lib/ai'
import { getAgentConfig } from '@/lib/agent-configs'
import { AgentContext, AgentResult } from '@/lib/agents/types'
import { getFirecrawlApiKey, getAgentsExtra, firecrawlScrape } from '@/lib/firecrawl'

async function extractTextWithJina(url: string): Promise<string> {
  try {
    const res = await fetch(`https://r.jina.ai/${url}`, {
      headers: { Accept: 'text/plain', 'X-Return-Format': 'text' },
      signal: AbortSignal.timeout(15000),
    })
    if (!res.ok) return ''
    return (await res.text()).slice(0, 6000)
  } catch {
    return ''
  }
}

export async function runAnalystAgent(
  ctx: AgentContext,
  apiKey: string
): Promise<AgentResult> {
  if (!ctx.researchLinks || ctx.researchLinks.length === 0) {
    return {
      success: true,
      message: 'Nenhum link para analisar, continuando sem resumos',
      data: { sourceSummaries: [] },
    }
  }

  const [config, agentsExtra, firecrawlKey] = await Promise.all([
    getAgentConfig('analyst'),
    getAgentsExtra(),
    getFirecrawlApiKey(),
  ])

  const useFirecrawl = !!(agentsExtra['analyst']?.use_firecrawl && firecrawlKey)
  const extractText = useFirecrawl
    ? (url: string) => firecrawlScrape(url, firecrawlKey!)
    : extractTextWithJina

  const summaries: { url: string; summary: string }[] = []

  for (const url of ctx.researchLinks.slice(0, 6)) {
    const text = await extractText(url)
    if (!text || text.length < 200) continue

    try {
      const resp = await callOpenRouter(
        {
          model: config.model,
          messages: [
            { role: 'system', content: config.prompt },
            {
              role: 'user',
              content: `Título do artigo: ${ctx.headline ?? ''}\n\nURL: ${url}\n\nConteúdo:\n${text}`,
            },
          ],
          temperature: 0.4,
          max_tokens: 600,
        },
        apiKey
      )
      const summary = resp.choices[0]?.message?.content?.trim() ?? ''
      if (summary.length > 50) summaries.push({ url, summary })
    } catch {}
  }

  const extractor = useFirecrawl ? 'Firecrawl' : 'Jina'

  if (summaries.length === 0) {
    return {
      success: true,
      message: `Nenhuma fonte acessível via ${extractor}, continuando sem resumos`,
      data: { sourceSummaries: [] },
    }
  }

  return {
    success: true,
    message: `${summaries.length} fontes analisadas (${extractor})`,
    data: { sourceSummaries: summaries },
  }
}
