'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import type { CompanyInfo } from '@/lib/settings'

interface Props {
  initial: CompanyInfo
}

type CompanyKey = keyof CompanyInfo

const SECTIONS: { title: string; fields: { key: CompanyKey; label: string; type?: string; placeholder?: string; multiline?: boolean }[] }[] = [
  {
    title: 'Blog',
    fields: [
      { key: 'blog_name', label: 'Nome do Blog', placeholder: 'Ex: MMA Sistemas Blog' },
      { key: 'blog_description', label: 'Descrição do Blog', placeholder: 'Uma breve descrição sobre o blog...', multiline: true },
    ],
  },
  {
    title: 'Dados da Empresa',
    fields: [
      { key: 'company_name', label: 'Nome da Empresa', placeholder: 'Ex: MMA Sistemas Ltda' },
      { key: 'company_cnpj', label: 'CNPJ', placeholder: '00.000.000/0001-00' },
      { key: 'company_email', label: 'E-mail de Contato', type: 'email', placeholder: 'contato@empresa.com.br' },
      { key: 'company_phone', label: 'Telefone', placeholder: '(00) 00000-0000' },
      { key: 'company_address', label: 'Endereço', placeholder: 'Rua Exemplo, 123 - Cidade/UF', multiline: true },
    ],
  },
  {
    title: 'Redes Sociais',
    fields: [
      { key: 'social_facebook', label: 'Facebook', placeholder: 'https://facebook.com/suaempresa' },
      { key: 'social_instagram', label: 'Instagram', placeholder: 'https://instagram.com/suaempresa' },
      { key: 'social_twitter', label: 'Twitter / X', placeholder: 'https://x.com/suaempresa' },
      { key: 'social_youtube', label: 'YouTube', placeholder: 'https://youtube.com/@seucanal' },
    ],
  },
]

export function ConfiguracoesClient({ initial }: Props) {
  const [company, setCompany] = useState<CompanyInfo>(initial)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null)

  function handleChange(key: CompanyKey, value: string) {
    setCompany((prev) => ({ ...prev, [key]: value }))
  }

  async function handleSave() {
    setSaving(true)
    setToast(null)
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? 'Falha ao salvar')
      }
      setToast({ type: 'success', msg: 'Configurações salvas com sucesso!' })
    } catch (err) {
      setToast({ type: 'error', msg: err instanceof Error ? err.message : 'Erro ao salvar configurações.' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold text-neutral-900">Configurações</h1>
        <Button onClick={handleSave} loading={saving}>
          Salvar alterações
        </Button>
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

      <div className="space-y-8">
        {SECTIONS.map((section) => (
          <section key={section.title} className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-neutral-900 mb-5">{section.title}</h2>
            <div className="space-y-4">
              {section.fields.map((field) => (
                <div key={field.key}>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {field.label}
                  </label>
                  {field.multiline ? (
                    <textarea
                      value={company[field.key]}
                      onChange={(e) => handleChange(field.key, e.target.value)}
                      placeholder={field.placeholder}
                      rows={3}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary resize-none"
                    />
                  ) : (
                    <input
                      type={field.type ?? 'text'}
                      value={company[field.key]}
                      onChange={(e) => handleChange(field.key, e.target.value)}
                      placeholder={field.placeholder}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary"
                    />
                  )}
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      <div className="mt-8 flex justify-end">
        <Button onClick={handleSave} loading={saving}>
          Salvar alterações
        </Button>
      </div>
    </div>
  )
}
