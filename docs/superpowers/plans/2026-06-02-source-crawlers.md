# Source Crawlers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a configurable Source Crawlers system that periodically fetches content from external sources (GitHub, documentation sites, custom URLs) and feeds it as `pastedText` into the existing article generation pipeline.

**Architecture:** A new `source_crawlers` DB table holds each source's config (type, URL, prompt, interval). A matching `source_crawler_items` table tracks already-processed items for deduplication. The runner (`lib/source-crawlers/runner.ts`) checks due sources, delegates to a type-specific handler that uses the LLM + the configured prompt to pick the best unprocessed item, extracts its content, then calls `createPipelineStream` with that content as `pastedText`. A cron endpoint (`app/api/cron/source-crawlers/route.ts`) triggers the runner. The admin UI lives at `/admin/fontes`.

**Tech Stack:** Next.js 14 App Router · TypeScript · Drizzle ORM · PostgreSQL · OpenRouter (via `lib/ai.ts`) · Firecrawl (via `lib/firecrawl.ts`) · GitHub REST API (public, no auth required for public repos)

---

## File Map

### New files
- `drizzle/schema.ts` — add `sourceCrawlers` and `sourceCrawlerItems` tables
- `lib/source-crawlers/types.ts` — shared types for crawlers
- `lib/source-crawlers/handlers/github.ts` — GitHub trending/search handler
- `lib/source-crawlers/handlers/docs.ts` — documentation page scraper handler
- `lib/source-crawlers/handlers/custom.ts` — generic URL scraper handler
- `lib/source-crawlers/runner.ts` — orchestrator: finds due crawlers, runs handler, calls pipeline
- `app/api/cron/source-crawlers/route.ts` — cron endpoint
- `app/api/admin/source-crawlers/route.ts` — CRUD list/create
- `app/api/admin/source-crawlers/[id]/route.ts` — CRUD update/delete + manual trigger
- `app/api/admin/source-crawlers/[id]/items/route.ts` — list run history items
- `app/admin/fontes/page.tsx` — page shell
- `app/admin/fontes/FontesClient.tsx` — full admin UI (list, create, edit, delete, run history)

### Modified files
- `drizzle/schema.ts` — append two new tables
- `app/admin/layout.tsx` — add "Fontes" nav item

---

## Task 1: DB Schema — `source_crawlers` and `source_crawler_items`

**Files:**
- Modify: `drizzle/schema.ts`

- [ ] **Step 1: Append two tables to `drizzle/schema.ts`**

Open `drizzle/schema.ts` and append at the end (after the last export), before any closing):

```ts
export const sourceCrawlers = pgTable('source_crawlers', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  type: text('type').notNull().default('custom'), // 'github' | 'docs' | 'custom'
  url: text('url').notNull(),
  prompt: text('prompt').notNull().default(''),
  interval_hours: real('interval_hours').notNull().default(24),
  enabled: boolean('enabled').notNull().default(true),
  publish_status: text('publish_status').notNull().default('published'), // 'draft' | 'published'
  last_run_at: timestamp('last_run_at'),
  next_run_at: timestamp('next_run_at'),
  last_error: text('last_error'),
  created_at: timestamp('created_at').notNull().default(sql`now()`),
  updated_at: timestamp('updated_at').notNull().default(sql`now()`),
})

export const sourceCrawlerItems = pgTable(
  'source_crawler_items',
  {
    id: serial('id').primaryKey(),
    crawler_id: integer('crawler_id')
      .notNull()
      .references(() => sourceCrawlers.id, { onDelete: 'cascade' }),
    item_key: text('item_key').notNull(), // unique identifier within this crawler (repo full_name, URL, etc.)
    item_title: text('item_title'),
    post_id: integer('post_id').references(() => posts.id, { onDelete: 'set null' }),
    status: text('status').notNull().default('done'), // 'done' | 'error'
    error: text('error'),
    processed_at: timestamp('processed_at').notNull().default(sql`now()`),
  },
  (t) => ({ uniq: uniqueIndex('source_crawler_items_crawler_item_uniq').on(t.crawler_id, t.item_key) })
)

export type SourceCrawler = typeof sourceCrawlers.$inferSelect
export type NewSourceCrawler = typeof sourceCrawlers.$inferInsert
export type SourceCrawlerItem = typeof sourceCrawlerItems.$inferSelect
```

Note: `uniqueIndex` is already imported alongside `pgTable` in the schema — confirm the import at the top of the file includes it. If not, add it to the existing drizzle-orm/pg-core import.

- [ ] **Step 2: Generate and apply migration**

```bash
npm run db:generate
npm run db:migrate
```

Expected: two new migration files created, then applied without error. If `uniqueIndex` is not imported, add it: find the line `import { pgTable, serial, text, ... } from 'drizzle-orm/pg-core'` and add `uniqueIndex` to the list.

- [ ] **Step 3: Commit**

```bash
git add drizzle/schema.ts drizzle/migrations/
git commit -m "feat(db): add source_crawlers and source_crawler_items tables"
```

---

## Task 2: Shared Types

**Files:**
- Create: `lib/source-crawlers/types.ts`

- [ ] **Step 1: Create types file**

```ts
// lib/source-crawlers/types.ts

export type CrawlerType = 'github' | 'docs' | 'custom'

export interface CrawlerCandidate {
  key: string        // unique identifier (repo full_name, URL path, etc.)
  title: string      // human-readable title shown to LLM for selection
  content: string    // full text content to use as pastedText
  url: string        // source URL for reference
}

export interface CrawlerHandlerOptions {
  url: string
  prompt: string
  alreadyProcessedKeys: string[]
}

export interface CrawlerHandlerResult {
  chosen: CrawlerCandidate
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/source-crawlers/types.ts
git commit -m "feat(source-crawlers): add shared types"
```

---

## Task 3: GitHub Handler

**Files:**
- Create: `lib/source-crawlers/handlers/github.ts`

The GitHub handler queries the GitHub Search API for repositories matching the `url` field (treated as a search query, e.g. `"AI skills site:github.com"` or just `"ai tools"`), fetches the top results, filters out already-processed repos, asks the LLM (using the `prompt` field) to pick the most relevant one, then fetches the repo's README as the article content.

- [ ] **Step 1: Create the handler**

```ts
// lib/source-crawlers/handlers/github.ts
import { callOpenRouter, getAIApiKey } from '@/lib/ai'
import type { CrawlerHandlerOptions, CrawlerHandlerResult, CrawlerCandidate } from '../types'

interface GithubRepo {
  full_name: string
  name: string
  description: string | null
  html_url: string
  stargazers_count: number
  topics: string[]
}

async function searchRepos(query: string): Promise<GithubRepo[]> {
  const encoded = encodeURIComponent(query)
  const resp = await fetch(
    `https://api.github.com/search/repositories?q=${encoded}&sort=stars&order=desc&per_page=20`,
    { headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' } }
  )
  if (!resp.ok) throw new Error(`GitHub API error: ${resp.status}`)
  const data = await resp.json() as { items: GithubRepo[] }
  return data.items ?? []
}

async function fetchReadme(fullName: string): Promise<string> {
  const resp = await fetch(`https://api.github.com/repos/${fullName}/readme`, {
    headers: { Accept: 'application/vnd.github.raw+json', 'X-GitHub-Api-Version': '2022-11-28' },
  })
  if (!resp.ok) return ''
  return await resp.text()
}

async function pickRepo(
  repos: GithubRepo[],
  prompt: string,
  apiKey: string
): Promise<GithubRepo> {
  if (repos.length === 1) return repos[0]

  const list = repos.map((r, i) => `${i + 1}. ${r.full_name} — ${r.description ?? 'sem descrição'} (${r.stargazers_count} stars)`).join('\n')

  const systemPrompt = `Você é um curador de conteúdo para um blog. ${prompt}\n\nEscolha o repositório mais adequado para gerar um artigo de blog interessante e ainda não explorado. Responda APENAS com o número da opção escolhida (ex: 3).`

  const resp = await callOpenRouter(
    { model: 'openai/gpt-4o-mini', messages: [{ role: 'user', content: `Repositórios disponíveis:\n${list}` }], temperature: 0.3, max_tokens: 10 },
    apiKey,
    systemPrompt
  )
  const raw = resp.choices[0]?.message?.content?.trim() ?? '1'
  const idx = parseInt(raw, 10) - 1
  return repos[Math.max(0, Math.min(idx, repos.length - 1))]
}

export async function runGithubHandler(opts: CrawlerHandlerOptions): Promise<CrawlerHandlerResult> {
  const apiKey = await getAIApiKey()
  if (!apiKey) throw new Error('AI API key não configurada')

  const repos = await searchRepos(opts.url)
  const fresh = repos.filter((r) => !opts.alreadyProcessedKeys.includes(r.full_name))
  if (fresh.length === 0) throw new Error('Nenhum repositório novo encontrado')

  const chosen = await pickRepo(fresh, opts.prompt, apiKey)
  const readme = await fetchReadme(chosen.full_name)

  const content = `# ${chosen.full_name}\n\n${chosen.description ?? ''}\n\nURL: ${chosen.html_url}\n\nStars: ${chosen.stargazers_count}\n\nTópicos: ${chosen.topics.join(', ')}\n\n---\n\n${readme}`

  return {
    chosen: {
      key: chosen.full_name,
      title: chosen.name,
      content,
      url: chosen.html_url,
    },
  }
}
```

Note: `callOpenRouter` currently has signature `callOpenRouter(options, apiKey)`. Check `lib/ai.ts` — if it does not accept a third `systemPrompt` argument, pass the system prompt as the first message with `role: 'system'` instead:

```ts
messages: [
  { role: 'system', content: systemPrompt },
  { role: 'user', content: `Repositórios disponíveis:\n${list}` }
]
```

Remove the third argument call. Use this pattern in all handlers.

- [ ] **Step 2: Commit**

```bash
git add lib/source-crawlers/handlers/github.ts
git commit -m "feat(source-crawlers): add GitHub handler"
```

---

## Task 4: Docs Handler

**Files:**
- Create: `lib/source-crawlers/handlers/docs.ts`

The docs handler treats `url` as a documentation site base URL. It uses Firecrawl to discover subpages (crawl with depth 1), filters out already-seen URLs, asks the LLM to pick the most relevant page based on the `prompt`, then scrapes the full content of the chosen page.

- [ ] **Step 1: Create the handler**

```ts
// lib/source-crawlers/handlers/docs.ts
import { getFirecrawlApiKey } from '@/lib/firecrawl'
import { callOpenRouter, getAIApiKey } from '@/lib/ai'
import type { CrawlerHandlerOptions, CrawlerHandlerResult } from '../types'

interface PageEntry {
  url: string
  title: string
  description: string
}

async function discoverPages(baseUrl: string, firecrawlKey: string): Promise<PageEntry[]> {
  const resp = await fetch('https://api.firecrawl.dev/v1/map', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${firecrawlKey}` },
    body: JSON.stringify({ url: baseUrl, limit: 30 }),
  })
  if (!resp.ok) throw new Error(`Firecrawl map error: ${resp.status}`)
  const data = await resp.json() as { links?: string[] }
  return (data.links ?? []).map((u) => ({ url: u, title: u, description: '' }))
}

async function scrapeContent(url: string, firecrawlKey: string): Promise<string> {
  const resp = await fetch('https://api.firecrawl.dev/v1/scrape', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${firecrawlKey}` },
    body: JSON.stringify({ url, formats: ['markdown'] }),
  })
  if (!resp.ok) throw new Error(`Firecrawl scrape error: ${resp.status}`)
  const data = await resp.json() as { data?: { markdown?: string } }
  return data.data?.markdown ?? ''
}

async function pickPage(pages: PageEntry[], prompt: string, apiKey: string): Promise<PageEntry> {
  if (pages.length === 1) return pages[0]

  const list = pages.map((p, i) => `${i + 1}. ${p.url}`).join('\n')
  const resp = await callOpenRouter(
    {
      model: 'openai/gpt-4o-mini',
      messages: [
        { role: 'system', content: `Você é um curador de conteúdo para um blog. ${prompt}\n\nEscolha a página de documentação mais adequada para gerar um artigo de blog interessante. Responda APENAS com o número da opção escolhida (ex: 3).` },
        { role: 'user', content: `Páginas disponíveis:\n${list}` },
      ],
      temperature: 0.3,
      max_tokens: 10,
    },
    apiKey
  )
  const raw = resp.choices[0]?.message?.content?.trim() ?? '1'
  const idx = parseInt(raw, 10) - 1
  return pages[Math.max(0, Math.min(idx, pages.length - 1))]
}

export async function runDocsHandler(opts: CrawlerHandlerOptions): Promise<CrawlerHandlerResult> {
  const firecrawlKey = await getFirecrawlApiKey()
  if (!firecrawlKey) throw new Error('Firecrawl API key não configurada')
  const apiKey = await getAIApiKey()
  if (!apiKey) throw new Error('AI API key não configurada')

  const pages = await discoverPages(opts.url, firecrawlKey)
  const fresh = pages.filter((p) => !opts.alreadyProcessedKeys.includes(p.url))
  if (fresh.length === 0) throw new Error('Nenhuma página nova encontrada')

  const chosen = await pickPage(fresh, opts.prompt, apiKey)
  const content = await scrapeContent(chosen.url, firecrawlKey)
  if (!content) throw new Error(`Falha ao raspar conteúdo de ${chosen.url}`)

  return {
    chosen: {
      key: chosen.url,
      title: chosen.title || chosen.url,
      content,
      url: chosen.url,
    },
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/source-crawlers/handlers/docs.ts
git commit -m "feat(source-crawlers): add Docs handler"
```

---

## Task 5: Custom Handler

**Files:**
- Create: `lib/source-crawlers/handlers/custom.ts`

The custom handler scrapes a single URL with Firecrawl. Since there is only one source URL and no list to pick from, the LLM prompt is used to instruct the Analyst agent later (passed through as part of the content). The item key is the URL itself.

- [ ] **Step 1: Create the handler**

```ts
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
```

- [ ] **Step 2: Commit**

```bash
git add lib/source-crawlers/handlers/custom.ts
git commit -m "feat(source-crawlers): add Custom handler"
```

---

## Task 6: Runner

**Files:**
- Create: `lib/source-crawlers/runner.ts`

The runner finds all enabled source crawlers with `next_run_at <= now()` (or null), runs them one at a time, and for each: loads already-processed keys, calls the appropriate handler, then calls `createPipelineStream` with the content as `pastedText`. Records the result in `source_crawler_items` and updates `next_run_at`.

- [ ] **Step 1: Create the runner**

```ts
// lib/source-crawlers/runner.ts
import { db } from '@/drizzle/db'
import { sourceCrawlers, sourceCrawlerItems } from '@/drizzle/schema'
import { eq, lte, isNull, or } from 'drizzle-orm'
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
  const due = await db
    .select()
    .from(sourceCrawlers)
    .where(
      eq(sourceCrawlers.enabled, true)
    )

  const actuallyDue = due.filter(
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
```

- [ ] **Step 2: Commit**

```bash
git add lib/source-crawlers/runner.ts
git commit -m "feat(source-crawlers): add runner orchestrator"
```

---

## Task 7: Cron Endpoint

**Files:**
- Create: `app/api/cron/source-crawlers/route.ts`

- [ ] **Step 1: Create the cron route**

```ts
// app/api/cron/source-crawlers/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { runDueCrawlers } from '@/lib/source-crawlers/runner'

export const maxDuration = 800
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!serviceRoleKey || authHeader !== `Bearer ${serviceRoleKey}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const results = await runDueCrawlers()
    const successful = results.filter((r) => r.success)
    const failed = results.filter((r) => !r.success)

    return NextResponse.json({
      ok: true,
      crawlers_run: results.length,
      articles_generated: successful.length,
      errors: failed.map((r) => ({ crawler: r.crawlerName, error: r.error })),
      results,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[Cron Source Crawlers] failed:', message)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/cron/source-crawlers/route.ts
git commit -m "feat(source-crawlers): add cron endpoint"
```

---

## Task 8: Admin API Routes

**Files:**
- Create: `app/api/admin/source-crawlers/route.ts`
- Create: `app/api/admin/source-crawlers/[id]/route.ts`
- Create: `app/api/admin/source-crawlers/[id]/items/route.ts`

- [ ] **Step 1: Create list/create route**

```ts
// app/api/admin/source-crawlers/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/drizzle/db'
import { sourceCrawlers, sourceCrawlerItems } from '@/drizzle/schema'
import { desc, eq, sql } from 'drizzle-orm'

export async function GET() {
  const crawlers = await db.select().from(sourceCrawlers).orderBy(desc(sourceCrawlers.created_at))

  const counts = await db
    .select({
      crawler_id: sourceCrawlerItems.crawler_id,
      total: sql<number>`count(*)::int`,
      done: sql<number>`count(*) filter (where status = 'done')::int`,
    })
    .from(sourceCrawlerItems)
    .groupBy(sourceCrawlerItems.crawler_id)

  const countMap = Object.fromEntries(counts.map((c) => [c.crawler_id, c]))

  return NextResponse.json({
    crawlers: crawlers.map((c) => ({
      ...c,
      items_total: countMap[c.id]?.total ?? 0,
      items_done: countMap[c.id]?.done ?? 0,
    })),
  })
}

export async function POST(request: NextRequest) {
  const body = await request.json() as {
    name?: string
    type?: string
    url?: string
    prompt?: string
    interval_hours?: number
    enabled?: boolean
    publish_status?: string
  }

  if (!body.name?.trim() || !body.url?.trim()) {
    return NextResponse.json({ error: 'Nome e URL são obrigatórios' }, { status: 400 })
  }

  const [crawler] = await db.insert(sourceCrawlers).values({
    name: body.name.trim(),
    type: body.type ?? 'custom',
    url: body.url.trim(),
    prompt: body.prompt?.trim() ?? '',
    interval_hours: body.interval_hours ?? 24,
    enabled: body.enabled ?? true,
    publish_status: body.publish_status ?? 'published',
  }).returning()

  return NextResponse.json({ crawler }, { status: 201 })
}
```

- [ ] **Step 2: Create update/delete/trigger route**

```ts
// app/api/admin/source-crawlers/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/drizzle/db'
import { sourceCrawlers } from '@/drizzle/schema'
import { eq } from 'drizzle-orm'
import { runSingleCrawler } from '@/lib/source-crawlers/runner'

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const id = parseInt(params.id, 10)
  const body = await request.json() as Partial<{
    name: string
    type: string
    url: string
    prompt: string
    interval_hours: number
    enabled: boolean
    publish_status: string
  }>

  const [updated] = await db.update(sourceCrawlers)
    .set({ ...body, updated_at: new Date() })
    .where(eq(sourceCrawlers.id, id))
    .returning()

  if (!updated) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })
  return NextResponse.json({ crawler: updated })
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const id = parseInt(params.id, 10)
  await db.delete(sourceCrawlers).where(eq(sourceCrawlers.id, id))
  return NextResponse.json({ ok: true })
}

export async function POST(_: NextRequest, { params }: { params: { id: string } }) {
  // Manual trigger
  const id = parseInt(params.id, 10)
  try {
    const result = await runSingleCrawler(id)
    return NextResponse.json({ ok: true, result })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
```

- [ ] **Step 3: Create items history route**

```ts
// app/api/admin/source-crawlers/[id]/items/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/drizzle/db'
import { sourceCrawlerItems } from '@/drizzle/schema'
import { eq, desc } from 'drizzle-orm'

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const crawlerId = parseInt(params.id, 10)
  const items = await db
    .select()
    .from(sourceCrawlerItems)
    .where(eq(sourceCrawlerItems.crawler_id, crawlerId))
    .orderBy(desc(sourceCrawlerItems.processed_at))
    .limit(50)
  return NextResponse.json({ items })
}
```

- [ ] **Step 4: Commit**

```bash
git add app/api/admin/source-crawlers/
git commit -m "feat(source-crawlers): add admin API routes (CRUD + manual trigger + history)"
```

---

## Task 9: Admin UI — `/admin/fontes`

**Files:**
- Create: `app/admin/fontes/page.tsx`
- Create: `app/admin/fontes/FontesClient.tsx`

The UI follows the same pattern as `RSSSection.tsx`: a list of crawlers, a modal for create/edit, a toggle for enabled/disabled, a "Executar agora" button, and a panel showing the run history (items) for the selected crawler.

- [ ] **Step 1: Create page shell**

```ts
// app/admin/fontes/page.tsx
import FontesClient from './FontesClient'

export default function FontesPage() {
  return <FontesClient />
}
```

- [ ] **Step 2: Create FontesClient component**

Create `app/admin/fontes/FontesClient.tsx` with the following complete implementation:

```tsx
'use client'
import { useState, useEffect, useCallback } from 'react'

type CrawlerType = 'github' | 'docs' | 'custom'
type PublishStatus = 'draft' | 'published'

interface SourceCrawler {
  id: number
  name: string
  type: CrawlerType
  url: string
  prompt: string
  interval_hours: number
  enabled: boolean
  publish_status: PublishStatus
  last_run_at: string | null
  next_run_at: string | null
  last_error: string | null
  created_at: string
  items_total: number
  items_done: number
}

interface CrawlerItem {
  id: number
  crawler_id: number
  item_key: string
  item_title: string | null
  post_id: number | null
  status: string
  error: string | null
  processed_at: string
}

interface Toast { type: 'success' | 'error'; msg: string }

const TYPE_LABELS: Record<CrawlerType, string> = {
  github: 'GitHub',
  docs: 'Documentação',
  custom: 'URL Customizada',
}

const TYPE_ICONS: Record<CrawlerType, string> = {
  github: '⚙️',
  docs: '📖',
  custom: '🔗',
}

const INTERVAL_OPTIONS = [
  { value: 1, label: '1 hora' },
  { value: 6, label: '6 horas' },
  { value: 12, label: '12 horas' },
  { value: 24, label: '24 horas' },
  { value: 48, label: '48 horas' },
  { value: 168, label: '1 semana' },
]

const EMPTY_FORM = {
  name: '',
  type: 'github' as CrawlerType,
  url: '',
  prompt: '',
  interval_hours: 24,
  enabled: true,
  publish_status: 'published' as PublishStatus,
}

const URL_HINTS: Record<CrawlerType, string> = {
  github: 'Termo de busca do GitHub (ex: "AI tools machine learning")',
  docs: 'URL base da documentação (ex: https://docs.anthropic.com)',
  custom: 'URL específica para raspar (ex: https://example.com/page)',
}

export default function FontesClient() {
  const [crawlers, setCrawlers] = useState<SourceCrawler[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form, setForm] = useState({ ...EMPTY_FORM })
  const [saving, setSaving] = useState(false)
  const [runningId, setRunningId] = useState<number | null>(null)
  const [selectedCrawler, setSelectedCrawler] = useState<SourceCrawler | null>(null)
  const [items, setItems] = useState<CrawlerItem[]>([])
  const [loadingItems, setLoadingItems] = useState(false)
  const [toast, setToast] = useState<Toast | null>(null)

  const showToast = (type: 'success' | 'error', msg: string) => {
    setToast({ type, msg })
    setTimeout(() => setToast(null), 3500)
  }

  const fetchCrawlers = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/source-crawlers')
      const data = await res.json() as { crawlers: SourceCrawler[] }
      setCrawlers(data.crawlers ?? [])
    } catch {
      showToast('error', 'Erro ao carregar fontes')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchCrawlers() }, [fetchCrawlers])

  const fetchItems = async (crawlerId: number) => {
    setLoadingItems(true)
    try {
      const res = await fetch(`/api/admin/source-crawlers/${crawlerId}/items`)
      const data = await res.json() as { items: CrawlerItem[] }
      setItems(data.items ?? [])
    } finally {
      setLoadingItems(false)
    }
  }

  const openCreate = () => {
    setEditingId(null)
    setForm({ ...EMPTY_FORM })
    setShowModal(true)
  }

  const openEdit = (c: SourceCrawler) => {
    setEditingId(c.id)
    setForm({
      name: c.name,
      type: c.type,
      url: c.url,
      prompt: c.prompt,
      interval_hours: c.interval_hours,
      enabled: c.enabled,
      publish_status: c.publish_status,
    })
    setShowModal(true)
  }

  const handleSave = async () => {
    if (!form.name.trim() || !form.url.trim()) {
      showToast('error', 'Nome e URL são obrigatórios')
      return
    }
    setSaving(true)
    try {
      if (editingId) {
        await fetch(`/api/admin/source-crawlers/${editingId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        })
        showToast('success', 'Fonte atualizada')
      } else {
        await fetch('/api/admin/source-crawlers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        })
        showToast('success', 'Fonte criada')
      }
      setShowModal(false)
      await fetchCrawlers()
    } catch {
      showToast('error', 'Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: number) => {
    if (!confirm('Remover esta fonte?')) return
    await fetch(`/api/admin/source-crawlers/${id}`, { method: 'DELETE' })
    if (selectedCrawler?.id === id) setSelectedCrawler(null)
    await fetchCrawlers()
    showToast('success', 'Fonte removida')
  }

  const handleToggle = async (c: SourceCrawler) => {
    await fetch(`/api/admin/source-crawlers/${c.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: !c.enabled }),
    })
    await fetchCrawlers()
  }

  const handleRun = async (id: number) => {
    setRunningId(id)
    try {
      const res = await fetch(`/api/admin/source-crawlers/${id}`, { method: 'POST' })
      const data = await res.json() as { ok: boolean; error?: string }
      if (data.ok) {
        showToast('success', 'Artigo gerado com sucesso!')
        await fetchCrawlers()
        if (selectedCrawler?.id === id) await fetchItems(id)
      } else {
        showToast('error', data.error ?? 'Erro ao executar')
      }
    } catch {
      showToast('error', 'Erro ao executar fonte')
    } finally {
      setRunningId(null)
    }
  }

  const selectCrawler = (c: SourceCrawler) => {
    setSelectedCrawler(c)
    fetchItems(c.id)
  }

  const fmtDate = (d: string | null) => {
    if (!d) return '—'
    return new Date(d).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
  }

  return (
    <div className="space-y-6">
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-sm font-medium text-white ${toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'}`}>
          {toast.msg}
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--at-text-primary)' }}>Fontes de Conteúdo</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--at-text-muted)' }}>
            Agentes que buscam conteúdo externo e geram artigos automaticamente
          </p>
        </div>
        <button
          onClick={openCreate}
          className="px-4 py-2 rounded-lg text-sm font-medium text-white"
          style={{ background: 'var(--at-brand)' }}
        >
          + Nova Fonte
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Crawler list */}
        <div className="space-y-3">
          {loading ? (
            <p className="text-sm" style={{ color: 'var(--at-text-muted)' }}>Carregando...</p>
          ) : crawlers.length === 0 ? (
            <div className="text-center py-12 rounded-xl border border-dashed" style={{ borderColor: 'var(--at-border)', color: 'var(--at-text-muted)' }}>
              <p className="text-sm">Nenhuma fonte configurada ainda.</p>
              <button onClick={openCreate} className="mt-2 text-sm underline" style={{ color: 'var(--at-brand)' }}>Criar a primeira</button>
            </div>
          ) : crawlers.map((c) => (
            <div
              key={c.id}
              onClick={() => selectCrawler(c)}
              className={`p-4 rounded-xl border cursor-pointer transition-all ${selectedCrawler?.id === c.id ? 'ring-2' : ''}`}
              style={{
                background: 'var(--at-card-bg)',
                borderColor: selectedCrawler?.id === c.id ? 'var(--at-brand)' : 'var(--at-border)',
                '--tw-ring-color': 'var(--at-brand)',
              } as React.CSSProperties}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-lg shrink-0">{TYPE_ICONS[c.type]}</span>
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate" style={{ color: 'var(--at-text-primary)' }}>{c.name}</p>
                    <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--at-text-muted)' }}>{TYPE_LABELS[c.type]} · a cada {c.interval_hours}h</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={(e) => { e.stopPropagation(); handleToggle(c) }}
                    className={`relative w-9 h-5 rounded-full transition-colors ${c.enabled ? 'bg-green-500' : 'bg-gray-300'}`}
                  >
                    <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${c.enabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleRun(c.id) }}
                    disabled={runningId === c.id}
                    className="text-xs px-2 py-1 rounded-md font-medium transition-opacity disabled:opacity-50"
                    style={{ background: 'var(--at-brand)', color: 'white' }}
                  >
                    {runningId === c.id ? '...' : '▶'}
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); openEdit(c) }}
                    className="text-xs px-2 py-1 rounded-md"
                    style={{ background: 'var(--at-hover)', color: 'var(--at-text-secondary)' }}
                  >✏️</button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDelete(c.id) }}
                    className="text-xs px-2 py-1 rounded-md text-red-500"
                    style={{ background: 'var(--at-hover)' }}
                  >🗑️</button>
                </div>
              </div>

              <div className="mt-3 flex items-center gap-4 text-xs" style={{ color: 'var(--at-text-muted)' }}>
                <span>✅ {c.items_done} artigos</span>
                <span>Última execução: {fmtDate(c.last_run_at)}</span>
                <span>Próxima: {fmtDate(c.next_run_at)}</span>
              </div>

              {c.last_error && (
                <p className="mt-2 text-xs text-red-500 truncate">⚠️ {c.last_error}</p>
              )}
            </div>
          ))}
        </div>

        {/* Run history panel */}
        {selectedCrawler && (
          <div className="rounded-xl border p-4 space-y-3" style={{ background: 'var(--at-card-bg)', borderColor: 'var(--at-border)' }}>
            <h2 className="font-semibold text-sm" style={{ color: 'var(--at-text-primary)' }}>
              Histórico — {selectedCrawler.name}
            </h2>
            {loadingItems ? (
              <p className="text-xs" style={{ color: 'var(--at-text-muted)' }}>Carregando...</p>
            ) : items.length === 0 ? (
              <p className="text-xs" style={{ color: 'var(--at-text-muted)' }}>Nenhuma execução ainda.</p>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {items.map((item) => (
                  <div key={item.id} className="text-xs p-2 rounded-lg" style={{ background: 'var(--at-hover)' }}>
                    <div className="flex items-center justify-between gap-2">
                      <span className={`font-medium ${item.status === 'done' ? 'text-green-600' : 'text-red-500'}`}>
                        {item.status === 'done' ? '✅' : '❌'} {item.item_title ?? item.item_key}
                      </span>
                      <span style={{ color: 'var(--at-text-muted)' }}>{fmtDate(item.processed_at)}</span>
                    </div>
                    {item.post_id && (
                      <a
                        href={`/admin/artigos/${item.post_id}`}
                        className="mt-1 block text-xs underline"
                        style={{ color: 'var(--at-brand)' }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        Ver artigo #{item.post_id}
                      </a>
                    )}
                    {item.error && <p className="mt-1 text-red-400 truncate">{item.error}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }}>
          <div className="w-full max-w-lg rounded-2xl shadow-xl p-6 space-y-4" style={{ background: 'var(--at-card-bg)' }}>
            <h2 className="font-bold text-lg" style={{ color: 'var(--at-text-primary)' }}>
              {editingId ? 'Editar Fonte' : 'Nova Fonte'}
            </h2>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--at-text-secondary)' }}>Nome</label>
                <input
                  className="w-full rounded-lg px-3 py-2 text-sm border"
                  style={{ background: 'var(--at-input-bg)', borderColor: 'var(--at-border)', color: 'var(--at-text-primary)' }}
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Ex: GitHub AI Repos"
                />
              </div>

              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--at-text-secondary)' }}>Tipo</label>
                <select
                  className="w-full rounded-lg px-3 py-2 text-sm border"
                  style={{ background: 'var(--at-input-bg)', borderColor: 'var(--at-border)', color: 'var(--at-text-primary)' }}
                  value={form.type}
                  onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as CrawlerType }))}
                >
                  {(Object.keys(TYPE_LABELS) as CrawlerType[]).map((t) => (
                    <option key={t} value={t}>{TYPE_ICONS[t]} {TYPE_LABELS[t]}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--at-text-secondary)' }}>
                  {form.type === 'github' ? 'Termo de busca' : 'URL'}
                </label>
                <input
                  className="w-full rounded-lg px-3 py-2 text-sm border"
                  style={{ background: 'var(--at-input-bg)', borderColor: 'var(--at-border)', color: 'var(--at-text-primary)' }}
                  value={form.url}
                  onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
                  placeholder={URL_HINTS[form.type]}
                />
                <p className="text-xs mt-1" style={{ color: 'var(--at-text-muted)' }}>{URL_HINTS[form.type]}</p>
              </div>

              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--at-text-secondary)' }}>Prompt de direcionamento</label>
                <textarea
                  rows={3}
                  className="w-full rounded-lg px-3 py-2 text-sm border resize-none"
                  style={{ background: 'var(--at-input-bg)', borderColor: 'var(--at-border)', color: 'var(--at-text-primary)' }}
                  value={form.prompt}
                  onChange={(e) => setForm((f) => ({ ...f, prompt: e.target.value }))}
                  placeholder="Ex: Prefira repositórios sobre IA generativa e LLMs que tenham mais de 1000 stars e sejam relevantes para desenvolvedores brasileiros."
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: 'var(--at-text-secondary)' }}>Intervalo</label>
                  <select
                    className="w-full rounded-lg px-3 py-2 text-sm border"
                    style={{ background: 'var(--at-input-bg)', borderColor: 'var(--at-border)', color: 'var(--at-text-primary)' }}
                    value={form.interval_hours}
                    onChange={(e) => setForm((f) => ({ ...f, interval_hours: parseFloat(e.target.value) }))}
                  >
                    {INTERVAL_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: 'var(--at-text-secondary)' }}>Publicar como</label>
                  <select
                    className="w-full rounded-lg px-3 py-2 text-sm border"
                    style={{ background: 'var(--at-input-bg)', borderColor: 'var(--at-border)', color: 'var(--at-text-primary)' }}
                    value={form.publish_status}
                    onChange={(e) => setForm((f) => ({ ...f, publish_status: e.target.value as PublishStatus }))}
                  >
                    <option value="published">Publicado</option>
                    <option value="draft">Rascunho</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
                style={{ background: 'var(--at-brand)' }}
              >
                {saving ? 'Salvando...' : 'Salvar'}
              </button>
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 rounded-lg text-sm"
                style={{ background: 'var(--at-hover)', color: 'var(--at-text-secondary)' }}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add app/admin/fontes/
git commit -m "feat(source-crawlers): add admin UI at /admin/fontes"
```

---

## Task 10: Add Nav Item to Admin Sidebar

**Files:**
- Modify: `app/admin/layout.tsx`

- [ ] **Step 1: Add "Fontes" to navItems array**

In `app/admin/layout.tsx`, find the `navItems` array. After the `{ href: '/admin/artigos', ... }` entry and before `{ href: '/admin/newsletter', ... }`, insert:

```ts
  {
    href: '/admin/fontes',
    label: 'Fontes',
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
    ),
  },
```

- [ ] **Step 2: Commit**

```bash
git add app/admin/layout.tsx
git commit -m "feat(source-crawlers): add Fontes nav item to admin sidebar"
```

---

## Task 11: Push to GitHub

- [ ] **Step 1: Push all commits**

```bash
git push origin master
```

Expected: all commits pushed, Vercel picks up and deploys automatically.
