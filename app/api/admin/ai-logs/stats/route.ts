import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/drizzle/db'
import { aiRequestLogs } from '@/drizzle/schema'
import { sql, gte } from 'drizzle-orm'

export const dynamic = 'force-dynamic'

function getPeriodStart(period: string): Date | null {
  const now = new Date()
  switch (period) {
    case 'today': {
      const d = new Date(now)
      d.setHours(0, 0, 0, 0)
      return d
    }
    case '7d': {
      const d = new Date(now)
      d.setDate(d.getDate() - 7)
      return d
    }
    case '30d': {
      const d = new Date(now)
      d.setDate(d.getDate() - 30)
      return d
    }
    default:
      return null
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl
    const period = searchParams.get('period') ?? '7d'
    const periodStart = getPeriodStart(period)

    const whereClause = periodStart
      ? gte(aiRequestLogs.created_at, periodStart)
      : undefined

    // Totais gerais
    const [totals] = await db
      .select({
        total_requests: sql<number>`count(*)::int`,
        total_tokens: sql<number>`coalesce(sum(${aiRequestLogs.total_tokens}), 0)::int`,
        total_cost_usd: sql<number>`coalesce(sum(${aiRequestLogs.cost_usd}), 0)`,
        total_cost_brl: sql<number | null>`sum(${aiRequestLogs.cost_brl})`,
        success_count: sql<number>`count(*) filter (where ${aiRequestLogs.status} = 'success')::int`,
        error_count: sql<number>`count(*) filter (where ${aiRequestLogs.status} = 'error')::int`,
        avg_duration_ms: sql<number>`coalesce(avg(${aiRequestLogs.duration_ms}), 0)`,
      })
      .from(aiRequestLogs)
      .where(whereClause)

    // Por feature
    const byFeature = await db
      .select({
        feature: aiRequestLogs.feature,
        request_count: sql<number>`count(*)::int`,
        total_tokens: sql<number>`coalesce(sum(${aiRequestLogs.total_tokens}), 0)::int`,
        total_cost_usd: sql<number>`coalesce(sum(${aiRequestLogs.cost_usd}), 0)`,
        total_cost_brl: sql<number | null>`sum(${aiRequestLogs.cost_brl})`,
      })
      .from(aiRequestLogs)
      .where(whereClause)
      .groupBy(aiRequestLogs.feature)
      .orderBy(sql`count(*) desc`)

    // Por modelo
    const byModel = await db
      .select({
        model: aiRequestLogs.model,
        request_count: sql<number>`count(*)::int`,
        total_tokens: sql<number>`coalesce(sum(${aiRequestLogs.total_tokens}), 0)::int`,
        total_cost_usd: sql<number>`coalesce(sum(${aiRequestLogs.cost_usd}), 0)`,
        total_cost_brl: sql<number | null>`sum(${aiRequestLogs.cost_brl})`,
      })
      .from(aiRequestLogs)
      .where(whereClause)
      .groupBy(aiRequestLogs.model)
      .orderBy(sql`count(*) desc`)

    return NextResponse.json({
      period,
      totals,
      by_feature: byFeature,
      by_model: byModel,
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erro ao buscar estatísticas de IA' },
      { status: 500 }
    )
  }
}
