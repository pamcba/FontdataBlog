import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import Link from 'next/link'
import { Badge } from '@/components/ui/Badge'
import { getAppUrl } from '@/lib/app-url'

async function getPost(slug: string) {
  const res = await fetch(
    `${getAppUrl()}/api/posts/${slug}`,
    { cache: 'no-store' }
  )
  if (res.status === 404) return null
  if (!res.ok) return null
  const data = await res.json()
  return data.post
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const post = await getPost(params.slug)
  if (!post) return { title: 'Artigo não encontrado' }

  return {
    title: post.title,
    description: post.excerpt,
    alternates: {
      canonical: `${getAppUrl()}/${post.slug}`,
    },
    openGraph: {
      title: post.title,
      description: post.excerpt,
      images: post.cover_image ? [{ url: post.cover_image }] : [],
      type: 'article',
    },
  }
}

function formatDate(date: string | null) {
  if (!date) return ''
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }).format(new Date(date))
}

export default async function PostPage({ params }: { params: { slug: string } }) {
  const post = await getPost(params.slug)
  if (!post) notFound()

  return (
    <article className="max-w-3xl mx-auto">
      <Link href="/" className="text-brand-primary text-sm hover:underline mb-6 inline-block">
        ← Voltar ao Blog
      </Link>

      {post.cover_image && (
        <div className="aspect-video rounded-xl overflow-hidden mb-8">
          <img
            src={post.cover_image}
            alt={post.title}
            className="w-full h-full object-cover"
          />
        </div>
      )}

      <header className="mb-8">
        <div className="flex flex-wrap gap-2 mb-3">
          {post.categories?.map((cat: { id: number; name: string; slug: string }) => (
            <Link key={cat.id} href={`/categoria/${cat.slug}`}>
              <Badge variant="category">{cat.name}</Badge>
            </Link>
          ))}
        </div>

        <h1 className="text-3xl md:text-4xl font-bold font-serif text-neutral-900 leading-tight mb-3">
          {post.title}
        </h1>

        <div className="flex flex-wrap items-center gap-3 text-sm text-gray-500">
          {post.published_at && <time>{formatDate(post.published_at)}</time>}
          {post.tags?.map((tag: { id: number; name: string; slug: string }) => (
            <Link key={tag.id} href={`/tag/${tag.slug}`}>
              <Badge variant="tag">{tag.name}</Badge>
            </Link>
          ))}
        </div>
      </header>

      <div
        className="prose max-w-none"
        dangerouslySetInnerHTML={{ __html: post.content }}
      />
    </article>
  )
}
