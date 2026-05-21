import { NextResponse } from 'next/server'
import * as csstree from 'css-tree'

export const dynamic = 'force-dynamic'

const TIMEOUT_MS = 10_000

interface ExtractedTokens {
  custom_properties: Record<string, string>
  font_families: string[]
  colors: string[]
  border_radii: string[]
  font_sizes: string[]
  source_url: string
}

function extractCSSTokens(cssText: string): Omit<ExtractedTokens, 'source_url'> {
  const custom_properties: Record<string, string> = {}
  const font_families = new Set<string>()
  const colors = new Set<string>()
  const border_radii = new Set<string>()
  const font_sizes = new Set<string>()

  let ast: csstree.CssNode
  try {
    ast = csstree.parse(cssText, { parseValue: true, onParseError: () => {} })
  } catch {
    return { custom_properties, font_families: [], colors: [], border_radii: [], font_sizes: [] }
  }

  csstree.walk(ast, (node) => {
    if (node.type === 'Declaration') {
      const prop = node.property
      const value = csstree.generate(node.value)

      if (prop.startsWith('--')) {
        custom_properties[prop] = value
        return
      }

      if (prop === 'font-family') {
        font_families.add(value.trim())
      }

      if (['color', 'background-color', 'background', 'border-color', 'fill'].includes(prop)) {
        const hex = value.match(/#[0-9A-Fa-f]{3,8}\b/g)
        hex?.forEach((h) => {
          if (h.length === 4 || h.length === 7) colors.add(h.toUpperCase())
        })
      }

      if (prop === 'border-radius') {
        border_radii.add(value.trim())
      }

      if (prop === 'font-size') {
        const v = value.trim()
        if (/^\d+(\.\d+)?(px|rem|em)$/.test(v)) font_sizes.add(v)
      }
    }
  })

  return {
    custom_properties,
    font_families: Array.from(font_families).slice(0, 20),
    colors: Array.from(colors).slice(0, 50),
    border_radii: Array.from(border_radii).slice(0, 20),
    font_sizes: Array.from(font_sizes).slice(0, 20),
  }
}

async function fetchCSSFromPage(url: string): Promise<string> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BlogDesignExtractor/1.0)' },
    })
    const html = await res.text()

    const inlineStyles: string[] = []
    const styleRegex = /<style[^>]*>([\s\S]*?)<\/style>/gi
    let m: RegExpExecArray | null
    while ((m = styleRegex.exec(html)) !== null) {
      inlineStyles.push(m[1])
    }

    const linkRegex = /<link[^>]+rel=["']stylesheet["'][^>]+href=["']([^"']+)["']/gi
    const cssUrls: string[] = []
    while ((m = linkRegex.exec(html)) !== null) {
      const href = m[1]
      if (href.startsWith('http')) {
        cssUrls.push(href)
      } else if (href.startsWith('//')) {
        cssUrls.push(`https:${href}`)
      } else {
        cssUrls.push(new URL(href, new URL(url)).toString())
      }
    }

    const externalCSS = await Promise.allSettled(
      cssUrls.slice(0, 5).map(async (cssUrl) => {
        const r = await fetch(cssUrl, {
          signal: controller.signal,
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BlogDesignExtractor/1.0)' },
        })
        return r.text()
      })
    )

    return [
      ...inlineStyles,
      ...externalCSS
        .filter((r): r is PromiseFulfilledResult<string> => r.status === 'fulfilled')
        .map((r) => r.value),
    ].join('\n')
  } finally {
    clearTimeout(timer)
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const rawUrl = body?.url

    if (!rawUrl || typeof rawUrl !== 'string') {
      return NextResponse.json({ error: 'Campo "url" é obrigatório' }, { status: 400 })
    }

    let parsedUrl: URL
    try {
      parsedUrl = new URL(rawUrl)
    } catch {
      return NextResponse.json({ error: 'URL inválida' }, { status: 400 })
    }

    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return NextResponse.json({ error: 'Apenas URLs http/https são permitidas' }, { status: 400 })
    }

    const cssText = await fetchCSSFromPage(parsedUrl.toString())

    if (!cssText.trim()) {
      return NextResponse.json({ error: 'Nenhum CSS encontrado na URL fornecida' }, { status: 422 })
    }

    const tokens = extractCSSTokens(cssText)

    return NextResponse.json({ ...tokens, source_url: parsedUrl.toString() } satisfies ExtractedTokens)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('abort') || msg.includes('timeout')) {
      return NextResponse.json({ error: 'Timeout ao acessar a URL (limite: 10s)' }, { status: 504 })
    }
    console.error('[design-system extract]', msg)
    return NextResponse.json({ error: 'Erro ao extrair design system' }, { status: 500 })
  }
}
