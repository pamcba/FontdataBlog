'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

type LogStatus = 'running' | 'success' | 'skipped' | 'error'
type TriggeredBy = 'schedule' | 'manual'

interface AutomationLog {
  id: number
  triggered_by: TriggeredBy | string
  status: LogStatus | string
  message: string | null
  post_id: number | null
  error: string | null
  duration_ms: number | null
  started_at: string | null
  finished_at: string | null
}

function statusBadge(status: string) {
  switch (status) {
    case 'running':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
          Em execução
        </span>
      )
    case 'success':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
          Sucesso
        </span>
      )
    case 'skipped':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
          Ignorado
        </span>
      )
    case 'error':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
          Erro
        </span>
      )
    default:
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
          {status}
        </span>
      )
  }
}

function formatTriggeredBy(value: string) {
  if (value === 'schedule') return 'Automático'
  if (value === 'manual') return 'Manual'
  return value
}

function formatDuration(ms: number | null) {
  if (ms === null) return '—'
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function formatDatetime(value: string | null) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(value))
}

export default function LogsSection() {
  const [logs, setLogs] = useState<AutomationLog[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function fetchLogs() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/automation/logs?limit=50')
      if (!res.ok) {
        const data = await res.json()
        setError(data.error ?? 'Erro ao carregar logs')
        return
      }
      const data = await res.json()
      setLogs(data.logs ?? [])
    } catch {
      setError('Erro ao carregar logs')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchLogs()
  }, [])

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-base font-semibold text-neutral-900">Logs de Geração</h2>
          <p className="text-sm text-gray-500 mt-0.5">Histórico das execuções automáticas e manuais</p>
        </div>
        <button
          onClick={fetchLogs}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <svg
            width="17"
            height="17"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="23 4 23 10 17 10" />
            <polyline points="1 20 1 14 7 14" />
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
          </svg>
          Atualizar
        </button>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-12 text-gray-400">
          <svg
            className="animate-spin mr-2"
            width="17"
            height="17"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
          <span className="text-sm">Carregando logs...</span>
        </div>
      )}

      {!loading && error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {!loading && !error && logs.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-gray-400">
          <svg
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="mb-3"
          >
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
            <polyline points="10 9 9 9 8 9" />
          </svg>
          <span className="text-sm">Nenhum log encontrado</span>
        </div>
      )}

      {!loading && !error && logs.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left pb-3 pr-4 font-medium text-gray-500 whitespace-nowrap">Status</th>
                <th className="text-left pb-3 pr-4 font-medium text-gray-500 whitespace-nowrap">Data/Hora</th>
                <th className="text-left pb-3 pr-4 font-medium text-gray-500 whitespace-nowrap">Disparado por</th>
                <th className="text-left pb-3 pr-4 font-medium text-gray-500 whitespace-nowrap">Duração</th>
                <th className="text-left pb-3 pr-4 font-medium text-gray-500">Mensagem / Erro</th>
                <th className="text-left pb-3 font-medium text-gray-500 whitespace-nowrap">Artigo gerado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {logs.map((log) => (
                <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                  <td className="py-3 pr-4 whitespace-nowrap">{statusBadge(log.status)}</td>
                  <td className="py-3 pr-4 whitespace-nowrap text-gray-600 font-mono text-xs">
                    {formatDatetime(log.started_at)}
                  </td>
                  <td className="py-3 pr-4 whitespace-nowrap text-gray-700">
                    {formatTriggeredBy(log.triggered_by)}
                  </td>
                  <td className="py-3 pr-4 whitespace-nowrap text-gray-600 font-mono text-xs">
                    {formatDuration(log.duration_ms)}
                  </td>
                  <td className="py-3 pr-4 max-w-xs">
                    {log.error ? (
                      <span className="text-red-600 break-words">{log.error}</span>
                    ) : log.message ? (
                      <span className="text-gray-700 break-words">{log.message}</span>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="py-3 whitespace-nowrap">
                    {log.post_id ? (
                      <Link
                        href={`/admin/artigos/${log.post_id}`}
                        className="inline-flex items-center gap-1 text-brand-primary hover:underline text-xs font-medium"
                      >
                        #{log.post_id}
                        <svg
                          width="12"
                          height="12"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.75"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 0 2 2h6" />
                          <polyline points="15 3 21 3 21 9" />
                          <line x1="10" y1="14" x2="21" y2="3" />
                        </svg>
                      </Link>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
