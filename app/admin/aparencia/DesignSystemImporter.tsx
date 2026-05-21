'use client'

import { useState } from 'react'
import type { DesignSystem } from '@/lib/settings'

interface ExtractedTokens {
  custom_properties: Record<string, string>
  font_families: string[]
  colors: string[]
  border_radii: string[]
  font_sizes: string[]
  source_url: string
}

function mapCustomPropertiesToDS(props: Record<string, string>): Partial<DesignSystem> {
  const mapped: Partial<DesignSystem> = {}

  const tryMap = (prop: string, key: keyof DesignSystem) => {
    if (props[prop]) (mapped as Record<string, string>)[key] = props[prop]
  }

  tryMap('--font-family-base', 'font_sans')
  tryMap('--font-family-sans', 'font_sans')
  tryMap('--font-family-heading', 'font_serif')
  tryMap('--font-family-mono', 'font_mono')
  tryMap('--font-size-base', 'font_size_base')
  tryMap('--font-size-sm', 'font_size_sm')
  tryMap('--font-size-lg', 'font_size_lg')
  tryMap('--font-size-xl', 'font_size_xl')
  tryMap('--font-size-2xl', 'font_size_2xl')
  tryMap('--font-size-3xl', 'font_size_3xl')
  tryMap('--line-height-base', 'line_height_base')
  tryMap('--font-weight-normal', 'font_weight_normal')
  tryMap('--font-weight-medium', 'font_weight_medium')
  tryMap('--font-weight-bold', 'font_weight_bold')
  tryMap('--spacing-base', 'spacing_base')
  tryMap('--radius-sm', 'radius_sm')
  tryMap('--radius-md', 'radius_md')
  tryMap('--radius-lg', 'radius_lg')
  tryMap('--radius-full', 'radius_full')
  tryMap('--color-text-primary', 'color_text_primary')
  tryMap('--color-text-secondary', 'color_text_secondary')
  tryMap('--color-border', 'color_border')
  tryMap('--color-error', 'color_error')
  tryMap('--color-success', 'color_success')
  tryMap('--color-warning', 'color_warning')
  tryMap('--text-primary', 'color_text_primary')
  tryMap('--text-secondary', 'color_text_secondary')
  tryMap('--color-danger', 'color_error')

  return mapped
}

interface Props {
  onApply: (tokens: Partial<DesignSystem>) => void
}

export function DesignSystemImporter({ onApply }: Props) {
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [extracted, setExtracted] = useState<ExtractedTokens | null>(null)
  const [mapped, setMapped] = useState<Partial<DesignSystem> | null>(null)

  async function handleExtract() {
    setLoading(true)
    setError(null)
    setExtracted(null)
    setMapped(null)
    try {
      const res = await fetch('/api/admin/design-system/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Erro desconhecido')
      setExtracted(data as ExtractedTokens)
      setMapped(mapCustomPropertiesToDS(data.custom_properties))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao extrair')
    } finally {
      setLoading(false)
    }
  }

  function handleApply() {
    if (mapped) onApply(mapped)
  }

  const mappedCount = mapped ? Object.keys(mapped).length : 0

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <h3 className="text-sm font-semibold text-neutral-900 mb-1">Importar do site da empresa</h3>
      <p className="text-xs text-gray-500 mb-4">
        Cole a URL do site da sua empresa. O sistema vai ler o CSS, extrair as cores, fontes e tokens
        e pré-preencher as configurações abaixo para você confirmar.
      </p>

      <div className="flex gap-2 mb-4">
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://suaempresa.com.br"
          className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-primary"
          onKeyDown={(e) => e.key === 'Enter' && !loading && url && handleExtract()}
        />
        <button
          onClick={handleExtract}
          disabled={loading || !url}
          className="bg-brand-primary text-white px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity whitespace-nowrap"
        >
          {loading ? 'Lendo CSS...' : 'Extrair Design'}
        </button>
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-4">
          {error}
        </p>
      )}

      {extracted && (
        <div className="space-y-4">
          <div className="bg-gray-50 rounded-lg p-4 text-xs text-gray-600 space-y-2">
            <p className="font-semibold text-gray-700">Tokens encontrados em {extracted.source_url}</p>

            {extracted.font_families.length > 0 && (
              <div>
                <span className="font-medium">Fontes: </span>
                <span>{extracted.font_families.slice(0, 5).join(', ')}</span>
              </div>
            )}

            {extracted.colors.length > 0 && (
              <div className="flex items-center gap-1 flex-wrap">
                <span className="font-medium">Cores: </span>
                {extracted.colors.slice(0, 12).map((c) => (
                  <span
                    key={c}
                    className="inline-block w-5 h-5 rounded border border-gray-200"
                    style={{ backgroundColor: c }}
                    title={c}
                  />
                ))}
              </div>
            )}

            {extracted.border_radii.length > 0 && (
              <div>
                <span className="font-medium">Border radius: </span>
                <span>{extracted.border_radii.slice(0, 5).join(', ')}</span>
              </div>
            )}

            {Object.keys(extracted.custom_properties).length > 0 && (
              <div>
                <span className="font-medium">CSS vars encontradas: </span>
                <span>{Object.keys(extracted.custom_properties).length}</span>
              </div>
            )}
          </div>

          {mappedCount > 0 ? (
            <>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-xs">
                <p className="font-semibold text-blue-800 mb-2">
                  {mappedCount} token{mappedCount > 1 ? 's' : ''} mapeado{mappedCount > 1 ? 's' : ''} automaticamente
                </p>
                <ul className="space-y-1 text-blue-700">
                  {Object.entries(mapped!).map(([k, v]) => (
                    <li key={k}>
                      <span className="font-mono">{k}</span>: <span>{v}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <button
                onClick={handleApply}
                className="w-full bg-brand-secondary text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
              >
                Aplicar tokens ao design system
              </button>
            </>
          ) : (
            <p className="text-sm text-gray-500">
              Nenhum token de design system padrão encontrado. O site pode usar nomes de variáveis
              personalizados. Configure os tokens manualmente abaixo.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
