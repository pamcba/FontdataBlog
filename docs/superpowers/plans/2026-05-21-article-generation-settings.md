# Article Generation Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar uma seção "Configurações" no sidebar de Artigos onde o usuário define tom de voz, tamanho mínimo, idioma, criatividade e instruções fixas, com essas configs injetadas automaticamente em todos os prompts de geração de artigos via IA.

**Architecture:** As configurações são salvas em `site_settings` sob a chave `article_generation_config` como JSON. Uma função utilitária `lib/article-config.ts` lê essa chave e retorna um objeto tipado com defaults. Os dois pontos de geração (`lib/automation.ts` e `app/api/admin/ai/article/generate/route.ts`) importam essa função e injetam as configs nos prompts. A UI é um novo componente `ConfiguracaoArtigosSection` adicionado como seção no sidebar existente de `ArtigosClient.tsx`.

**Tech Stack:** Next.js App Router, TypeScript, Tailwind CSS, Drizzle ORM, `site_settings` table (key/value), React state + fetch

---

## File Map

| Ação | Arquivo | Responsabilidade |
|------|---------|-----------------|
| Criar | `lib/article-config.ts` | Lê/escreve configs de geração no DB, tipagem, defaults |
| Criar | `app/api/admin/article-config/route.ts` | GET e PUT das configs via API REST |
| Modificar | `app/admin/artigos/ArtigosClient.tsx` | Adicionar item "Configurações" no SIDEBAR_ITEMS e novo case no renderContent |
| Modificar | `lib/automation.ts` | Consumir configs ao montar o prompt do artigo |
| Modificar | `app/api/admin/ai/article/generate/route.ts` | Consumir configs ao montar o prompt manual |

---

## Task 1: Criar `lib/article-config.ts`

**Files:**
- Create: `lib/article-config.ts`

- [ ] **Step 1: Criar o arquivo com tipos, defaults e funções de leitura/escrita**

```typescript
// lib/article-config.ts
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
```

- [ ] **Step 2: Commit**

```bash
git add lib/article-config.ts
git commit -m "feat: add article generation config lib with types and DB helpers"
```

---

## Task 2: Criar rota API `app/api/admin/article-config/route.ts`

**Files:**
- Create: `app/api/admin/article-config/route.ts`

- [ ] **Step 1: Criar o arquivo da rota**

```typescript
// app/api/admin/article-config/route.ts
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
```

- [ ] **Step 2: Verificar que o middleware já protege `/api/admin/*`**

Abrir `middleware.ts` e confirmar que há uma regra cobrindo `/api/admin/article-config`. Não é necessário adicionar nada se já existir um matcher genérico para `/api/admin/(.*)`.

- [ ] **Step 3: Commit**

```bash
git add app/api/admin/article-config/route.ts
git commit -m "feat: add GET/PUT API route for article generation config"
```

---

## Task 3: Adicionar seção `ConfiguracaoArtigosSection` em `ArtigosClient.tsx`

**Files:**
- Modify: `app/admin/artigos/ArtigosClient.tsx`

- [ ] **Step 1: Adicionar `'configuracao'` ao tipo `SectionId` e ao array `SIDEBAR_ITEMS`**

Localizar no topo do arquivo:

```typescript
type SectionId = 'lista' | 'temas' | 'briefing' | 'automacao' | 'prompts'
```

Substituir por:

```typescript
type SectionId = 'lista' | 'temas' | 'briefing' | 'automacao' | 'prompts' | 'configuracao'
```

Localizar o array `SIDEBAR_ITEMS` e adicionar o item ao final:

```typescript
const SIDEBAR_ITEMS: { id: SectionId; label: string; icon: string }[] = [
  { id: 'lista', label: 'Lista de Artigos', icon: '📝' },
  { id: 'temas', label: 'Temas', icon: '💡' },
  { id: 'briefing', label: 'Briefing', icon: '📋' },
  { id: 'automacao', label: 'Automação', icon: '🤖' },
  { id: 'prompts', label: 'Prompts de IA', icon: '✨' },
  { id: 'configuracao', label: 'Configurações', icon: '⚙️' },
]
```

- [ ] **Step 2: Adicionar o case no `renderContent()`**

Localizar o switch dentro de `renderContent()` e adicionar antes do fechamento:

```typescript
case 'configuracao':
  return <ConfiguracaoArtigosSection />
```

- [ ] **Step 3: Adicionar o componente `ConfiguracaoArtigosSection` ao final do arquivo**

Adicionar depois de `PromptsSection`:

```typescript
import type { ArticleGenerationConfig, ArticleVoiceTone, ArticleLanguage } from '@/lib/article-config'
import { ARTICLE_CONFIG_DEFAULTS } from '@/lib/article-config'
```

> **Nota:** Como este é um Client Component, a importação de `lib/article-config` deve ser apenas dos tipos e defaults (que não têm imports de DB). As funções `getArticleConfig`/`saveArticleConfig` são chamadas via API, não diretamente aqui.

Adicionar no topo do arquivo, junto com os outros imports:

```typescript
import type { ArticleGenerationConfig } from '@/lib/article-config'

const ARTICLE_CONFIG_DEFAULTS_CLIENT: ArticleGenerationConfig = {
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
```

Adicionar o componente ao final do arquivo (após `PromptsSection`):

```typescript
function ConfiguracaoArtigosSection() {
  const [config, setConfig] = useState<ArticleGenerationConfig>(ARTICLE_CONFIG_DEFAULTS_CLIENT)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null)

  useEffect(() => {
    fetch('/api/admin/article-config')
      .then((r) => (r.ok ? r.json() : {}))
      .then((data: { config?: ArticleGenerationConfig }) => {
        if (data.config) setConfig(data.config)
      })
      .catch(() => {})
  }, [])

  async function handleSave() {
    setSaving(true)
    setToast(null)
    try {
      const res = await fetch('/api/admin/article-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Erro ao salvar')
      setConfig(data.config)
      setToast({ type: 'success', msg: 'Configurações salvas com sucesso!' })
    } catch (err) {
      setToast({ type: 'error', msg: err instanceof Error ? err.message : 'Erro ao salvar' })
    } finally {
      setSaving(false)
    }
  }

  function set<K extends keyof ArticleGenerationConfig>(key: K, value: ArticleGenerationConfig[K]) {
    setConfig((prev) => ({ ...prev, [key]: value }))
  }

  return (
    <section className="bg-white rounded-xl border border-gray-200 p-6">
      <h2 className="text-lg font-semibold text-neutral-900 mb-1">Configurações de Geração</h2>
      <p className="text-sm text-gray-500 mb-6">
        Defina o padrão de todos os artigos gerados por IA — automação e geração manual. Essas configurações são injetadas automaticamente nos prompts.
      </p>

      {toast && (
        <div className={`mb-5 px-4 py-3 rounded-lg text-sm ${
          toast.type === 'success'
            ? 'bg-green-50 text-green-800 border border-green-200'
            : 'bg-red-50 text-red-800 border border-red-200'
        }`}>
          {toast.msg}
        </div>
      )}

      <div className="space-y-6">
        {/* Tamanho mínimo */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Tamanho mínimo do artigo</label>
          <select
            value={config.minWords}
            onChange={(e) => set('minWords', Number(e.target.value))}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary bg-white"
          >
            <option value={600}>600 palavras</option>
            <option value={800}>800 palavras</option>
            <option value={1000}>1000 palavras</option>
            <option value={1200}>1200 palavras</option>
            <option value={1500}>1500 palavras</option>
            <option value={2000}>2000 palavras</option>
            <option value={2500}>2500 palavras</option>
          </select>
        </div>

        {/* Tom de voz */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Tom de voz</label>
          <select
            value={config.voiceTone}
            onChange={(e) => set('voiceTone', e.target.value as ArticleVoiceTone)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary bg-white"
          >
            <option value="profissional">Profissional</option>
            <option value="informal">Informal</option>
            <option value="tecnico">Técnico</option>
            <option value="jornalistico">Jornalístico</option>
            <option value="descontraido">Descontraído</option>
          </select>
        </div>

        {/* Idioma */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Idioma</label>
          <select
            value={config.language}
            onChange={(e) => set('language', e.target.value as ArticleLanguage)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary bg-white"
          >
            <option value="pt-BR">Português (BR)</option>
            <option value="en">Inglês</option>
            <option value="es">Espanhol</option>
          </select>
        </div>

        {/* Criatividade */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Criatividade (temperatura) — {config.creativity.toFixed(1)}
          </label>
          <p className="text-xs text-gray-500 mb-2">
            Valores mais altos geram textos mais criativos e variados. Valores mais baixos geram textos mais previsíveis e conservadores.
          </p>
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-400 w-16">Conservador</span>
            <input
              type="range"
              min={0.1}
              max={1.0}
              step={0.1}
              value={config.creativity}
              onChange={(e) => set('creativity', Number(e.target.value))}
              className="flex-1 accent-brand-primary"
            />
            <span className="text-xs text-gray-400 w-16 text-right">Criativo</span>
          </div>
        </div>

        {/* Elementos de formato */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Elementos de formato</label>
          <div className="space-y-2">
            {[
              { key: 'includeLists', label: 'Incluir listas (ul/ol)' },
              { key: 'includeExamples', label: 'Incluir exemplos práticos' },
              { key: 'includeQuotes', label: 'Incluir blockquotes / citações' },
              { key: 'includeTables', label: 'Incluir tabelas' },
            ].map(({ key, label }) => (
              <label key={key} className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config[key as keyof ArticleGenerationConfig] as boolean}
                  onChange={(e) => set(key as keyof ArticleGenerationConfig, e.target.checked as never)}
                  className="rounded accent-brand-primary"
                />
                <span className="text-sm text-gray-700">{label}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Instruções adicionais fixas */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Instruções adicionais fixas <span className="font-normal text-gray-400">(opcional)</span>
          </label>
          <p className="text-xs text-gray-500 mb-2">
            Essas instruções são adicionadas a todos os prompts de geração. Ex: &ldquo;Sempre termine com 3 perguntas para o leitor&rdquo;, &ldquo;Mencione o esporte sempre que possível&rdquo;.
          </p>
          <textarea
            value={config.extraInstructions}
            onChange={(e) => set('extraInstructions', e.target.value)}
            rows={4}
            placeholder="Ex: Sempre cite pelo menos uma estatística. Termine o artigo com uma chamada para ação relacionada ao esporte."
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary resize-y"
          />
        </div>
      </div>

      <div className="flex justify-end mt-6 pt-5 border-t border-gray-100">
        <button
          onClick={handleSave}
          disabled={saving}
          className="bg-brand-primary text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-brand-primary-dark transition-colors disabled:opacity-50"
        >
          {saving ? 'Salvando...' : 'Salvar Configurações'}
        </button>
      </div>
    </section>
  )
}
```

- [ ] **Step 4: Confirmar que os tipos `ArticleVoiceTone` e `ArticleLanguage` são importados**

O arquivo é um Client Component (`'use client'`). Os tipos podem ser importados de `@/lib/article-config` sem problema, pois TypeScript strips types em runtime. O objeto de defaults também pode ser importado normalmente — ele não contém imports de DB.

Adicionar no topo do arquivo, após os imports existentes:

```typescript
import type { ArticleGenerationConfig, ArticleVoiceTone, ArticleLanguage } from '@/lib/article-config'
import { ARTICLE_CONFIG_DEFAULTS } from '@/lib/article-config'
```

E **remover** a declaração local `ARTICLE_CONFIG_DEFAULTS_CLIENT` que foi adicionada no passo anterior — usar o import diretamente:

```typescript
// Dentro de ConfiguracaoArtigosSection:
const [config, setConfig] = useState<ArticleGenerationConfig>(ARTICLE_CONFIG_DEFAULTS)
```

- [ ] **Step 5: Rodar o servidor de dev e verificar que a nova aba aparece**

```bash
npm run dev
```

Acessar `http://localhost:3000/admin/artigos` e clicar em "⚙️ Configurações" no sidebar. Verificar:
- Aba aparece sem erro de TypeScript/runtime
- Formulário carrega com os valores default
- Botão "Salvar Configurações" chama a API e exibe toast de sucesso
- Alterar valores e salvar — recarregar a página e confirmar persistência

- [ ] **Step 6: Commit**

```bash
git add app/admin/artigos/ArtigosClient.tsx
git commit -m "feat: add Configurações section to Artigos sidebar with article generation settings UI"
```

---

## Task 4: Injetar configs em `lib/automation.ts`

**Files:**
- Modify: `lib/automation.ts`

- [ ] **Step 1: Importar `getArticleConfig` e `buildArticleConfigPromptSection`**

Adicionar no topo do arquivo junto com os imports existentes:

```typescript
import { getArticleConfig, buildArticleConfigPromptSection } from '@/lib/article-config'
```

- [ ] **Step 2: Carregar as configs no início de `runAutomationCycle`**

Dentro da função `runAutomationCycle`, logo após carregar o briefing (depois do bloco `let briefingContent`), adicionar:

```typescript
// Load article generation config
const articleConfig = await getArticleConfig()
const configSection = buildArticleConfigPromptSection(articleConfig)
```

- [ ] **Step 3: Substituir o tamanho mínimo hardcoded e injetar config section no prompt**

Localizar o bloco do `articlePrompt`. A linha atual é:

```typescript
- O artigo deve ter pelo menos 800 palavras
```

Substituir esse requisito e adicionar a seção de config. O prompt completo deve ficar:

```typescript
const articlePrompt = `Você é um redator profissional especializado em blogs corporativos. Escreva um artigo completo e detalhado sobre:

Tema: "${theme.title}"
${theme.description ? `Descrição do tema: ${theme.description}` : ''}
${contextSection}

${configSection}

Requisitos técnicos:
- O artigo deve ter pelo menos ${articleConfig.minWords} palavras
- Use formatação HTML para estruturar o conteúdo (h2, h3, p, strong, em, ul, ol, li, blockquote)
- Inclua uma introdução envolvente
- Desenvolva o conteúdo com subtítulos bem estruturados
- Termine com uma conclusão
- O conteúdo deve ser informativo, bem escrito e otimizado para SEO${customPromptSection}

Responda com um JSON válido (sem markdown, sem \`\`\`) com a seguinte estrutura:
{
  "title": "título do artigo",
  "excerpt": "resumo em até 160 caracteres",
  "content": "conteúdo HTML completo"
}`
```

- [ ] **Step 4: Passar `creativity` como temperatura na chamada `aiChat`**

Localizar a chamada a `aiChat` para geração do artigo:

```typescript
{ temperature: 0.7, max_tokens: 4096 }
```

Substituir por:

```typescript
{ temperature: articleConfig.creativity, max_tokens: 4096 }
```

- [ ] **Step 5: Commit**

```bash
git add lib/automation.ts
git commit -m "feat: inject article generation config into automation prompt"
```

---

## Task 5: Injetar configs em `app/api/admin/ai/article/generate/route.ts`

**Files:**
- Modify: `app/api/admin/ai/article/generate/route.ts`

- [ ] **Step 1: Importar as funções de config**

Adicionar no topo do arquivo junto com os imports existentes:

```typescript
import { getArticleConfig, buildArticleConfigPromptSection } from '@/lib/article-config'
```

- [ ] **Step 2: Carregar as configs no início do handler POST, após carregar o briefing**

Depois do bloco que carrega `briefingContent`, adicionar:

```typescript
const articleConfig = await getArticleConfig()
const configSection = buildArticleConfigPromptSection(articleConfig)
```

- [ ] **Step 3: Substituir o prompt hardcoded pelo prompt com configs injetadas**

Localizar o bloco do `prompt` existente:

```typescript
const prompt = `Você é um redator profissional especializado em blogs corporativos. Escreva um artigo completo e detalhado sobre:

Título: ${title}
${description ? `Descrição/Resumo: ${description}` : ''}
${contextSection}

Requisitos:
- O artigo deve ter pelo menos 800 palavras
- Use formatação HTML para estruturar o conteúdo (h2, h3, p, strong, em, ul, ol, li, blockquote)
- Inclua uma introdução envolvente
- Desenvolva o conteúdo com subtítulos bem estruturados
- Termine com uma conclusão
- O conteúdo deve ser informativo, bem escrito e otimizado para SEO
- Escreva em português do Brasil

Responda com um JSON válido (sem markdown, sem \`\`\`) com a seguinte estrutura:
{
  "title": "título do artigo (pode ser melhorado)",
  "excerpt": "resumo do artigo em até 160 caracteres",
  "content": "conteúdo HTML completo do artigo"
}`
```

Substituir por:

```typescript
const prompt = `Você é um redator profissional especializado em blogs corporativos. Escreva um artigo completo e detalhado sobre:

Título: ${title}
${description ? `Descrição/Resumo: ${description}` : ''}
${contextSection}

${configSection}

Requisitos técnicos:
- O artigo deve ter pelo menos ${articleConfig.minWords} palavras
- Use formatação HTML para estruturar o conteúdo (h2, h3, p, strong, em, ul, ol, li, blockquote)
- Inclua uma introdução envolvente
- Desenvolva o conteúdo com subtítulos bem estruturados
- Termine com uma conclusão
- O conteúdo deve ser informativo, bem escrito e otimizado para SEO

Responda com um JSON válido (sem markdown, sem \`\`\`) com a seguinte estrutura:
{
  "title": "título do artigo (pode ser melhorado)",
  "excerpt": "resumo do artigo em até 160 caracteres",
  "content": "conteúdo HTML completo do artigo"
}`
```

- [ ] **Step 4: Atualizar a temperatura na chamada `aiChat`**

Localizar:

```typescript
{ temperature: 0.7, max_tokens: 8000 }
```

Substituir por:

```typescript
{ temperature: articleConfig.creativity, max_tokens: 8000 }
```

- [ ] **Step 5: Commit**

```bash
git add app/api/admin/ai/article/generate/route.ts
git commit -m "feat: inject article generation config into manual article generation prompt"
```

---

## Task 6: Verificação final

- [ ] **Step 1: Build de produção para garantir sem erros TypeScript**

```bash
npm run build
```

Esperado: Build finaliza sem erros de tipo.

- [ ] **Step 2: Teste de fluxo completo**

1. Acessar `/admin/artigos` → clicar em **Configurações**
2. Alterar: tom de voz para **Técnico**, tamanho para **1200 palavras**, criatividade para **0.9**, marcar **Incluir exemplos práticos**
3. Salvar → verificar toast de sucesso
4. Recarregar a página → confirmar que os valores persistiram
5. Ir em **Automação** → clicar em **Executar agora**
6. Verificar no artigo gerado que o conteúdo reflete o tom e comprimento esperados
7. Ir em **Lista de Artigos** → abrir um artigo → clicar em **Editar** → usar **Gerar com IA** → verificar que o prompt usa as configs

- [ ] **Step 3: Commit final**

```bash
git add -A
git commit -m "chore: final verification of article generation config feature"
```
