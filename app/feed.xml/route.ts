import { db } from '@/drizzle/db'
import { posts, categories, tags, postCategories, postTags } from '@/drizzle/schema'
import { eq, and, inArray, sql, desc } from 'drizzle-orm'
import { getSettings } from '@/lib/settings'
import { getAppUrl } from '@/lib/app-url'

export const dynamic = 'force-dynamic'

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

export async function GET() {
  try {
    const baseUrl = getAppUrl()
    const { company } = await getSettings()
    const blogName = company.blog_name || process.env.NEXT_PUBLIC_BLOG_NAME || 'Blog'
    const blogDescription = company.blog_description || `${blogName} - Feed RSS`

    const postRows = await db
      .select()
      .from(posts)
      .where(eq(posts.status, 'published'))
      .orderBy(desc(posts.published_at))
      .limit(50)

    const ids = postRows.map((p) => p.id)

    let allPostCats: { post_id: number; category: typeof categories.$inferSelect }[] = []
    let allPostTags: { post_id: number; tag: typeof tags.$inferSelect }[] = []

    if (ids.length > 0) {
      allPostCats = await db
        .select({ post_id: postCategories.post_id, category: categories })
        .from(postCategories)
        .innerJoin(categories, eq(postCategories.category_id, categories.id))
        .where(inArray(postCategories.post_id, ids))

      allPostTags = await db
        .select({ post_id: postTags.post_id, tag: tags })
        .from(postTags)
        .innerJoin(tags, eq(postTags.tag_id, tags.id))
        .where(inArray(postTags.post_id, ids))
    }

    const items = postRows.map((post) => {
      const postCats = allPostCats
        .filter((r) => r.post_id === post.id)
        .map((r) => r.category.name)
      const postTagsList = allPostTags
        .filter((r) => r.post_id === post.id)
        .map((r) => r.tag.name)

      const pubDate = post.published_at
        ? new Date(post.published_at).toUTCString()
        : new Date(post.created_at).toUTCString()

      const description = post.excerpt || post.content.replace(/<[^>]*>/g, '').slice(0, 300)

      return [
        '    <item>',
        `      <title>${escapeXml(post.title)}</title>`,
        `      <link>${escapeXml(`${baseUrl}/${post.slug}`)}</link>`,
        `      <guid isPermaLink="true">${escapeXml(`${baseUrl}/${post.slug}`)}</guid>`,
        `      <description>${escapeXml(description)}</description>`,
        `      <pubDate>${escapeXml(pubDate)}</pubDate>`,
        post.cover_image ? `      <enclosure url="${escapeXml(post.cover_image)}" type="image/jpeg" length="0"/>` : null,
        ...postCats.map((c) => `      <category>${escapeXml(c)}</category>`),
        ...postTagsList.map((t) => `      <category>${escapeXml(t)}</category>`),
        '      <content:encoded><![CDATA[' + post.content + ']]></content:encoded>',
        '    </item>',
      ]
        .filter(Boolean)
        .join('\n')
    })

    const xml = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<rss version="2.0"',
      '  xmlns:content="http://purl.org/rss/1.0/modules/content/"',
      '  xmlns:atom="http://www.w3.org/2005/Atom">',
      '  <channel>',
      `    <title>${escapeXml(blogName)}</title>`,
      `    <link>${escapeXml(baseUrl)}</link>`,
      `    <description>${escapeXml(blogDescription)}</description>`,
      `    <language>pt-BR</language>`,
      `    <lastBuildDate>${escapeXml(new Date().toUTCString())}</lastBuildDate>`,
      `    <atom:link href="${escapeXml(`${baseUrl}/feed.xml`)}" rel="self" type="application/rss+xml"/>`,
      ...items,
      '  </channel>',
      '</rss>',
    ].join('\n')

    return new Response(xml, {
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=300',
      },
    })
  } catch (err) {
    console.error('[/feed.xml]', err)
    return new Response('Error generating RSS feed', { status: 500 })
  }
}
