import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/drizzle/db'
import { sourceCrawlerItems } from '@/drizzle/schema'
import { eq, desc } from 'drizzle-orm'

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const crawlerId = parseInt(params.id, 10)
  const items = await db
    .select()
    .from(sourceCrawlerItems)
    .where(eq(sourceCrawlerItems.crawler_id, crawlerId))
    .orderBy(desc(sourceCrawlerItems.processed_at))
    .limit(50)
  return NextResponse.json({ items })
}
