import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import Link from 'next/link'
import { PostGrid } from '@/components/blog/PostGrid'
import { getAppUrl } from '@/lib/app-url'

async function getData(slug: string, page: string) {
  const [postsRes, tagsRes] = await Promise.all([
    fetch(`${getAppUrl()}/api/posts?tag=${slug}&page=${page}&limit=9`, { cache: 'no-store' }),
    fetch(`${getAppUrl()}/api/tags`, { next: { revalidate: 300 } }),
  ])
  const postsData = postsRes.ok ? await postsRes.json() : { posts: [] }
  const tagsData = tagsRes.ok ? await tagsRes.json() : { tags: [] }
  const tag = tagsData.tags.find((t: { slug: string }) => t.slug === slug)
  return { postsData, tag }
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const { tag } = await getData(params.slug, '1')
  return { title: tag ? `Tag: ${tag.name}` : 'Tag não encontrada' }
}

export default async function TagPage({
  params,
  searchParams,
}: {
  params: { slug: string }
  searchParams: { page?: string }
}) {
  const { postsData, tag } = await getData(params.slug, searchParams.page ?? '1')
  if (!tag) notFound()

  return (
    <div>
      <Link href="/" className="text-brand-primary text-sm hover:underline mb-4 inline-block">← Blog</Link>
      <h1 className="text-2xl font-bold text-neutral-900 mb-6">Tag: {tag.name}</h1>
      <PostGrid posts={postsData.posts} />
    </div>
  )
}
