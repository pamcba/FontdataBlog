'use client'

import { useState } from 'react'
import type { SiteSettings, ThemeColors } from '@/lib/settings'

interface Props {
  initial: SiteSettings
}

const TEMPLATE_OPTIONS = [
  {
    id: 'default',
    name: 'Default',
    description: 'Layout limpo com sidebar de categorias e grid de posts',
    preview: (
      <svg viewBox="0 0 240 160" className="w-full" xmlns="http://www.w3.org/2000/svg">
        {/* Header */}
        <rect x="0" y="0" width="240" height="24" fill="#1A4FA0" rx="4" />
        <rect x="8" y="8" width="60" height="8" fill="white" rx="2" />
        <rect x="160" y="8" width="72" height="8" fill="white" opacity="0.5" rx="2" />
        {/* Sidebar */}
        <rect x="0" y="28" width="56" height="132" fill="#f3f4f6" rx="2" />
        <rect x="4" y="36" width="48" height="6" fill="#d1d5db" rx="1" />
        <rect x="4" y="46" width="40" height="4" fill="#d1d5db" rx="1" />
        <rect x="4" y="54" width="44" height="4" fill="#d1d5db" rx="1" />
        <rect x="4" y="62" width="36" height="4" fill="#d1d5db" rx="1" />
        {/* Post cards */}
        <rect x="62" y="28" width="56" height="70" fill="white" rx="3" />
        <rect x="62" y="28" width="56" height="32" fill="#e5e7eb" rx="3" />
        <rect x="66" y="64" width="48" height="5" fill="#d1d5db" rx="1" />
        <rect x="66" y="72" width="40" height="4" fill="#e5e7eb" rx="1" />
        <rect x="124" y="28" width="56" height="70" fill="white" rx="3" />
        <rect x="124" y="28" width="56" height="32" fill="#e5e7eb" rx="3" />
        <rect x="128" y="64" width="48" height="5" fill="#d1d5db" rx="1" />
        <rect x="128" y="72" width="40" height="4" fill="#e5e7eb" rx="1" />
        <rect x="184" y="28" width="56" height="70" fill="white" rx="3" />
        <rect x="184" y="28" width="56" height="32" fill="#e5e7eb" rx="3" />
        <rect x="188" y="64" width="48" height="5" fill="#d1d5db" rx="1" />
        <rect x="188" y="72" width="40" height="4" fill="#e5e7eb" rx="1" />
        {/* Footer */}
        <rect x="0" y="148" width="240" height="12" fill="#1A4FA0" rx="2" />
      </svg>
    ),
  },
  {
    id: 'portal',
    name: 'Portal',
    description: 'Estilo portal de notícias com hero destacado e grade editorial',
    preview: (
      <svg viewBox="0 0 240 160" className="w-full" xmlns="http://www.w3.org/2000/svg">
        {/* Header row 1 */}
        <rect x="0" y="0" width="240" height="18" fill="#CC0000" rx="4" />
        <rect x="8" y="5" width="60" height="8" fill="white" rx="2" />
        <rect x="160" y="5" width="72" height="8" fill="white" opacity="0.5" rx="2" />
        {/* Header row 2 - category nav */}
        <rect x="0" y="18" width="240" height="12" fill="#AA0000" />
        <rect x="8" y="21" width="20" height="5" fill="white" opacity="0.7" rx="1" />
        <rect x="34" y="21" width="24" height="5" fill="white" opacity="0.5" rx="1" />
        <rect x="64" y="21" width="28" height="5" fill="white" opacity="0.5" rx="1" />
        <rect x="98" y="21" width="20" height="5" fill="white" opacity="0.5" rx="1" />
        {/* Hero */}
        <rect x="0" y="30" width="240" height="52" fill="#555" rx="3" />
        <rect x="0" y="58" width="240" height="24" fill="black" opacity="0.5" />
        <rect x="8" y="56" width="40" height="5" fill="#FF6600" rx="1" />
        <rect x="8" y="64" width="180" height="7" fill="white" rx="2" />
        <rect x="8" y="74" width="120" height="4" fill="white" opacity="0.6" rx="1" />
        {/* Editorial grid */}
        <rect x="0" y="86" width="152" height="62" fill="white" rx="2" />
        <rect x="0" y="86" width="152" height="3" fill="#FF6600" rx="2" />
        <rect x="0" y="86" width="152" height="28" fill="#e5e7eb" rx="2" />
        <rect x="4" y="118" width="144" height="7" fill="#d1d5db" rx="1" />
        <rect x="4" y="128" width="100" height="5" fill="#e5e7eb" rx="1" />
        <rect x="156" y="86" width="84" height="28" fill="white" rx="2" />
        <rect x="156" y="86" width="84" height="3" fill="#FF6600" />
        <rect x="160" y="92" width="76" height="5" fill="#d1d5db" rx="1" />
        <rect x="156" y="118" width="84" height="28" fill="white" rx="2" />
        <rect x="156" y="118" width="84" height="3" fill="#FF6600" />
        <rect x="160" y="124" width="76" height="5" fill="#d1d5db" rx="1" />
        {/* Footer */}
        <rect x="0" y="150" width="240" height="10" fill="#CC0000" rx="2" />
      </svg>
    ),
  },
]

const COLOR_LABELS: { key: keyof ThemeColors; label: string }[] = [
  { key: 'primary', label: 'Cor primária (header, botões, links)' },
  { key: 'secondary', label: 'Cor de destaque (badges, acentos)' },
  { key: 'background', label: 'Fundo da página' },
  { key: 'surface', label: 'Fundo dos cards' },
]

const DEFAULT_COLORS: Record<string, ThemeColors> = {
  default: { primary: '#1A4FA0', secondary: '#F58A2D', background: '#F9FAFB', surface: '#FFFFFF' },
  portal: { primary: '#CC0000', secondary: '#FF6600', background: '#F5F5F5', surface: '#FFFFFF' },
}

export function ApparenceClient({ initial }: Props) {
  const [template, setTemplate] = useState(initial.template)
  const [colors, setColors] = useState<ThemeColors>(initial.colors)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null)

  function handleTemplateChange(id: string) {
    setTemplate(id)
    setColors(DEFAULT_COLORS[id] ?? DEFAULT_COLORS.default)
  }

  function handleColorChange(key: keyof ThemeColors, value: string) {
    setColors((prev) => ({ ...prev, [key]: value }))
  }

  function handleReset(key: keyof ThemeColors) {
    setColors((prev) => ({
      ...prev,
      [key]: (DEFAULT_COLORS[template] ?? DEFAULT_COLORS.default)[key],
    }))
  }

  async function handleSave() {
    setSaving(true)
    setToast(null)
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template, colors }),
      })
      if (!res.ok) throw new Error('Falha ao salvar')
      setToast({ type: 'success', msg: 'Configurações salvas! Recarregue a página para ver o novo tema.' })
    } catch {
      setToast({ type: 'error', msg: 'Erro ao salvar configurações.' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold text-neutral-900">Aparência</h1>
        <button
          onClick={handleSave}
          disabled={saving}
          className="bg-brand-primary text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-brand-primary-dark transition-colors disabled:opacity-50"
        >
          {saving ? 'Salvando...' : 'Salvar alterações'}
        </button>
      </div>

      {toast && (
        <div
          className={`mb-6 px-4 py-3 rounded-lg text-sm ${
            toast.type === 'success'
              ? 'bg-green-50 text-green-800 border border-green-200'
              : 'bg-red-50 text-red-800 border border-red-200'
          }`}
        >
          {toast.msg}
        </div>
      )}

      {/* Template selector */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold text-neutral-900 mb-4">Template</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {TEMPLATE_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              onClick={() => handleTemplateChange(opt.id)}
              className={`relative text-left rounded-xl border-2 p-4 transition-all ${
                template === opt.id
                  ? 'border-brand-primary bg-brand-primary-light'
                  : 'border-gray-200 bg-white hover:border-gray-300'
              }`}
            >
              {template === opt.id && (
                <span className="absolute top-3 right-3 bg-brand-primary text-white text-xs px-2 py-0.5 rounded-full">
                  Ativo
                </span>
              )}
              <div className="mb-3 rounded overflow-hidden border border-gray-100 max-h-32">
                {opt.preview}
              </div>
              <p className="font-semibold text-neutral-900">{opt.name}</p>
              <p className="text-sm text-gray-500 mt-0.5">{opt.description}</p>
            </button>
          ))}
        </div>
      </section>

      {/* Color customizer */}
      <section>
        <h2 className="text-lg font-semibold text-neutral-900 mb-4">Cores</h2>
        <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
          {COLOR_LABELS.map(({ key, label }) => (
            <div key={key} className="flex items-center justify-between px-5 py-4 gap-4">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-neutral-900">{label}</p>
                <p className="text-xs text-gray-400 font-mono mt-0.5">{colors[key]}</p>
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={colors[key]}
                  onChange={(e) => handleColorChange(key, e.target.value)}
                  className="w-10 h-10 rounded cursor-pointer border border-gray-200"
                />
                <input
                  type="text"
                  value={colors[key]}
                  onChange={(e) => {
                    const v = e.target.value
                    if (/^#[0-9A-Fa-f]{0,6}$/.test(v)) handleColorChange(key, v)
                  }}
                  className="w-24 text-sm font-mono border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-primary"
                />
                <button
                  onClick={() => handleReset(key)}
                  className="text-xs text-gray-400 hover:text-brand-primary transition-colors"
                  title="Restaurar padrão"
                >
                  Padrão
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
