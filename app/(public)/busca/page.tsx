import type { Metadata } from 'next'
import Link from 'next/link'
import { PostGrid } from '@/components/blog/PostGrid'
import { SearchBar } from '@/components/blog/SearchBar'
import { getAppUrl } from '@/lib/app-url'

export const metadata: Metadata = { title: 'Busca' }

async function search(q: string) {
  if (!q.trim()) return { posts: [] }
  const res = await fetch(
    `${getAppUrl()}/api/posts?search=${encodeURIComponent(q)}&limit=20`,
    { cache: 'no-store' }
  )
  if (!res.ok) return { posts: [] }
  return res.json()
}

export default async function BuscaPage({ searchParams }: { searchParams: { q?: string } }) {
  const q = searchParams.q ?? ''
  const { posts } = await search(q)

  return (
    <div>
      <Link href="/" className="text-brand-primary text-sm hover:underline mb-4 inline-block">← Blog</Link>
      <h1 className="text-2xl font-bold text-neutral-900 mb-2">Busca</h1>

      <div className="max-w-md mb-6">
        <SearchBar initialValue={q} />
      </div>

      {q && (
        <p className="text-gray-500 mb-6">
          {posts.length > 0
            ? `${posts.length} resultado(s) para "${q}"`
            : `Nenhum resultado para "${q}"`}
        </p>
      )}

      <PostGrid posts={posts} />
    </div>
  )
}
