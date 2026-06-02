# Texto Colado — Terceira Opção de Geração de Artigo

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar uma terceira opção "Texto Colado" no modal de novo artigo, onde o usuário cola um texto base e o pipeline de agentes gera o artigo a partir dele — pulando Researcher e usando o texto diretamente no Analyst.

**Architecture:** O texto colado é armazenado em `AgentContext.pastedText`. No pipeline, se `pastedText` estiver presente, o Researcher é pulado e o Analyst cria um `sourceSummary` resumindo o texto colado em vez de buscar URLs. Os demais agentes (Headline, Copywriter, Reviewer, CTA, Designer, Publisher) rodam normalmente.

**Tech Stack:** TypeScript, Next.js App Router, streaming SSE via `ReadableStream`, Tailwind CSS.

---

## Arquivos modificados

| Arquivo | Mudança |
|---|---|
| `lib/agents/types.ts` | Adiciona campo `pastedText?: string` em `AgentContext` |
| `lib/agents/analyst.ts` | Aceita `ctx.pastedText` como fonte direta (sem URLs) |
| `lib/agent-pipeline.ts` | Pula Researcher quando `ctx.pastedText` existe; envia eventos coerentes |
| `app/api/admin/agents/run/route.ts` | Aceita `pastedText` no body e repassa para `initialContext` |
| `app/admin/artigos/NewArticleModal.tsx` | Novo step `enter_text`, nova opção no `ai_type`, lógica de envio |

---

## Task 1: Adicionar `pastedText` ao `AgentContext`

**Files:**
- Modify: `lib/agents/types.ts`

- [ ] **Step 1: Adicionar o campo**

Em `lib/agents/types.ts`, na interface `AgentContext` (linha 93), adicionar `pastedText` logo após `researchLinks`:

```typescript
export interface AgentContext {
  themeId?: number
  themeTitle?: string
  themeDescription?: string | null
  briefing?: string
  headline?: string
  pastedText?: string          // texto colado pelo usuário como base do artigo
  researchLinks?: string[]
  sourceSummaries?: { url: string; summary: string }[]
  articleTitle?: string
  articleExcerpt?: string
  articleContent?: string
  reviewCycles?: number
  coverImageUrl?: string | null
  postId?: number
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/agents/types.ts
git commit -m "feat(types): adiciona pastedText ao AgentContext"
```

---

## Task 2: Adaptar o Analyst para aceitar texto colado diretamente

**Files:**
- Modify: `lib/agents/analyst.ts`

- [ ] **Step 1: Adicionar branch para `pastedText` no início de `runAnalystAgent`**

Em `lib/agents/analyst.ts`, adicionar o seguinte bloco **antes** do check de `ctx.researchLinks` (logo após a assinatura da função, linha 24):

```typescript
export async function runAnalystAgent(
  ctx: AgentContext,
  apiKey: string,
  onProgress?: (msg: string) => void
): Promise<AgentResult> {
  // Texto colado pelo usuário — usa diretamente como fonte, sem buscar URLs
  if (ctx.pastedText) {
    onProgress?.('Resumindo texto colado...')
    const config = await getAgentConfig('analyst')
    try {
      const resp = await callOpenRouter(
        {
          model: config.model,
          messages: [
            { role: 'system', content: config.prompt },
            {
              role: 'user',
              content: `Título do artigo: ${ctx.headline ?? ''}\n\nURL: texto-colado\n\nConteúdo:\n${ctx.pastedText.slice(0, 6000)}`,
            },
          ],
          temperature: 0.4,
          max_tokens: 600,
        },
        apiKey
      )
      const summary = resp.choices[0]?.message?.content?.trim() ?? ''
      return {
        success: true,
        message: '1 fonte analisada (texto colado)',
        data: {
          sourceSummaries: summary.length > 50
            ? [{ url: 'texto-colado', summary }]
            : [],
        },
      }
    } catch {
      return {
        success: true,
        message: 'Falha ao resumir texto colado, continuando sem resumos',
        data: { sourceSummaries: [] },
      }
    }
  }

  if (!ctx.researchLinks || ctx.researchLinks.length === 0) {
  // ... resto do código existente
```

O arquivo completo após a edição:

```typescript
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
  apiKey: string,
  onProgress?: (msg: string) => void
): Promise<AgentResult> {
  // Texto colado pelo usuário — usa diretamente como fonte, sem buscar URLs
  if (ctx.pastedText) {
    onProgress?.('Resumindo texto colado...')
    const config = await getAgentConfig('analyst')
    try {
      const resp = await callOpenRouter(
        {
          model: config.model,
          messages: [
            { role: 'system', content: config.prompt },
            {
              role: 'user',
              content: `Título do artigo: ${ctx.headline ?? ''}\n\nURL: texto-colado\n\nConteúdo:\n${ctx.pastedText.slice(0, 6000)}`,
            },
          ],
          temperature: 0.4,
          max_tokens: 600,
        },
        apiKey
      )
      const summary = resp.choices[0]?.message?.content?.trim() ?? ''
      return {
        success: true,
        message: '1 fonte analisada (texto colado)',
        data: {
          sourceSummaries: summary.length > 50
            ? [{ url: 'texto-colado', summary }]
            : [],
        },
      }
    } catch {
      return {
        success: true,
        message: 'Falha ao resumir texto colado, continuando sem resumos',
        data: { sourceSummaries: [] },
      }
    }
  }

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
    onProgress?.(`Analisando: ${url}`)
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
```

- [ ] **Step 2: Commit**

```bash
git add lib/agents/analyst.ts
git commit -m "feat(analyst): aceita pastedText como fonte direta sem buscar URLs"
```

---

## Task 3: Pular Researcher no pipeline quando `pastedText` existe

**Files:**
- Modify: `lib/agent-pipeline.ts` (bloco do Researcher, por volta das linhas 151-164)

- [ ] **Step 1: Adicionar skip condicional do Researcher**

Localizar o bloco `// 2. Researcher` e substituir por:

```typescript
        // 2. Researcher — skip if pastedText provided (text is already the source)
        if (aborted()) { send(makeEvent('pipeline_error', 'Pipeline interrompido pelo usuário')); controller.close(); return }
        if (ctx.pastedText) {
          send(makeEvent('agent_done', 'Texto colado fornecido, pesquisa na web ignorada', 'researcher'))
        } else {
          send(makeEvent('agent_start', 'Pesquisando referências na web...', 'researcher'))
          const researchResult = await runResearcherAgent(ctx, apiKey)
          if (!researchResult.success) {
            send(makeEvent('agent_error', researchResult.message, 'researcher'))
            // non-fatal: continue with no links
          } else {
            Object.assign(ctx, researchResult.data)
            const msg = researchResult.error
              ? `${researchResult.message} — resposta do modelo: ${researchResult.error}`
              : researchResult.message
            send(makeEvent('agent_done', msg, 'researcher', { count: ctx.researchLinks?.length }))
          }
        }
```

- [ ] **Step 2: Commit**

```bash
git add lib/agent-pipeline.ts
git commit -m "feat(pipeline): pula Researcher quando pastedText está presente"
```

---

## Task 4: Aceitar `pastedText` na rota da API

**Files:**
- Modify: `app/api/admin/agents/run/route.ts`

- [ ] **Step 1: Adicionar `pastedText` ao body tipado e ao `initialContext`**

Substituir o bloco do `body` e o `initialContext` pelo seguinte:

```typescript
  const body = await request.json() as {
    themeIds?: number[]
    publishStatus?: 'draft' | 'published'
    webhookUrl?: string
    sendNewsletter?: boolean
    headline?: string
    initialLinks?: string[]
    themeTitle?: string
    themeDescription?: string
    pastedText?: string
  }

  const triggers: PublisherTriggers = {
    publishStatus: body.publishStatus ?? 'published',
    webhookUrl: body.webhookUrl,
    sendNewsletter: body.sendNewsletter ?? false,
  }

  const stream = createPipelineStream({
    themeIds: body.themeIds ?? [],
    triggers,
    initialContext: {
      ...(body.headline ? { headline: body.headline } : {}),
      ...(body.initialLinks?.length ? { researchLinks: body.initialLinks } : {}),
      ...(body.themeTitle ? { themeTitle: body.themeTitle } : {}),
      ...(body.themeDescription ? { themeDescription: body.themeDescription } : {}),
      ...(body.pastedText ? { pastedText: body.pastedText } : {}),
    },
    signal: request.signal,
  })
```

- [ ] **Step 2: Commit**

```bash
git add app/api/admin/agents/run/route.ts
git commit -m "feat(api): aceita pastedText no body e repassa ao pipeline"
```

---

## Task 5: Adicionar opção "Texto Colado" no modal

**Files:**
- Modify: `app/admin/artigos/NewArticleModal.tsx`

- [ ] **Step 1: Adicionar `enter_text` aos tipos e estado**

Localizar a definição de `Step` (linha 34) e adicionar `'enter_text'`:

```typescript
type Step =
  | 'method'
  | 'ai_type'
  | 'select_theme'
  | 'enter_url'
  | 'enter_text'
  | 'pipeline'
```

Adicionar estado para o texto colado, logo após `const [url, setUrl] = useState('')`:

```typescript
  const [pastedText, setPastedText] = useState('')
```

No `useEffect` de reset (quando `open` muda), adicionar o reset do novo estado — localizar o bloco que reseta `url` e adicionar:

```typescript
      setUrl('')
      setPastedText('')
```

- [ ] **Step 2: Adicionar título para o novo step**

Localizar o objeto `titles` (linha 217) e adicionar a entrada:

```typescript
  const titles: Record<Step, string> = {
    method: 'Novo Artigo',
    ai_type: 'Criar com IA',
    select_theme: 'Escolha um Tema',
    enter_url: 'Link de Referência',
    enter_text: 'Texto Base',
    pipeline: pipelineDone ? 'Artigo Gerado!' : pipelineError ? 'Erro no Pipeline' : 'Gerando Artigo...',
  }
```

- [ ] **Step 3: Adicionar botão no `ai_type` e função de submit**

Localizar a função `handleUrlGenerate` (linha 198) e adicionar logo abaixo:

```typescript
  function handleTextGenerate() {
    if (pastedText.trim().length < 100) return
    runPipeline({ pastedText: pastedText.trim(), headline: '' })
  }
```

Localizar a função `goBack` (linha 203) e atualizar para incluir o novo step:

```typescript
  function goBack() {
    if (step === 'ai_type') setStep('method')
    else if (step === 'select_theme' || step === 'enter_url' || step === 'enter_text') setStep('ai_type')
  }
```

- [ ] **Step 4: Adicionar botão "Texto Colado" no grid do `ai_type`**

Localizar o `step === 'ai_type'` (linha 285). Alterar o grid de `grid-cols-2` para `grid-cols-3` e adicionar o terceiro botão:

```tsx
          {step === 'ai_type' && (
            <div className="grid grid-cols-3 gap-4">
              <button
                onClick={() => setStep('select_theme')}
                className="flex flex-col items-center gap-3 p-6 border-2 border-gray-200 rounded-xl hover:border-brand-primary hover:bg-brand-primary/5 transition-colors"
              >
                <svg className="h-10 w-10 text-brand-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 18h6" /><path d="M10 22h4" />
                  <path d="M12 2a7 7 0 017 7c0 2.38-1.19 4.47-3 5.74V17a1 1 0 01-1 1h-6a1 1 0 01-1-1v-2.26C6.19 13.47 5 11.38 5 9a7 7 0 017-7z" />
                </svg>
                <span className="text-sm font-semibold text-neutral-900">Tema Cadastrado</span>
                <span className="text-xs text-gray-500 text-center">Escolha um tema e o pipeline gera tudo automaticamente</span>
              </button>
              <button
                onClick={() => setStep('enter_url')}
                className="flex flex-col items-center gap-3 p-6 border-2 border-gray-200 rounded-xl hover:border-brand-primary hover:bg-brand-primary/5 transition-colors"
              >
                <svg className="h-10 w-10 text-brand-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
                  <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
                </svg>
                <span className="text-sm font-semibold text-neutral-900">Link de Referência</span>
                <span className="text-xs text-gray-500 text-center">Cole um link e os agentes criam o artigo baseado no conteúdo</span>
              </button>
              <button
                onClick={() => setStep('enter_text')}
                className="flex flex-col items-center gap-3 p-6 border-2 border-gray-200 rounded-xl hover:border-brand-primary hover:bg-brand-primary/5 transition-colors"
              >
                <svg className="h-10 w-10 text-brand-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                  <polyline points="10 9 9 9 8 9" />
                </svg>
                <span className="text-sm font-semibold text-neutral-900">Texto Colado</span>
                <span className="text-xs text-gray-500 text-center">Cole um texto base e os agentes criam o artigo a partir dele</span>
              </button>
            </div>
          )}
```

- [ ] **Step 5: Adicionar o step `enter_text` no JSX**

Logo após o bloco `{/* enter_url */}` e antes de `{/* pipeline */}`, adicionar:

```tsx
          {/* enter_text */}
          {step === 'enter_text' && (
            <div className="space-y-4">
              <p className="text-sm text-gray-500">Cole o texto base. Os agentes vão usá-lo como referência principal para criar um artigo original.</p>
              <textarea
                value={pastedText}
                onChange={(e) => setPastedText(e.target.value)}
                placeholder="Cole aqui o texto que servirá de base para o artigo..."
                rows={8}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary resize-none"
                autoFocus
              />
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-400">
                  {pastedText.length} caracteres {pastedText.length < 100 && pastedText.length > 0 ? '(mínimo 100)' : ''}
                </span>
                <button
                  onClick={handleTextGenerate}
                  disabled={pastedText.trim().length < 100}
                  className="bg-brand-primary text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                >
                  Gerar Artigo
                </button>
              </div>
            </div>
          )}
```

- [ ] **Step 6: Commit**

```bash
git add app/admin/artigos/NewArticleModal.tsx
git commit -m "feat(modal): adiciona opção Texto Colado para geração de artigos"
```

---

## Task 6: Verificação manual

- [ ] **Step 1: Iniciar o servidor de desenvolvimento**

```bash
npm run dev
```

Abrir `http://localhost:3000/admin/artigos`.

- [ ] **Step 2: Testar o fluxo completo**

1. Clicar em "Novo Artigo"
2. Selecionar "Com Agentes de IA"
3. Verificar que aparecem 3 opções: Tema Cadastrado, Link de Referência, **Texto Colado**
4. Clicar em "Texto Colado"
5. Colar pelo menos 100 caracteres no textarea
6. Verificar que o contador de caracteres atualiza
7. Verificar que o botão fica desabilitado com menos de 100 caracteres
8. Clicar "Gerar Artigo"
9. Verificar que o chip do Researcher fica verde imediatamente com mensagem "Texto colado fornecido, pesquisa na web ignorada"
10. Aguardar o pipeline completar e verificar que o artigo é gerado corretamente

- [ ] **Step 3: Verificar TypeScript**

```bash
npm run build
```

Expected: sem erros de tipo.
