// lib/source-crawlers/runner.ts
import { db } from '@/drizzle/db'
import { sourceCrawlers, sourceCrawlerItems } from '@/drizzle/schema'
import { eq } from 'drizzle-orm'
import { createPipelineStream } from '@/lib/agent-pipeline'
import type { PipelineEvent } from '@/lib/agents/types'
import { runGithubHandler } from './handlers/github'
import { runDocsHandler } from './handlers/docs'
import { runCustomHandler } from './handlers/custom'
import type { CrawlerHandlerOptions } from './types'

export interface CrawlerRunResult {
  crawlerId: number
  crawlerName: string
  success: boolean
  postId?: number
  itemKey?: string
  error?: string
}

async function getAlreadyProcessedKeys(crawlerId: number): Promise<string[]> {
  const rows = await db
    .select({ item_key: sourceCrawlerItems.item_key })
    .from(sourceCrawlerItems)
    .where(eq(sourceCrawlerItems.crawler_id, crawlerId))
  return rows.map((r) => r.item_key)
}

async function runHandler(type: string, opts: CrawlerHandlerOptions) {
  if (type === 'github') return runGithubHandler(opts)
  if (type === 'docs') return runDocsHandler(opts)
  return runCustomHandler(opts)
}

async function consumeStream(stream: ReadableStream): Promise<PipelineEvent | null> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let lastEvent: PipelineEvent | null = null

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const parts = buffer.split('\n\n')
    buffer = parts.pop() ?? ''
    for (const part of parts) {
      const line = part.replace(/^data: /, '').trim()
      if (!line) continue
      try { lastEvent = JSON.parse(line) as PipelineEvent } catch {}
    }
  }
  return lastEvent
}

export async function runDueCrawlers(): Promise<CrawlerRunResult[]> {
  const now = new Date()
  const all = await db
    .select()
    .from(sourceCrawlers)
    .where(eq(sourceCrawlers.enabled, true))

  const actuallyDue = all.filter(
    (c) => !c.next_run_at || new Date(c.next_run_at) <= now
  )

  const results: CrawlerRunResult[] = []

  for (const crawler of actuallyDue) {
    const alreadyProcessedKeys = await getAlreadyProcessedKeys(crawler.id)

    try {
      const handlerResult = await runHandler(crawler.type, {
        url: crawler.url,
        prompt: crawler.prompt,
        alreadyProcessedKeys,
      })

      const { chosen } = handlerResult

      const stream = createPipelineStream({
        themeIds: [],
        triggers: { publishStatus: crawler.publish_status as 'draft' | 'published' },
        initialContext: { pastedText: chosen.content },
      })

      const lastEvent = await consumeStream(stream)
      const postId = lastEvent?.data?.post_id as number | undefined
      const success = lastEvent?.type === 'pipeline_done'

      await db.insert(sourceCrawlerItems).values({
        crawler_id: crawler.id,
        item_key: chosen.key,
        item_title: chosen.title,
        post_id: postId ?? null,
        status: success ? 'done' : 'error',
        error: success ? null : (lastEvent?.message ?? 'Pipeline falhou'),
      }).onConflictDoNothing()

      const nextRun = new Date(now.getTime() + crawler.interval_hours * 60 * 60 * 1000)
      await db.update(sourceCrawlers).set({
        last_run_at: now,
        next_run_at: nextRun,
        last_error: success ? null : (lastEvent?.message ?? 'Pipeline falhou'),
        updated_at: now,
      }).where(eq(sourceCrawlers.id, crawler.id))

      results.push({ crawlerId: crawler.id, crawlerName: crawler.name, success, postId, itemKey: chosen.key })
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err)
      const nextRun = new Date(now.getTime() + crawler.interval_hours * 60 * 60 * 1000)
      await db.update(sourceCrawlers).set({
        last_run_at: now,
        next_run_at: nextRun,
        last_error: error,
        updated_at: now,
      }).where(eq(sourceCrawlers.id, crawler.id))
      results.push({ crawlerId: crawler.id, crawlerName: crawler.name, success: false, error })
    }
  }

  return results
}

export async function runSingleCrawler(crawlerId: number): Promise<CrawlerRunResult> {
  const [crawler] = await db.select().from(sourceCrawlers).where(eq(sourceCrawlers.id, crawlerId)).limit(1)
  if (!crawler) throw new Error('Crawler não encontrado')

  const now = new Date()
  const alreadyProcessedKeys = await getAlreadyProcessedKeys(crawler.id)

  const handlerResult = await runHandler(crawler.type, {
    url: crawler.url,
    prompt: crawler.prompt,
    alreadyProcessedKeys,
  })

  const { chosen } = handlerResult

  const stream = createPipelineStream({
    themeIds: [],
    triggers: { publishStatus: crawler.publish_status as 'draft' | 'published' },
    initialContext: { pastedText: chosen.content },
  })

  const lastEvent = await consumeStream(stream)
  const postId = lastEvent?.data?.post_id as number | undefined
  const success = lastEvent?.type === 'pipeline_done'

  await db.insert(sourceCrawlerItems).values({
    crawler_id: crawler.id,
    item_key: chosen.key,
    item_title: chosen.title,
    post_id: postId ?? null,
    status: success ? 'done' : 'error',
    error: success ? null : (lastEvent?.message ?? 'Pipeline falhou'),
  }).onConflictDoNothing()

  const nextRun = new Date(now.getTime() + crawler.interval_hours * 60 * 60 * 1000)
  await db.update(sourceCrawlers).set({
    last_run_at: now,
    next_run_at: nextRun,
    last_error: success ? null : (lastEvent?.message ?? 'Pipeline falhou'),
    updated_at: now,
  }).where(eq(sourceCrawlers.id, crawler.id))

  return { crawlerId: crawler.id, crawlerName: crawler.name, success, postId, itemKey: chosen.key }
}
