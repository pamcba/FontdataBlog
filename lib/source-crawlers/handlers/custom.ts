// lib/source-crawlers/handlers/custom.ts
import { getFirecrawlApiKey } from '@/lib/firecrawl'
import type { CrawlerHandlerOptions, CrawlerHandlerResult } from '../types'

export async function runCustomHandler(opts: CrawlerHandlerOptions): Promise<CrawlerHandlerResult> {
  if (opts.alreadyProcessedKeys.includes(opts.url)) {
    throw new Error('Esta URL já foi processada anteriormente')
  }

  const firecrawlKey = await getFirecrawlApiKey()
  if (!firecrawlKey) throw new Error('Firecrawl API key não configurada')

  const resp = await fetch('https://api.firecrawl.dev/v1/scrape', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${firecrawlKey}` },
    body: JSON.stringify({ url: opts.url, formats: ['markdown'] }),
  })
  if (!resp.ok) throw new Error(`Firecrawl scrape error: ${resp.status}`)
  const data = await resp.json() as { data?: { markdown?: string; metadata?: { title?: string } } }
  const content = data.data?.markdown ?? ''
  const title = data.data?.metadata?.title ?? opts.url

  if (!content) throw new Error(`Sem conteúdo em ${opts.url}`)

  return {
    chosen: {
      key: opts.url,
      title,
      content,
      url: opts.url,
    },
  }
}
