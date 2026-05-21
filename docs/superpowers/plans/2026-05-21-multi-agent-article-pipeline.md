# Multi-Agent Article Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single-function automation cycle with a 7-agent pipeline (Headline → Researcher → Analyst → Copywriter → Reviewer → CTA → Designer → Publisher) that streams real-time progress via SSE, with each agent fully configurable (prompt + LLM model) from the admin UI under `/admin/artigos` replacing the current "Prompts de IA" section with an "Agentes" section.

**Architecture:** Each agent is an isolated async function in `lib/agents/<name>.ts` that receives a typed context bag and returns a typed result. The pipeline orchestrator in `lib/agent-pipeline.ts` calls agents in sequence and writes SSE events through a `ReadableStream`. A new `agent_configs` table in the DB stores per-agent prompt + model. The admin UI replaces `PromptsSection` with `AgentsSection` showing each agent's card with editable prompt, model picker, and "Generate with AI" button.

**Tech Stack:** Next.js 14 App Router · TypeScript · Drizzle ORM · SSE (ReadableStream) · OpenRouter (via existing `lib/ai.ts`) · cheerio (HTML parsing for scraper) · existing `supabaseAdmin` for image uploads

---

## File Map

### New files
- `lib/agents/types.ts` — shared types: `AgentContext`, `AgentResult`, `AgentId`, `AgentConfig`, `PipelineEvent`
- `lib/agents/headline.ts` — picks a theme and generates the article headline/title
- `lib/agents/researcher.ts` — searches the web (DuckDuckGo HTML scrape) and returns list of links
- `lib/agents/analyst.ts` — fetches each link, extracts text, produces per-source summaries
- `lib/agents/copywriter.ts` — writes the full article HTML from title + summaries
- `lib/agents/reviewer.ts` — validates grammar, rules, returns approval or correction requests
- `lib/agents/cta.ts` — appends a contextual CTA paragraph
- `lib/agents/designer.ts` — generates image prompt → calls `callOpenRouterImage` → uploads to Supabase
- `lib/agents/publisher.ts` — inserts post to DB, fires configured triggers (draft/publish/webhook/newsletter)
- `lib/agent-pipeline.ts` — orchestrates agents, streams `PipelineEvent` SSE objects
- `lib/agent-configs.ts` — CRUD helpers for `agent_configs` table
- `drizzle/migrations/XXXX_add_agent_configs.sql` — migration for new table
- `app/api/admin/agents/run/route.ts` — POST → SSE stream of pipeline events
- `app/api/admin/agents/configs/route.ts` — GET/PUT for agent configs
- `app/api/admin/agents/configs/generate-prompt/route.ts` — POST → AI-generated prompt for a given agent
- `app/admin/artigos/AgentsSection.tsx` — replaces `PromptsSection` in `ArtigosClient.tsx`

### Modified files
- `drizzle/schema.ts` — add `agentConfigs` table definition + types
- `app/admin/artigos/ArtigosClient.tsx` — replace `'prompts'` section id/label/component with `'agentes'`
- `lib/automation.ts` — keep existing `runAutomationCycle` for scheduled/cron runs but delegate to `runAgentPipeline`

---

## Task 1: Database schema — `agent_configs` table

**Files:**
- Modify: `drizzle/schema.ts`
- Create: `drizzle/migrations/` (generated via `npm run db:generate`)

- [ ] **Step 1: Add table definition to schema**

Open `drizzle/schema.ts`. After the `automationConfig` table definition, add:

```ts
export const agentConfigs = pgTable('agent_configs', {
  id: text('id').primaryKey(), // agent slug e.g. 'headline', 'researcher'
  prompt: text('prompt').notNull().default(''),
  model: text('model').notNull().default('openai/gpt-4o-mini'),
  updated_at: timestamp('updated_at').notNull().default(sql`now()`),
})

export type AgentConfig = typeof agentConfigs.$inferSelect
export type NewAgentConfig = typeof agentConfigs.$inferInsert
```

- [ ] **Step 2: Generate migration**

```bash
cd /Users/thuliobittencourt/Documents/Projetos/Blog/mma-blog
npm run db:generate
```

Expected: a new file created in `drizzle/migrations/` with `CREATE TABLE agent_configs`.

- [ ] **Step 3: Apply migration**

```bash
npm run db:migrate
```

Expected: `agent_configs table created` in output (or similar success message).

- [ ] **Step 4: Commit**

```bash
git add drizzle/schema.ts drizzle/migrations/
git commit -m "feat: add agent_configs table to schema"
```

---

## Task 2: Shared agent types

**Files:**
- Create: `lib/agents/types.ts`

- [ ] **Step 1: Create types file**

```ts
// lib/agents/types.ts

export type AgentId =
  | 'headline'
  | 'researcher'
  | 'analyst'
  | 'copywriter'
  | 'reviewer'
  | 'cta'
  | 'designer'
  | 'publisher'

export interface AgentMeta {
  id: AgentId
  label: string
  description: string
  defaultPrompt: string
  defaultModel: string
  supportsImageModel: boolean
}

export const AGENT_DEFINITIONS: AgentMeta[] = [
  {
    id: 'headline',
    label: 'Gerador de Headline',
    description: 'Identifica um tema pendente e elabora o título do artigo.',
    defaultModel: 'openai/gpt-4o-mini',
    supportsImageModel: false,
    defaultPrompt: `Você é um especialista em headlines para blogs. Receberá um tema e deve criar um título de artigo atraente, com até 80 caracteres, que seja claro, específico e gere curiosidade. Responda APENAS com o título, sem aspas ou pontuação extra.`,
  },
  {
    id: 'researcher',
    label: 'Pesquisador',
    description: 'Busca links e referências relevantes na internet sobre o título do artigo.',
    defaultModel: 'openai/gpt-4o-mini',
    supportsImageModel: false,
    defaultPrompt: `Você é um pesquisador. Dado um título de artigo, gere de 5 a 8 queries de busca em português e inglês para encontrar conteúdos relevantes. Responda em JSON: { "queries": ["query1", "query2", ...] }`,
  },
  {
    id: 'analyst',
    label: 'Analista',
    description: 'Lê o conteúdo de cada link encontrado e produz um resumo detalhado.',
    defaultModel: 'openai/gpt-4o-mini',
    supportsImageModel: false,
    defaultPrompt: `Você é um analista de conteúdo. Receberá o título de um artigo e o texto extraído de uma fonte. Produza um resumo detalhado (200-400 palavras) com os principais pontos, dados e insights relevantes para o artigo. Responda apenas com o resumo em português.`,
  },
  {
    id: 'copywriter',
    label: 'Copywriter',
    description: 'Escreve o artigo completo em HTML com base no título e nos resumos.',
    defaultModel: 'openai/gpt-4o-mini',
    supportsImageModel: false,
    defaultPrompt: `Você é um redator profissional de blogs corporativos. Receberá um título, o tema, o briefing da empresa e resumos de fontes pesquisadas. Escreva um artigo completo, detalhado e envolvente em HTML (use h2, h3, p, strong, em, ul, ol, li, blockquote). Mínimo 800 palavras. Inclua introdução, desenvolvimento com subtítulos e conclusão. Responda em JSON: { "title": "...", "excerpt": "até 160 caracteres", "content": "HTML completo" }`,
  },
  {
    id: 'reviewer',
    label: 'Revisor',
    description: 'Verifica ortografia, coerência e conformidade com as regras configuradas.',
    defaultModel: 'openai/gpt-4o-mini',
    supportsImageModel: false,
    defaultPrompt: `Você é um revisor editorial rigoroso. Analise o artigo recebido verificando: ortografia, gramática, coerência, clareza, estrutura e tom. Se aprovado, responda em JSON: { "approved": true }. Se houver problemas, responda: { "approved": false, "issues": ["problema 1", "problema 2"] }. Seja objetivo e específico.`,
  },
  {
    id: 'cta',
    label: 'Agente de CTA',
    description: 'Insere um parágrafo de call-to-action ao final do artigo.',
    defaultModel: 'openai/gpt-4o-mini',
    supportsImageModel: false,
    defaultPrompt: `Você é um especialista em marketing de conteúdo. Receberá um artigo completo e o briefing da empresa. Crie um parágrafo de call-to-action (CTA) que se conecte naturalmente ao conteúdo do artigo e leve o leitor à ação desejada pela empresa. Responda APENAS com o parágrafo HTML do CTA (use <p> com classes ou <div>), sem explicações.`,
  },
  {
    id: 'designer',
    label: 'Designer de Capa',
    description: 'Extrai o melhor prompt de imagem e gera a capa do artigo via IA.',
    defaultModel: 'openai/gpt-5-image',
    supportsImageModel: true,
    defaultPrompt: `Você é um diretor de arte. Receberá o título e o resumo de um artigo. Crie um prompt em inglês para gerar uma imagem de capa profissional e atrativa para blog. O prompt deve descrever: composição visual, estilo (fotorrealista, editorial, ilustração), paleta de cores e elementos visuais chave. Responda APENAS com o prompt em inglês, sem explicações.`,
  },
  {
    id: 'publisher',
    label: 'Publicador',
    description: 'Publica o artigo e dispara os gatilhos configurados.',
    defaultModel: 'openai/gpt-4o-mini',
    supportsImageModel: false,
    defaultPrompt: ``,
  },
]

export interface AgentContext {
  themeId?: number
  themeTitle?: string
  themeDescription?: string | null
  briefing?: string
  headline?: string
  researchLinks?: string[]
  sourceSummaries?: { url: string; summary: string }[]
  articleTitle?: string
  articleExcerpt?: string
  articleContent?: string
  reviewCycles?: number
  coverImageUrl?: string | null
  postId?: number
}

export interface AgentResult {
  success: boolean
  message: string
  data?: Partial<AgentContext>
  error?: string
}

export type PipelineEventType =
  | 'agent_start'
  | 'agent_done'
  | 'agent_error'
  | 'agent_retry'
  | 'pipeline_done'
  | 'pipeline_error'
  | 'log'

export interface PipelineEvent {
  type: PipelineEventType
  agent?: AgentId
  message: string
  data?: Record<string, unknown>
  timestamp: string
}

export interface PublisherTriggers {
  publishStatus: 'draft' | 'published'
  webhookUrl?: string
  sendNewsletter?: boolean
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/agents/types.ts
git commit -m "feat: add agent types and definitions"
```

---

## Task 3: Agent configs CRUD helper

**Files:**
- Create: `lib/agent-configs.ts`

- [ ] **Step 1: Create helper**

```ts
// lib/agent-configs.ts
import { db } from '@/drizzle/db'
import { agentConfigs } from '@/drizzle/schema'
import { eq } from 'drizzle-orm'
import { AGENT_DEFINITIONS, AgentId, AgentMeta } from '@/lib/agents/types'

export interface ResolvedAgentConfig {
  id: AgentId
  label: string
  description: string
  prompt: string
  model: string
  supportsImageModel: boolean
}

export async function getAgentConfigs(): Promise<ResolvedAgentConfig[]> {
  const rows = await db.select().from(agentConfigs)
  const stored = Object.fromEntries(rows.map((r) => [r.id, r]))

  return AGENT_DEFINITIONS.map((def) => ({
    id: def.id,
    label: def.label,
    description: def.description,
    supportsImageModel: def.supportsImageModel,
    prompt: stored[def.id]?.prompt ?? def.defaultPrompt,
    model: stored[def.id]?.model ?? def.defaultModel,
  }))
}

export async function getAgentConfig(id: AgentId): Promise<ResolvedAgentConfig> {
  const all = await getAgentConfigs()
  const found = all.find((c) => c.id === id)
  if (!found) throw new Error(`Unknown agent: ${id}`)
  return found
}

export async function upsertAgentConfig(
  id: AgentId,
  patch: { prompt?: string; model?: string }
): Promise<void> {
  const def = AGENT_DEFINITIONS.find((d) => d.id === id)
  if (!def) throw new Error(`Unknown agent: ${id}`)

  const now = new Date()
  await db
    .insert(agentConfigs)
    .values({
      id,
      prompt: patch.prompt ?? def.defaultPrompt,
      model: patch.model ?? def.defaultModel,
      updated_at: now,
    })
    .onConflictDoUpdate({
      target: agentConfigs.id,
      set: {
        ...(patch.prompt !== undefined ? { prompt: patch.prompt } : {}),
        ...(patch.model !== undefined ? { model: patch.model } : {}),
        updated_at: now,
      },
    })
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/agent-configs.ts
git commit -m "feat: add agent-configs CRUD helper"
```

---

## Task 4: Headline agent

**Files:**
- Create: `lib/agents/headline.ts`

- [ ] **Step 1: Create headline agent**

```ts
// lib/agents/headline.ts
import { db } from '@/drizzle/db'
import { articleThemes, siteSettings } from '@/drizzle/schema'
import { eq, and, inArray, asc } from 'drizzle-orm'
import { callOpenRouter } from '@/lib/ai'
import { getAgentConfig } from '@/lib/agent-configs'
import { AgentContext, AgentResult } from '@/lib/agents/types'

export async function runHeadlineAgent(
  ctx: AgentContext,
  themeIds: number[],
  apiKey: string
): Promise<AgentResult> {
  // Pick pending theme
  let rows
  if (themeIds.length > 0) {
    rows = await db
      .select()
      .from(articleThemes)
      .where(and(inArray(articleThemes.id, themeIds), eq(articleThemes.status, 'pending')))
      .orderBy(asc(articleThemes.created_at))
      .limit(1)
  } else {
    rows = await db
      .select()
      .from(articleThemes)
      .where(eq(articleThemes.status, 'pending'))
      .orderBy(asc(articleThemes.created_at))
      .limit(1)
  }

  if (rows.length === 0) {
    return { success: false, message: 'Nenhum tema pendente disponível', error: 'NO_THEME' }
  }

  const theme = rows[0]
  const config = await getAgentConfig('headline')

  // Load briefing
  let briefing = ''
  try {
    const bRows = await db.select().from(siteSettings).where(eq(siteSettings.key, 'briefing_content')).limit(1)
    briefing = bRows[0]?.value ?? ''
  } catch {}

  const userMsg = `Tema: ${theme.title}${theme.description ? `\nDescrição: ${theme.description}` : ''}${briefing ? `\n\nContexto da empresa:\n${briefing.slice(0, 2000)}` : ''}`

  const resp = await callOpenRouter(
    {
      model: config.model,
      messages: [
        { role: 'system', content: config.prompt },
        { role: 'user', content: userMsg },
      ],
      temperature: 0.8,
      max_tokens: 120,
    },
    apiKey
  )

  const headline = resp.choices[0]?.message?.content?.trim() ?? theme.title

  return {
    success: true,
    message: `Headline gerada: "${headline}"`,
    data: {
      themeId: theme.id,
      themeTitle: theme.title,
      themeDescription: theme.description,
      briefing,
      headline,
    },
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/agents/headline.ts
git commit -m "feat: add headline agent"
```

---

## Task 5: Researcher agent

**Files:**
- Create: `lib/agents/researcher.ts`

- [ ] **Step 1: Install cheerio**

```bash
cd /Users/thuliobittencourt/Documents/Projetos/Blog/mma-blog
npm install cheerio
```

- [ ] **Step 2: Create researcher agent**

```ts
// lib/agents/researcher.ts
import * as cheerio from 'cheerio'
import { callOpenRouter } from '@/lib/ai'
import { getAgentConfig } from '@/lib/agent-configs'
import { AgentContext, AgentResult } from '@/lib/agents/types'

async function duckDuckGoSearch(query: string): Promise<string[]> {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; research-bot/1.0)',
        Accept: 'text/html',
      },
    })
    if (!res.ok) return []
    const html = await res.text()
    const $ = cheerio.load(html)
    const links: string[] = []
    $('a.result__url, a[href*="uddg="]').each((_, el) => {
      const href = $(el).attr('href') ?? ''
      const match = href.match(/uddg=([^&]+)/)
      if (match) {
        try {
          const decoded = decodeURIComponent(match[1])
          if (decoded.startsWith('http') && !decoded.includes('duckduckgo.com')) {
            links.push(decoded)
          }
        } catch {}
      }
    })
    return links.slice(0, 5)
  } catch {
    return []
  }
}

export async function runResearcherAgent(
  ctx: AgentContext,
  apiKey: string
): Promise<AgentResult> {
  if (!ctx.headline) return { success: false, message: 'Headline não disponível', error: 'NO_HEADLINE' }

  const config = await getAgentConfig('researcher')

  const resp = await callOpenRouter(
    {
      model: config.model,
      messages: [
        { role: 'system', content: config.prompt },
        { role: 'user', content: `Título do artigo: ${ctx.headline}` },
      ],
      temperature: 0.5,
      max_tokens: 400,
    },
    apiKey
  )

  let queries: string[] = []
  try {
    const cleaned = resp.choices[0]?.message?.content?.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim() ?? ''
    const parsed = JSON.parse(cleaned) as { queries?: string[] }
    queries = (parsed.queries ?? []).slice(0, 6)
  } catch {
    queries = [ctx.headline]
  }

  const allLinks: string[] = []
  for (const q of queries) {
    const links = await duckDuckGoSearch(q)
    for (const l of links) {
      if (!allLinks.includes(l)) allLinks.push(l)
    }
    if (allLinks.length >= 10) break
  }

  const researchLinks = allLinks.slice(0, 8)

  return {
    success: true,
    message: `${researchLinks.length} links encontrados`,
    data: { researchLinks },
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add lib/agents/researcher.ts package.json package-lock.json
git commit -m "feat: add researcher agent with DuckDuckGo scraping"
```

---

## Task 6: Analyst agent

**Files:**
- Create: `lib/agents/analyst.ts`

- [ ] **Step 1: Create analyst agent**

```ts
// lib/agents/analyst.ts
import * as cheerio from 'cheerio'
import { callOpenRouter } from '@/lib/ai'
import { getAgentConfig } from '@/lib/agent-configs'
import { AgentContext, AgentResult } from '@/lib/agents/types'

async function extractTextFromUrl(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; research-bot/1.0)' },
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return ''
    const html = await res.text()
    const $ = cheerio.load(html)
    $('script, style, nav, footer, header, aside, [role="navigation"]').remove()
    const text = $('article, main, .content, .post-content, body')
      .first()
      .text()
      .replace(/\s+/g, ' ')
      .trim()
    return text.slice(0, 6000)
  } catch {
    return ''
  }
}

export async function runAnalystAgent(
  ctx: AgentContext,
  apiKey: string
): Promise<AgentResult> {
  if (!ctx.researchLinks || ctx.researchLinks.length === 0) {
    return { success: false, message: 'Nenhum link para analisar', error: 'NO_LINKS' }
  }

  const config = await getAgentConfig('analyst')
  const summaries: { url: string; summary: string }[] = []

  for (const url of ctx.researchLinks.slice(0, 6)) {
    const text = await extractTextFromUrl(url)
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

  if (summaries.length === 0) {
    return {
      success: true,
      message: 'Nenhuma fonte acessível, continuando sem resumos',
      data: { sourceSummaries: [] },
    }
  }

  return {
    success: true,
    message: `${summaries.length} fontes analisadas`,
    data: { sourceSummaries: summaries },
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/agents/analyst.ts
git commit -m "feat: add analyst agent"
```

---

## Task 7: Copywriter agent

**Files:**
- Create: `lib/agents/copywriter.ts`

- [ ] **Step 1: Create copywriter agent**

```ts
// lib/agents/copywriter.ts
import { callOpenRouter } from '@/lib/ai'
import { getAgentConfig } from '@/lib/agent-configs'
import { getArticleConfig, buildArticleConfigPromptSection } from '@/lib/article-config'
import { AgentContext, AgentResult } from '@/lib/agents/types'

export async function runCopywriterAgent(
  ctx: AgentContext,
  apiKey: string
): Promise<AgentResult> {
  if (!ctx.headline) return { success: false, message: 'Headline não disponível', error: 'NO_HEADLINE' }

  const config = await getAgentConfig('copywriter')
  const articleConfig = await getArticleConfig()
  const configSection = buildArticleConfigPromptSection(articleConfig)

  const sourcesBlock =
    ctx.sourceSummaries && ctx.sourceSummaries.length > 0
      ? `\n\nFONTES PESQUISADAS:\n${ctx.sourceSummaries
          .map((s, i) => `[${i + 1}] ${s.url}\n${s.summary}`)
          .join('\n\n')}`
      : ''

  const briefingBlock = ctx.briefing
    ? `\n\nCONTEXTO DA EMPRESA:\n${ctx.briefing.slice(0, 4000)}`
    : ''

  const userMsg = `Título: ${ctx.headline}
Tema original: ${ctx.themeTitle ?? ctx.headline}${ctx.themeDescription ? `\nDescrição: ${ctx.themeDescription}` : ''}
${briefingBlock}
${configSection}
${sourcesBlock}

Mínimo de ${articleConfig.minWords} palavras. Responda em JSON (sem markdown): { "title": "...", "excerpt": "...", "content": "HTML completo" }`

  const resp = await callOpenRouter(
    {
      model: config.model,
      messages: [
        { role: 'system', content: config.prompt },
        { role: 'user', content: userMsg },
      ],
      temperature: articleConfig.creativity,
      max_tokens: 6000,
    },
    apiKey
  )

  let parsed: { title: string; excerpt: string; content: string }
  try {
    const raw = resp.choices[0]?.message?.content ?? ''
    const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    parsed = JSON.parse(cleaned)
  } catch {
    return { success: false, message: 'Erro ao parsear resposta do copywriter', error: 'PARSE_ERROR' }
  }

  return {
    success: true,
    message: `Artigo redigido: "${parsed.title}"`,
    data: {
      articleTitle: parsed.title,
      articleExcerpt: parsed.excerpt,
      articleContent: parsed.content,
      reviewCycles: 0,
    },
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/agents/copywriter.ts
git commit -m "feat: add copywriter agent"
```

---

## Task 8: Reviewer agent

**Files:**
- Create: `lib/agents/reviewer.ts`

- [ ] **Step 1: Create reviewer agent**

```ts
// lib/agents/reviewer.ts
import { callOpenRouter } from '@/lib/ai'
import { getAgentConfig } from '@/lib/agent-configs'
import { AgentContext, AgentResult } from '@/lib/agents/types'

export const MAX_REVIEW_CYCLES = 3

export async function runReviewerAgent(
  ctx: AgentContext,
  apiKey: string
): Promise<AgentResult & { approved: boolean; issues?: string[] }> {
  if (!ctx.articleContent) {
    return { success: false, approved: false, message: 'Artigo não disponível', error: 'NO_CONTENT' }
  }

  const config = await getAgentConfig('reviewer')

  const plainText = ctx.articleContent.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').slice(0, 8000)

  const resp = await callOpenRouter(
    {
      model: config.model,
      messages: [
        { role: 'system', content: config.prompt },
        {
          role: 'user',
          content: `Título: ${ctx.articleTitle ?? ''}\n\nConteúdo:\n${plainText}`,
        },
      ],
      temperature: 0.2,
      max_tokens: 600,
    },
    apiKey
  )

  let result: { approved: boolean; issues?: string[] }
  try {
    const raw = resp.choices[0]?.message?.content ?? ''
    const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    result = JSON.parse(cleaned)
  } catch {
    result = { approved: true }
  }

  return {
    success: true,
    approved: result.approved,
    issues: result.issues,
    message: result.approved
      ? 'Artigo aprovado pelo revisor'
      : `Revisão necessária: ${(result.issues ?? []).join('; ')}`,
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/agents/reviewer.ts
git commit -m "feat: add reviewer agent"
```

---

## Task 9: CTA agent

**Files:**
- Create: `lib/agents/cta.ts`

- [ ] **Step 1: Create CTA agent**

```ts
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
```

- [ ] **Step 2: Commit**

```bash
git add lib/agents/cta.ts
git commit -m "feat: add CTA agent"
```

---

## Task 10: Designer agent

**Files:**
- Create: `lib/agents/designer.ts`

- [ ] **Step 1: Create designer agent**

```ts
// lib/agents/designer.ts
import { callOpenRouter, callOpenRouterImage } from '@/lib/ai'
import { getAgentConfig } from '@/lib/agent-configs'
import { supabaseAdmin, STORAGE_BUCKET } from '@/lib/supabase-admin'
import { AgentContext, AgentResult } from '@/lib/agents/types'

export async function runDesignerAgent(
  ctx: AgentContext,
  apiKey: string
): Promise<AgentResult> {
  if (!ctx.articleTitle) return { success: false, message: 'Título não disponível', error: 'NO_TITLE' }

  const config = await getAgentConfig('designer')

  // Generate image prompt
  const promptResp = await callOpenRouter(
    {
      model: 'openai/gpt-4o-mini',
      messages: [
        { role: 'system', content: config.prompt },
        {
          role: 'user',
          content: `Título: ${ctx.articleTitle}\nResumo: ${ctx.articleExcerpt ?? ''}`,
        },
      ],
      temperature: 0.8,
      max_tokens: 300,
    },
    apiKey
  )

  const imagePrompt = promptResp.choices[0]?.message?.content?.trim() ?? ctx.articleTitle

  // Generate image using designer's configured model
  const imageUrl = await callOpenRouterImage(imagePrompt, config.model, apiKey)

  // Upload to Supabase Storage
  let imageBuffer: Buffer
  let contentType = 'image/png'

  if (imageUrl.startsWith('data:')) {
    const matches = imageUrl.match(/^data:(image\/\w+);base64,(.+)$/)
    if (!matches) throw new Error('Formato de imagem inválido')
    contentType = matches[1]
    imageBuffer = Buffer.from(matches[2], 'base64')
  } else {
    const imgRes = await fetch(imageUrl)
    contentType = imgRes.headers.get('content-type') ?? 'image/png'
    imageBuffer = Buffer.from(await imgRes.arrayBuffer())
  }

  const ext = contentType.includes('jpeg') || contentType.includes('jpg') ? '.jpg'
    : contentType.includes('webp') ? '.webp' : '.png'
  const filename = `agent-${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`

  const { error: uploadError } = await supabaseAdmin.storage
    .from(STORAGE_BUCKET)
    .upload(filename, imageBuffer, { contentType })

  if (uploadError) throw new Error(`Upload falhou: ${uploadError.message}`)

  const { data: { publicUrl } } = supabaseAdmin.storage.from(STORAGE_BUCKET).getPublicUrl(filename)

  return {
    success: true,
    message: 'Imagem de capa gerada e enviada',
    data: { coverImageUrl: publicUrl },
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/agents/designer.ts
git commit -m "feat: add designer agent"
```

---

## Task 11: Publisher agent

**Files:**
- Create: `lib/agents/publisher.ts`

- [ ] **Step 1: Create publisher agent**

```ts
// lib/agents/publisher.ts
import sanitizeHtml from 'sanitize-html'
import { db } from '@/drizzle/db'
import { posts, articleThemes, automationConfig, siteSettings, newsletterSubscribers } from '@/drizzle/schema'
import { eq } from 'drizzle-orm'
import { generateSlug } from '@/lib/slug'
import { AgentContext, AgentResult, PublisherTriggers } from '@/lib/agents/types'

const sanitizeOptions: sanitizeHtml.IOptions = {
  allowedTags: sanitizeHtml.defaults.allowedTags.concat(['h2', 'h3', 'img']),
  allowedAttributes: {
    ...sanitizeHtml.defaults.allowedAttributes,
    img: ['src', 'alt'],
  },
}

export async function runPublisherAgent(
  ctx: AgentContext,
  triggers: PublisherTriggers
): Promise<AgentResult> {
  if (!ctx.articleTitle || !ctx.articleContent) {
    return { success: false, message: 'Artigo incompleto para publicação', error: 'INCOMPLETE' }
  }

  const slug = generateSlug(ctx.articleTitle) + '-' + Date.now()
  const cleanContent = sanitizeHtml(ctx.articleContent, sanitizeOptions)
  const now = new Date()

  const [post] = await db
    .insert(posts)
    .values({
      title: ctx.articleTitle,
      slug,
      content: cleanContent,
      excerpt: ctx.articleExcerpt ?? '',
      cover_image: ctx.coverImageUrl ?? null,
      status: triggers.publishStatus,
      published_at: triggers.publishStatus === 'published' ? now : null,
      updated_at: now,
    })
    .returning()

  // Mark theme as used
  if (ctx.themeId) {
    await db.update(articleThemes).set({ status: 'used' }).where(eq(articleThemes.id, ctx.themeId))
  }

  // Update automation timestamps if running from scheduled automation
  const cfgRows = await db.select().from(automationConfig).limit(1)
  if (cfgRows.length > 0) {
    const cfg = cfgRows[0]
    const nextRun = new Date(now.getTime() + cfg.interval_hours * 60 * 60 * 1000)
    await db.update(automationConfig).set({ last_run_at: now, next_run_at: nextRun, updated_at: now }).where(eq(automationConfig.id, cfg.id))
  }

  // Webhook trigger
  if (triggers.webhookUrl?.trim()) {
    try {
      await fetch(triggers.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ post_id: post.id, title: post.title, slug: post.slug, status: post.status }),
      })
    } catch {}
  }

  // Newsletter trigger
  if (triggers.sendNewsletter && triggers.publishStatus === 'published') {
    try {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''
      const blogName = process.env.NEXT_PUBLIC_BLOG_NAME ?? 'Blog'
      const subscribers = await db
        .select()
        .from(newsletterSubscribers)
        .where(eq(newsletterSubscribers.status, 'active'))

      const settingsRows = await db.select().from(siteSettings).where(eq(siteSettings.key, 'smtp_settings')).limit(1)
      if (settingsRows.length > 0 && subscribers.length > 0) {
        // Fire-and-forget: call internal newsletter send endpoint
        fetch(`${appUrl}/api/admin/newsletter/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-internal': '1' },
          body: JSON.stringify({ post_id: post.id }),
        }).catch(() => {})
      }
    } catch {}
  }

  return {
    success: true,
    message: `Artigo "${post.title}" ${triggers.publishStatus === 'published' ? 'publicado' : 'salvo como rascunho'} (ID ${post.id})`,
    data: { postId: post.id },
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/agents/publisher.ts
git commit -m "feat: add publisher agent with webhook and newsletter triggers"
```

---

## Task 12: Pipeline orchestrator

**Files:**
- Create: `lib/agent-pipeline.ts`

- [ ] **Step 1: Create pipeline**

```ts
// lib/agent-pipeline.ts
import { getAIApiKey } from '@/lib/ai'
import { runHeadlineAgent } from '@/lib/agents/headline'
import { runResearcherAgent } from '@/lib/agents/researcher'
import { runAnalystAgent } from '@/lib/agents/analyst'
import { runCopywriterAgent } from '@/lib/agents/copywriter'
import { runReviewerAgent, MAX_REVIEW_CYCLES } from '@/lib/agents/reviewer'
import { runCtaAgent } from '@/lib/agents/cta'
import { runDesignerAgent } from '@/lib/agents/designer'
import { runPublisherAgent } from '@/lib/agents/publisher'
import { AgentContext, AgentId, PipelineEvent, PublisherTriggers } from '@/lib/agents/types'

export interface PipelineOptions {
  themeIds: number[]
  triggers: PublisherTriggers
}

function makeEvent(
  type: PipelineEvent['type'],
  message: string,
  agent?: AgentId,
  data?: Record<string, unknown>
): string {
  const event: PipelineEvent = {
    type,
    agent,
    message,
    data,
    timestamp: new Date().toISOString(),
  }
  return `data: ${JSON.stringify(event)}\n\n`
}

export function createPipelineStream(options: PipelineOptions): ReadableStream {
  return new ReadableStream({
    async start(controller) {
      const send = (chunk: string) => controller.enqueue(new TextEncoder().encode(chunk))

      const ctx: AgentContext = {}

      try {
        const apiKey = await getAIApiKey()
        if (!apiKey) {
          send(makeEvent('pipeline_error', 'Chave de API do OpenRouter não configurada.'))
          controller.close()
          return
        }

        // 1. Headline
        send(makeEvent('agent_start', 'Gerando headline...', 'headline'))
        const headlineResult = await runHeadlineAgent(ctx, options.themeIds, apiKey)
        if (!headlineResult.success) {
          send(makeEvent('agent_error', headlineResult.message, 'headline'))
          send(makeEvent('pipeline_error', headlineResult.message))
          controller.close()
          return
        }
        Object.assign(ctx, headlineResult.data)
        send(makeEvent('agent_done', headlineResult.message, 'headline', { headline: ctx.headline }))

        // 2. Researcher
        send(makeEvent('agent_start', 'Pesquisando referências na web...', 'researcher'))
        const researchResult = await runResearcherAgent(ctx, apiKey)
        if (!researchResult.success) {
          send(makeEvent('agent_error', researchResult.message, 'researcher'))
          // non-fatal: continue with no links
        } else {
          Object.assign(ctx, researchResult.data)
          send(makeEvent('agent_done', researchResult.message, 'researcher', { count: ctx.researchLinks?.length }))
        }

        // 3. Analyst
        send(makeEvent('agent_start', 'Analisando fontes...', 'analyst'))
        const analystResult = await runAnalystAgent(ctx, apiKey)
        Object.assign(ctx, analystResult.data ?? {})
        send(makeEvent('agent_done', analystResult.message, 'analyst', { summaries: ctx.sourceSummaries?.length }))

        // 4. Copywriter (+ review loop)
        send(makeEvent('agent_start', 'Redigindo artigo...', 'copywriter'))
        const copyResult = await runCopywriterAgent(ctx, apiKey)
        if (!copyResult.success) {
          send(makeEvent('agent_error', copyResult.message, 'copywriter'))
          send(makeEvent('pipeline_error', copyResult.message))
          controller.close()
          return
        }
        Object.assign(ctx, copyResult.data)
        send(makeEvent('agent_done', copyResult.message, 'copywriter'))

        // 5. Reviewer loop
        ctx.reviewCycles = 0
        while (ctx.reviewCycles! < MAX_REVIEW_CYCLES) {
          send(makeEvent('agent_start', `Revisando artigo (ciclo ${(ctx.reviewCycles ?? 0) + 1})...`, 'reviewer'))
          const reviewResult = await runReviewerAgent(ctx, apiKey)

          if (reviewResult.approved) {
            send(makeEvent('agent_done', reviewResult.message, 'reviewer'))
            break
          }

          ctx.reviewCycles = (ctx.reviewCycles ?? 0) + 1
          send(makeEvent('agent_retry', reviewResult.message, 'reviewer', { issues: reviewResult.issues }))

          if (ctx.reviewCycles >= MAX_REVIEW_CYCLES) {
            send(makeEvent('agent_done', 'Limite de revisões atingido, prosseguindo', 'reviewer'))
            break
          }

          // Re-run copywriter with reviewer feedback
          send(makeEvent('agent_start', 'Corrigindo artigo...', 'copywriter'))
          const fixPrompt = `Corrija os seguintes problemas no artigo:\n${(reviewResult.issues ?? []).map((i) => `- ${i}`).join('\n')}\n\nArtigo atual:\n${ctx.articleContent}`
          const fixedCtx: AgentContext = { ...ctx, sourceSummaries: [{ url: 'revisao', summary: fixPrompt }] }
          const fixResult = await runCopywriterAgent(fixedCtx, apiKey)
          if (fixResult.success) {
            Object.assign(ctx, fixResult.data)
            send(makeEvent('agent_done', 'Artigo corrigido', 'copywriter'))
          }
        }

        // 6. CTA
        send(makeEvent('agent_start', 'Inserindo CTA...', 'cta'))
        const ctaResult = await runCtaAgent(ctx, apiKey)
        if (ctaResult.success) Object.assign(ctx, ctaResult.data)
        send(makeEvent('agent_done', ctaResult.message, 'cta'))

        // 7. Designer
        send(makeEvent('agent_start', 'Gerando imagem de capa...', 'designer'))
        try {
          const designResult = await runDesignerAgent(ctx, apiKey)
          if (designResult.success) Object.assign(ctx, designResult.data)
          send(makeEvent('agent_done', designResult.message, 'designer'))
        } catch (imgErr) {
          const msg = imgErr instanceof Error ? imgErr.message : String(imgErr)
          send(makeEvent('agent_error', `Imagem falhou (continuando): ${msg}`, 'designer'))
        }

        // 8. Publisher
        send(makeEvent('agent_start', 'Publicando artigo...', 'publisher'))
        const pubResult = await runPublisherAgent(ctx, options.triggers)
        if (!pubResult.success) {
          send(makeEvent('agent_error', pubResult.message, 'publisher'))
          send(makeEvent('pipeline_error', pubResult.message))
          controller.close()
          return
        }
        Object.assign(ctx, pubResult.data)
        send(makeEvent('agent_done', pubResult.message, 'publisher', { post_id: ctx.postId }))

        send(makeEvent('pipeline_done', `Pipeline concluído! Artigo ID ${ctx.postId}`, undefined, { post_id: ctx.postId }))
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        send(makeEvent('pipeline_error', msg))
      } finally {
        controller.close()
      }
    },
  })
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/agent-pipeline.ts
git commit -m "feat: add pipeline orchestrator with SSE streaming"
```

---

## Task 13: API routes

**Files:**
- Create: `app/api/admin/agents/run/route.ts`
- Create: `app/api/admin/agents/configs/route.ts`
- Create: `app/api/admin/agents/configs/generate-prompt/route.ts`

- [ ] **Step 1: Create SSE run route**

```ts
// app/api/admin/agents/run/route.ts
import { NextRequest } from 'next/server'
import { createPipelineStream } from '@/lib/agent-pipeline'
import { PublisherTriggers } from '@/lib/agents/types'

export const maxDuration = 300
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const body = await request.json() as {
    themeIds?: number[]
    publishStatus?: 'draft' | 'published'
    webhookUrl?: string
    sendNewsletter?: boolean
  }

  const triggers: PublisherTriggers = {
    publishStatus: body.publishStatus ?? 'published',
    webhookUrl: body.webhookUrl,
    sendNewsletter: body.sendNewsletter ?? false,
  }

  const stream = createPipelineStream({
    themeIds: body.themeIds ?? [],
    triggers,
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
```

- [ ] **Step 2: Create agent configs route**

```ts
// app/api/admin/agents/configs/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getAgentConfigs, upsertAgentConfig } from '@/lib/agent-configs'
import { AgentId } from '@/lib/agents/types'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const configs = await getAgentConfigs()
    return NextResponse.json({ configs })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json() as { id: AgentId; prompt?: string; model?: string }
    await upsertAgentConfig(body.id, { prompt: body.prompt, model: body.model })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
```

- [ ] **Step 3: Create generate-prompt route**

```ts
// app/api/admin/agents/configs/generate-prompt/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { aiChat } from '@/lib/ai'
import { db } from '@/drizzle/db'
import { siteSettings } from '@/drizzle/schema'
import { eq } from 'drizzle-orm'
import { AGENT_DEFINITIONS, AgentId } from '@/lib/agents/types'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const { agentId } = await request.json() as { agentId: AgentId }

    const def = AGENT_DEFINITIONS.find((d) => d.id === agentId)
    if (!def) return NextResponse.json({ error: 'Agente desconhecido' }, { status: 400 })

    let briefing = ''
    try {
      const rows = await db.select().from(siteSettings).where(eq(siteSettings.key, 'briefing_content')).limit(1)
      briefing = rows[0]?.value ?? ''
    } catch {}

    const prompt = await aiChat('prompt_generation', [
      {
        role: 'system',
        content: 'Você é um especialista em engenharia de prompts para agentes de IA. Crie um system prompt profissional e detalhado para o agente descrito. Responda APENAS com o prompt, sem explicações adicionais.',
      },
      {
        role: 'user',
        content: `Agente: ${def.label}
Função: ${def.description}
${briefing ? `\nBriefing da empresa:\n${briefing.slice(0, 3000)}` : ''}

Prompt atual (referência):\n${def.defaultPrompt}

Gere um prompt melhorado e personalizado para esse agente com base no briefing da empresa.`,
      },
    ])

    return NextResponse.json({ prompt })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add app/api/admin/agents/
git commit -m "feat: add agents API routes (run SSE, configs CRUD, generate-prompt)"
```

---

## Task 14: AgentsSection UI component

**Files:**
- Create: `app/admin/artigos/AgentsSection.tsx`

- [ ] **Step 1: Create AgentsSection component**

```tsx
// app/admin/artigos/AgentsSection.tsx
'use client'
import { useState, useEffect, useRef } from 'react'
import { AGENT_DEFINITIONS, AgentId, PipelineEvent } from '@/lib/agents/types'

interface AgentConfigState {
  id: AgentId
  label: string
  description: string
  prompt: string
  model: string
  supportsImageModel: boolean
}

interface Toast { type: 'success' | 'error'; msg: string }

const PIPELINE_AGENT_ORDER: AgentId[] = [
  'headline', 'researcher', 'analyst', 'copywriter', 'reviewer', 'cta', 'designer', 'publisher'
]

const STATUS_ICONS: Record<string, string> = {
  idle: '⬜',
  running: '🔄',
  done: '✅',
  error: '❌',
  retry: '🔁',
}

export default function AgentsSection() {
  const [configs, setConfigs] = useState<AgentConfigState[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<AgentId | null>(null)
  const [generating, setGenerating] = useState<AgentId | null>(null)
  const [expandedAgent, setExpandedAgent] = useState<AgentId | null>(null)
  const [models, setModels] = useState<{ id: string; name: string }[]>([])
  const [toast, setToast] = useState<Toast | null>(null)

  // Pipeline runner state
  const [running, setRunning] = useState(false)
  const [agentStatuses, setAgentStatuses] = useState<Record<AgentId, string>>({} as Record<AgentId, string>)
  const [logs, setLogs] = useState<PipelineEvent[]>([])
  const [publishStatus, setPublishStatus] = useState<'published' | 'draft'>('published')
  const [webhookUrl, setWebhookUrl] = useState('')
  const [sendNewsletter, setSendNewsletter] = useState(false)
  const logsEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch('/api/admin/agents/configs')
      .then((r) => r.json())
      .then((data: { configs?: AgentConfigState[] }) => {
        if (data.configs) setConfigs(data.configs)
      })
      .finally(() => setLoading(false))

    fetch('/api/admin/ai/models')
      .then((r) => r.json())
      .then((data: { models?: { id: string; name: string }[] }) => {
        if (data.models) setModels(data.models)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 3000)
      return () => clearTimeout(t)
    }
  }, [toast])

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  function updateConfig(id: AgentId, patch: Partial<AgentConfigState>) {
    setConfigs((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)))
  }

  async function saveConfig(id: AgentId) {
    const cfg = configs.find((c) => c.id === id)
    if (!cfg) return
    setSaving(id)
    try {
      const res = await fetch('/api/admin/agents/configs', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, prompt: cfg.prompt, model: cfg.model }),
      })
      if (res.ok) setToast({ type: 'success', msg: `${cfg.label} salvo!` })
      else setToast({ type: 'error', msg: 'Erro ao salvar' })
    } finally {
      setSaving(null)
    }
  }

  async function generatePrompt(id: AgentId) {
    setGenerating(id)
    try {
      const res = await fetch('/api/admin/agents/configs/generate-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: id }),
      })
      const data = await res.json() as { prompt?: string; error?: string }
      if (data.prompt) {
        updateConfig(id, { prompt: data.prompt })
        setToast({ type: 'success', msg: 'Prompt gerado pela IA!' })
      } else {
        setToast({ type: 'error', msg: data.error ?? 'Erro ao gerar prompt' })
      }
    } finally {
      setGenerating(null)
    }
  }

  async function runPipeline() {
    setRunning(true)
    setLogs([])
    const initStatuses: Record<AgentId, string> = {} as Record<AgentId, string>
    PIPELINE_AGENT_ORDER.forEach((id) => { initStatuses[id] = 'idle' })
    setAgentStatuses(initStatuses)

    const res = await fetch('/api/admin/agents/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ publishStatus, webhookUrl: webhookUrl || undefined, sendNewsletter }),
    })

    if (!res.body) { setRunning(false); return }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const parts = buffer.split('\n\n')
      buffer = parts.pop() ?? ''
      for (const part of parts) {
        const line = part.replace(/^data: /, '').trim()
        if (!line) continue
        try {
          const event: PipelineEvent = JSON.parse(line)
          setLogs((prev) => [...prev, event])
          if (event.agent) {
            setAgentStatuses((prev) => ({
              ...prev,
              [event.agent!]:
                event.type === 'agent_start' ? 'running'
                : event.type === 'agent_done' ? 'done'
                : event.type === 'agent_error' ? 'error'
                : event.type === 'agent_retry' ? 'retry'
                : prev[event.agent!],
            }))
          }
          if (event.type === 'pipeline_done' || event.type === 'pipeline_error') {
            setRunning(false)
          }
        } catch {}
      }
    }
    setRunning(false)
  }

  if (loading) return <div className="p-6 text-gray-500">Carregando agentes...</div>

  return (
    <section className="space-y-6">
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-2 rounded-lg text-white text-sm shadow-lg ${toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'}`}>
          {toast.msg}
        </div>
      )}

      {/* Pipeline runner */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-neutral-900 mb-1">Executar Pipeline de Agentes</h2>
        <p className="text-sm text-gray-500 mb-4">Aciona todos os agentes em sequência para gerar e publicar um artigo automaticamente.</p>

        {/* Triggers */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Publicar como</label>
            <select
              value={publishStatus}
              onChange={(e) => setPublishStatus(e.target.value as 'published' | 'draft')}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              disabled={running}
            >
              <option value="published">Publicado</option>
              <option value="draft">Rascunho</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Webhook URL (opcional)</label>
            <input
              type="url"
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
              placeholder="https://..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              disabled={running}
            />
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={sendNewsletter}
                onChange={(e) => setSendNewsletter(e.target.checked)}
                disabled={running}
                className="rounded"
              />
              Enviar newsletter após publicar
            </label>
          </div>
        </div>

        {/* Agent progress */}
        {(running || logs.length > 0) && (
          <div className="mb-4">
            <div className="flex flex-wrap gap-2 mb-3">
              {PIPELINE_AGENT_ORDER.map((agentId) => {
                const def = AGENT_DEFINITIONS.find((d) => d.id === agentId)!
                const status = agentStatuses[agentId] ?? 'idle'
                return (
                  <div
                    key={agentId}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border ${
                      status === 'done' ? 'bg-green-50 border-green-200 text-green-700'
                      : status === 'running' ? 'bg-blue-50 border-blue-200 text-blue-700 animate-pulse'
                      : status === 'error' ? 'bg-red-50 border-red-200 text-red-700'
                      : status === 'retry' ? 'bg-yellow-50 border-yellow-200 text-yellow-700'
                      : 'bg-gray-50 border-gray-200 text-gray-400'
                    }`}
                  >
                    <span>{STATUS_ICONS[status] ?? '⬜'}</span>
                    {def.label}
                  </div>
                )
              })}
            </div>

            <div className="bg-gray-950 rounded-lg p-3 max-h-48 overflow-y-auto font-mono text-xs text-gray-300 space-y-0.5">
              {logs.map((ev, i) => (
                <div key={i} className={
                  ev.type === 'pipeline_done' ? 'text-green-400'
                  : ev.type === 'pipeline_error' || ev.type === 'agent_error' ? 'text-red-400'
                  : ev.type === 'agent_retry' ? 'text-yellow-400'
                  : ev.type === 'agent_done' ? 'text-green-300'
                  : 'text-gray-300'
                }>
                  [{ev.timestamp.slice(11, 19)}] {ev.agent ? `[${ev.agent}] ` : ''}{ev.message}
                </div>
              ))}
              <div ref={logsEndRef} />
            </div>
          </div>
        )}

        <button
          onClick={runPipeline}
          disabled={running}
          className="px-5 py-2 bg-brand-primary text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {running ? (
            <>
              <span className="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
              Gerando artigo...
            </>
          ) : (
            '▶ Gerar Artigo com Agentes'
          )}
        </button>
      </div>

      {/* Agent config cards */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-neutral-900 mb-1">Configuração dos Agentes</h2>
        <p className="text-sm text-gray-500 mb-4">Configure o prompt e o modelo LLM de cada agente individualmente.</p>

        <div className="space-y-3">
          {configs.map((cfg, idx) => (
            <div key={cfg.id} className="border border-gray-200 rounded-lg overflow-hidden">
              <button
                className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 text-left"
                onClick={() => setExpandedAgent(expandedAgent === cfg.id ? null : cfg.id)}
              >
                <div className="flex items-center gap-3">
                  <span className="text-xs font-mono text-gray-400 w-5 text-center">{idx + 1}</span>
                  <div>
                    <span className="font-medium text-sm text-neutral-900">{cfg.label}</span>
                    <span className="ml-2 text-xs text-gray-400">{cfg.description}</span>
                  </div>
                </div>
                <span className="text-gray-400 text-xs">{expandedAgent === cfg.id ? '▲' : '▼'}</span>
              </button>

              {expandedAgent === cfg.id && (
                <div className="p-4 space-y-4">
                  {/* Model selector */}
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Modelo LLM {cfg.supportsImageModel && <span className="text-blue-500">(suporta geração de imagem)</span>}
                    </label>
                    <select
                      value={cfg.model}
                      onChange={(e) => updateConfig(cfg.id, { model: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    >
                      {models.length > 0
                        ? models.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)
                        : <option value={cfg.model}>{cfg.model}</option>
                      }
                    </select>
                  </div>

                  {/* Prompt editor */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-medium text-gray-700">System Prompt</label>
                      <button
                        onClick={() => generatePrompt(cfg.id)}
                        disabled={generating === cfg.id}
                        className="flex items-center gap-1 text-xs text-brand-primary hover:text-blue-700 disabled:opacity-50"
                      >
                        {generating === cfg.id ? (
                          <span className="animate-spin inline-block w-3 h-3 border border-brand-primary border-t-transparent rounded-full" />
                        ) : (
                          <span>✨</span>
                        )}
                        Gerar com IA
                      </button>
                    </div>
                    <textarea
                      value={cfg.prompt}
                      onChange={(e) => updateConfig(cfg.id, { prompt: e.target.value })}
                      rows={6}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono resize-y"
                      placeholder="System prompt do agente..."
                    />
                  </div>

                  <div className="flex justify-end">
                    <button
                      onClick={() => saveConfig(cfg.id)}
                      disabled={saving === cfg.id}
                      className="px-4 py-2 bg-brand-primary text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
                    >
                      {saving === cfg.id ? 'Salvando...' : 'Salvar'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add app/admin/artigos/AgentsSection.tsx
git commit -m "feat: add AgentsSection UI with pipeline runner and per-agent config"
```

---

## Task 15: Wire AgentsSection into ArtigosClient

**Files:**
- Modify: `app/admin/artigos/ArtigosClient.tsx`

- [ ] **Step 1: Add import and replace section**

Open [app/admin/artigos/ArtigosClient.tsx](app/admin/artigos/ArtigosClient.tsx).

1. Add import at the top (near other imports):
```ts
import AgentsSection from './AgentsSection'
```

2. In the `SectionId` type, replace `'prompts'` with `'agentes'`:
```ts
type SectionId = 'lista' | 'temas' | 'briefing' | 'automacao' | 'agentes' | 'configuracao'
```

3. In the `SECTIONS` array, replace the prompts entry:
```ts
{ id: 'agentes', label: 'Agentes de IA', icon: '🤖' },
```

4. In the `renderSection` switch, replace the `prompts` case:
```ts
case 'agentes':
  return <AgentsSection />
```

5. Remove the entire `PromptsSection` function (lines ~995–1130) and its helpers since they are replaced by `AgentsSection`.

- [ ] **Step 2: Verify build**

```bash
cd /Users/thuliobittencourt/Documents/Projetos/Blog/mma-blog
npm run build 2>&1 | tail -30
```

Expected: no TypeScript errors. If there are errors about missing `PromptsSection` references, find and remove them.

- [ ] **Step 3: Commit**

```bash
git add app/admin/artigos/ArtigosClient.tsx
git commit -m "feat: replace Prompts section with Agentes section in ArtigosClient"
```

---

## Task 16: Update automation.ts to use agent pipeline

**Files:**
- Modify: `lib/automation.ts`

- [ ] **Step 1: Replace runAutomationCycle body**

Open [lib/automation.ts](lib/automation.ts).

Replace the entire implementation of `runAutomationCycle` to delegate to the pipeline. The function signature must stay the same for backwards compatibility with the cron/scheduler:

```ts
import { createPipelineStream } from '@/lib/agent-pipeline'

export async function runAutomationCycle(force = false): Promise<AutomationResult> {
  const config = await getOrCreateAutomationConfig()

  if (!config.enabled) {
    return { success: false, skipped: true, message: 'Automação desabilitada' }
  }

  if (!force && config.next_run_at && new Date() < new Date(config.next_run_at)) {
    return { success: false, skipped: true, message: 'Ainda não está na hora de executar' }
  }

  let themeIds: number[] = []
  try {
    themeIds = JSON.parse(config.theme_ids)
    if (!Array.isArray(themeIds)) themeIds = []
  } catch {}

  // Consume the SSE stream and collect result
  const stream = createPipelineStream({
    themeIds,
    triggers: { publishStatus: 'published' },
  })

  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let lastEvent: import('@/lib/agents/types').PipelineEvent | null = null

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const parts = buffer.split('\n\n')
    buffer = parts.pop() ?? ''
    for (const part of parts) {
      const line = part.replace(/^data: /, '').trim()
      if (!line) continue
      try {
        lastEvent = JSON.parse(line) as import('@/lib/agents/types').PipelineEvent
      } catch {}
    }
  }

  if (!lastEvent) return { success: false, message: 'Pipeline não retornou resultado' }

  if (lastEvent.type === 'pipeline_done') {
    return {
      success: true,
      message: lastEvent.message,
      post_id: (lastEvent.data?.post_id as number | undefined),
    }
  }

  return { success: false, message: lastEvent.message }
}
```

Keep the `getOrCreateAutomationConfig` export and the `AutomationResult` type. Remove all the inline AI logic (the old article generation code) since it's now handled by agents.

- [ ] **Step 2: Verify build**

```bash
npm run build 2>&1 | tail -30
```

Expected: successful build.

- [ ] **Step 3: Commit**

```bash
git add lib/automation.ts
git commit -m "feat: delegate runAutomationCycle to agent pipeline"
```

---

## Task 17: Add models API route (if not present)

**Files:**
- Check: `app/api/admin/ai/` routes

- [ ] **Step 1: Check if models route exists**

```bash
ls /Users/thuliobittencourt/Documents/Projetos/Blog/mma-blog/app/api/admin/ai/ 2>/dev/null
```

If `models/route.ts` does not exist, create it:

```ts
// app/api/admin/ai/models/route.ts
import { NextResponse } from 'next/server'
import { fetchAvailableModels } from '@/lib/ai'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const models = await fetchAvailableModels()
    return NextResponse.json({ models: models.map((m) => ({ id: m.id, name: m.name })) })
  } catch {
    return NextResponse.json({ models: [] })
  }
}
```

- [ ] **Step 2: Commit (if file was created)**

```bash
git add app/api/admin/ai/models/route.ts
git commit -m "feat: add models listing route for agent config UI"
```

---

## Task 18: Push to GitHub

- [ ] **Step 1: Final build check**

```bash
npm run build 2>&1 | tail -20
```

Expected: `✓ Compiled successfully` or equivalent.

- [ ] **Step 2: Push**

```bash
git push origin master
```

Expected: Vercel picks up the changes and deploys automatically.

---

## Self-Review

**Spec coverage:**
- ✅ Headline agent — Task 4
- ✅ Researcher (web search, no paid API) — Task 5
- ✅ Analyst (scrape + summarize each link) — Task 6
- ✅ Copywriter — Task 7
- ✅ Reviewer with re-run loop back to copywriter — Task 8 (loop in Task 12)
- ✅ CTA agent — Task 9
- ✅ Designer (image prompt + callOpenRouterImage with agent model) — Task 10
- ✅ Publisher with all 4 triggers (draft/publish/webhook/newsletter) — Task 11
- ✅ SSE real-time progress — Task 12, 13
- ✅ Per-agent prompt + model config — Tasks 2, 3, 13, 14
- ✅ "Generate prompt with AI" button based on briefing — Task 13, 14
- ✅ Replace "Prompts de IA" with "Agentes de IA" in admin — Task 15
- ✅ Each agent uses its own configured LLM — all agent files use `getAgentConfig`

**Type consistency:**
- `AgentContext`, `AgentResult`, `PipelineEvent`, `PublisherTriggers` all defined in `lib/agents/types.ts` Task 2 and used consistently across all agent files
- `getAgentConfig(id)` returns `ResolvedAgentConfig` (Task 3), all agents destructure `.model` and `.prompt` from it
- `createPipelineStream` signature in Task 12 matches import in Tasks 13 and 16
