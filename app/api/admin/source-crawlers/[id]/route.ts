import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/drizzle/db'
import { sourceCrawlers } from '@/drizzle/schema'
import { eq } from 'drizzle-orm'
import { runSingleCrawler } from '@/lib/source-crawlers/runner'

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const id = parseInt(params.id, 10)
  const body = await request.json() as Partial<{
    name: string
    type: string
    url: string
    prompt: string
    interval_hours: number
    enabled: boolean
    publish_status: string
  }>

  const [updated] = await db.update(sourceCrawlers)
    .set({ ...body, updated_at: new Date() })
    .where(eq(sourceCrawlers.id, id))
    .returning()

  if (!updated) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })
  return NextResponse.json({ crawler: updated })
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const id = parseInt(params.id, 10)
  await db.delete(sourceCrawlers).where(eq(sourceCrawlers.id, id))
  return NextResponse.json({ ok: true })
}

export async function POST(_: NextRequest, { params }: { params: { id: string } }) {
  const id = parseInt(params.id, 10)
  try {
    const result = await runSingleCrawler(id)
    return NextResponse.json({ ok: true, result })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
