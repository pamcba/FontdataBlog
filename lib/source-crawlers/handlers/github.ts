import { callOpenRouter, getAIApiKey } from '@/lib/ai'
import { getFirecrawlApiKey, firecrawlSearch, firecrawlScrape } from '@/lib/firecrawl'
import type { CrawlerHandlerOptions, CrawlerHandlerResult } from '../types'

interface GithubRepo {
  full_name: string
  name: string
  description: string | null
  html_url: string
  stargazers_count: number
  topics: string[]
}

// ── GitHub API search (fallback) ─────────────────────────────────────────────

async function searchReposGithubApi(query: string): Promise<GithubRepo[]> {
  const encoded = encodeURIComponent(query)
  const resp = await fetch(
    `https://api.github.com/search/repositories?q=${encoded}&sort=stars&order=desc&per_page=20`,
    { headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' } }
  )
  if (!resp.ok) throw new Error(`GitHub API error: ${resp.status}`)
  const data = await resp.json() as { items: GithubRepo[] }
  return data.items ?? []
}

// ── Firecrawl search → extract GitHub repo URLs ──────────────────────────────

async function searchReposFirecrawl(query: string, firecrawlKey: string): Promise<GithubRepo[]> {
  const githubQuery = `site:github.com ${query}`
  const urls = await firecrawlSearch(githubQuery, firecrawlKey)

  // Extract repo full_names from URLs like https://github.com/owner/repo
  const repoUrls = urls.filter((u) => {
    try {
      const { hostname, pathname } = new URL(u)
      const parts = pathname.split('/').filter(Boolean)
      return hostname === 'github.com' && parts.length >= 2
    } catch { return false }
  })

  const repos: GithubRepo[] = repoUrls.map((u) => {
    const parts = new URL(u).pathname.split('/').filter(Boolean)
    const full_name = `${parts[0]}/${parts[1]}`
    return {
      full_name,
      name: parts[1],
      description: null,
      html_url: `https://github.com/${full_name}`,
      stargazers_count: 0,
      topics: [],
    }
  })

  // Deduplicate by full_name
  return repos.filter((r, i, arr) => arr.findIndex((x) => x.full_name === r.full_name) === i)
}

// ── README fetch ─────────────────────────────────────────────────────────────

async function fetchReadme(fullName: string, firecrawlKey: string | null): Promise<string> {
  if (firecrawlKey) {
    const content = await firecrawlScrape(`https://github.com/${fullName}`, firecrawlKey)
    if (content) return content
  }
  const resp = await fetch(`https://api.github.com/repos/${fullName}/readme`, {
    headers: { Accept: 'application/vnd.github.raw+json', 'X-GitHub-Api-Version': '2022-11-28' },
  })
  if (!resp.ok) return ''
  return await resp.text()
}

// ── LLM repo picker ──────────────────────────────────────────────────────────

async function pickRepo(repos: GithubRepo[], prompt: string, apiKey: string): Promise<GithubRepo> {
  if (repos.length === 1) return repos[0]
  const list = repos.map((r, i) => `${i + 1}. ${r.full_name} — ${r.description ?? 'sem descrição'}${r.stargazers_count > 0 ? ` (${r.stargazers_count} stars)` : ''}`).join('\n')
  const resp = await callOpenRouter(
    {
      model: 'openai/gpt-4o-mini',
      messages: [
        { role: 'system', content: `Você é um curador de conteúdo para um blog. ${prompt}\n\nEscolha o repositório mais adequado para gerar um artigo de blog interessante e ainda não explorado. Responda APENAS com o número da opção escolhida (ex: 3).` },
        { role: 'user', content: `Repositórios disponíveis:\n${list}` },
      ],
      temperature: 0.3,
      max_tokens: 10,
    },
    apiKey
  )
  const raw = resp.choices[0]?.message?.content?.trim() ?? '1'
  const idx = parseInt(raw, 10) - 1
  return repos[Math.max(0, Math.min(idx, repos.length - 1))]
}

// ── Main handler ─────────────────────────────────────────────────────────────

export async function runGithubHandler(opts: CrawlerHandlerOptions): Promise<CrawlerHandlerResult> {
  const apiKey = await getAIApiKey()
  if (!apiKey) throw new Error('AI API key não configurada')

  const firecrawlKey = await getFirecrawlApiKey()

  // Use Firecrawl if available, fallback to GitHub API
  let repos: GithubRepo[]
  if (firecrawlKey) {
    repos = await searchReposFirecrawl(opts.url, firecrawlKey)
    // If Firecrawl returned nothing, fall back to GitHub API
    if (repos.length === 0) {
      repos = await searchReposGithubApi(opts.url)
    }
  } else {
    repos = await searchReposGithubApi(opts.url)
  }

  if (repos.length === 0) throw new Error('Nenhum repositório encontrado para a busca configurada')

  const fresh = repos.filter((r) => !opts.alreadyProcessedKeys.includes(r.full_name))
  if (fresh.length === 0) throw new Error(`Todos os ${repos.length} repositórios encontrados já foram processados anteriormente`)

  const chosen = await pickRepo(fresh, opts.prompt, apiKey)
  const readme = await fetchReadme(chosen.full_name, firecrawlKey)

  const content = [
    `# ${chosen.full_name}`,
    chosen.description ? `\n${chosen.description}` : '',
    `\nURL: ${chosen.html_url}`,
    chosen.stargazers_count > 0 ? `Stars: ${chosen.stargazers_count}` : '',
    chosen.topics.length > 0 ? `Tópicos: ${chosen.topics.join(', ')}` : '',
    readme ? `\n---\n\n${readme}` : '',
  ].filter(Boolean).join('\n')

  return {
    chosen: {
      key: chosen.full_name,
      title: chosen.name,
      content,
      url: chosen.html_url,
    },
  }
}
