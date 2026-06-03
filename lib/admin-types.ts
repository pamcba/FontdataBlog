// Shared plain TypeScript types for admin UI.
// These mirror the Drizzle schema shapes but have no Drizzle dependency,
// keeping admin page/client files free of ORM imports.

export type Post = {
  id: number
  title: string
  slug: string
  content: string
  excerpt: string
  cover_image: string | null
  status: 'draft' | 'published'
  published_at: Date | null
  created_at: Date
  updated_at: Date
}

export type Category = {
  id: number
  name: string
  slug: string
  description: string | null
  created_at: Date
}

export type Tag = {
  id: number
  name: string
  slug: string
  created_at: Date
}
