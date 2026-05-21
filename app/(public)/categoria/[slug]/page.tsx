import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import Link from 'next/link'
import { PostGrid } from '@/components/blog/PostGrid'
import { getAppUrl } from '@/lib/app-url'

async function getData(slug: string, page: string) {
  const [postsRes, catsRes] = await Promise.all([
    fetch(`${getAppUrl()}/api/posts?category=${slug}&page=${page}&limit=9`, { cache: 'no-store' }),
    fetch(`${getAppUrl()}/api/categories`, { next: { revalidate: 300 } }),
  ])
  const postsData = postsRes.ok ? await postsRes.json() : { posts: [] }
  const catsData = catsRes.ok ? await catsRes.json() : { categories: [] }
  const category = catsData.categories.find((c: { slug: string }) => c.slug === slug)
  return { postsData, category }
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const { category } = await getData(params.slug, '1')
  return { title: category ? `Categoria: ${category.name}` : 'Categoria não encontrada' }
}

export default async function CategoryPage({
  params,
  searchParams,
}: {
  params: { slug: string }
  searchParams: { page?: string }
}) {
  const { postsData, category } = await getData(params.slug, searchParams.page ?? '1')
  if (!category) notFound()

  return (
    <div>
      <Link href="/" className="text-brand-primary text-sm hover:underline mb-4 inline-block">← Blog</Link>
      <h1 className="text-2xl font-bold text-neutral-900 mb-2">Categoria: {category.name}</h1>
      {category.description && <p className="text-gray-500 mb-6">{category.description}</p>}
      <PostGrid posts={postsData.posts} />
    </div>
  )
}
