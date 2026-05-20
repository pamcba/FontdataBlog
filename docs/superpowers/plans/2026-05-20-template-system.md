# Template System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a two-template system (Default + Portal) with per-template color customization, controlled from a new `/admin/aparencia` page.

**Architecture:** A `site_settings` DB table stores the active template name and color overrides as JSON. A `lib/settings.ts` helper (wrapped in React `cache()`) reads settings once per request. `app/layout.tsx` injects CSS custom properties server-side so colors apply globally without flicker. The Portal template replaces the header and home-page grid with editorial-style components.

**Tech Stack:** Next.js 14 App Router · Drizzle ORM · PostgreSQL (Supabase) · Tailwind CSS · CSS custom properties · React `cache()`

---

## File Map

| File | Action |
|------|--------|
| `drizzle/schema.ts` | Add `siteSettings` table |
| `drizzle/migrations/` | Generated migration (auto) |
| `lib/settings.ts` | New — `getSettings()`, `defaultColors()`, `SiteSettings` type |
| `app/globals.css` | Add CSS custom property defaults |
| `app/layout.tsx` | Fetch settings, inject `<style>` override + `data-template` on body |
| `app/api/settings/route.ts` | New — public GET settings |
| `app/api/admin/settings/route.ts` | New — admin GET + PUT settings |
| `components/layout/PortalHeader.tsx` | New — two-row portal header with category nav |
| `components/blog/HeroPost.tsx` | New — full-width hero article for Portal home |
| `components/blog/PostCardPortal.tsx` | New — compact card with accent bar for Portal |
| `components/blog/EditorialGrid.tsx` | New — editorial grid layout for Portal |
| `app/(public)/layout.tsx` | Switch between Header and PortalHeader based on template |
| `app/(public)/page.tsx` | Switch between Default grid+sidebar and Portal editorial layout |
| `app/admin/aparencia/page.tsx` | New — server wrapper that loads settings + renders client component |
| `app/admin/aparencia/ApparenceClient.tsx` | New — interactive template selector + color pickers |
| `app/admin/layout.tsx` | Add Aparência nav item |

---

## Task 1: Add `site_settings` table to schema

**Files:**
- Modify: `drizzle/schema.ts`

- [ ] **Step 1: Add the table definition**

Open `drizzle/schema.ts` and add at the bottom, after the existing table definitions and before the type exports:

```ts
export const siteSettings = pgTable('site_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updated_at: timestamp('updated_at').notNull().default(sql`now()`),
})

export type SiteSetting = typeof siteSettings.$inferSelect
```

- [ ] **Step 2: Generate migration**

```bash
npm run db:generate
```

Expected: a new file in `drizzle/migrations/` with `CREATE TABLE "site_settings"`.

- [ ] **Step 3: Apply migration**

```bash
npm run db:migrate
```

Expected: `Migrations applied successfully` (or similar success message with no errors).

- [ ] **Step 4: Commit**

```bash
git add drizzle/schema.ts drizzle/migrations/
git commit -m "feat: add site_settings table for template configuration"
```

---

## Task 2: Create `lib/settings.ts`

**Files:**
- Create: `lib/settings.ts`

- [ ] **Step 1: Create the file**

Create `lib/settings.ts` with the full contents below:

```ts
import { cache } from 'react'
import { db } from '@/drizzle/db'
import { siteSettings } from '@/drizzle/schema'

export interface ThemeColors {
  primary: string
  secondary: string
  background: string
  surface: string
}

export interface SiteSettings {
  template: string
  colors: ThemeColors
}

const COLOR_DEFAULTS: Record<string, ThemeColors> = {
  default: {
    primary: '#1A4FA0',
    secondary: '#F58A2D',
    background: '#F9FAFB',
    surface: '#FFFFFF',
  },
  portal: {
    primary: '#CC0000',
    secondary: '#FF6600',
    background: '#F5F5F5',
    surface: '#FFFFFF',
  },
}

export function defaultColors(template: string): ThemeColors {
  return COLOR_DEFAULTS[template] ?? COLOR_DEFAULTS.default
}

export const getSettings = cache(async (): Promise<SiteSettings> => {
  try {
    const rows = await db.select().from(siteSettings)
    const map = Object.fromEntries(rows.map((r) => [r.key, r.value]))

    const template = map['active_template'] ?? 'default'
    const storedColors = map['theme_colors'] ? (JSON.parse(map['theme_colors']) as Partial<ThemeColors>) : {}
    const colors: ThemeColors = { ...defaultColors(template), ...storedColors }

    return { template, colors }
  } catch {
    return { template: 'default', colors: defaultColors('default') }
  }
})
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors related to `lib/settings.ts`.

- [ ] **Step 3: Commit**

```bash
git add lib/settings.ts
git commit -m "feat: add settings helper with getSettings() and defaultColors()"
```

---

## Task 3: Add CSS custom properties to `globals.css` and inject overrides in `app/layout.tsx`

**Files:**
- Modify: `app/globals.css`
- Modify: `app/layout.tsx`

- [ ] **Step 1: Add CSS custom property defaults to `globals.css`**

In `app/globals.css`, the `:root` block currently has `--color-brand-primary` etc. Add the theme variables below the existing `:root` block:

```css
:root {
  --color-primary: #1A4FA0;
  --color-secondary: #F58A2D;
  --color-bg: #F9FAFB;
  --color-surface: #FFFFFF;
}
```

Add this block right after the existing `:root { ... }` block (do not replace it — keep both).

- [ ] **Step 2: Replace `app/layout.tsx` with settings-injecting version**

```tsx
import type { Metadata } from 'next'
import './globals.css'
import { getSettings } from '@/lib/settings'

export const metadata: Metadata = {
  title: {
    template: '%s | MMA Sistemas Blog',
    default: 'MMA Sistemas Blog',
  },
  description: 'Tecnologia, gestão e inovação para empresas',
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'),
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { template, colors } = await getSettings()

  const cssVars = `:root{--color-primary:${colors.primary};--color-secondary:${colors.secondary};--color-bg:${colors.background};--color-surface:${colors.surface};}`

  return (
    <html lang="pt-BR">
      <head>
        <style dangerouslySetInnerHTML={{ __html: cssVars }} />
      </head>
      <body
        className="text-neutral-900 antialiased"
        style={{ backgroundColor: 'var(--color-bg)' }}
        data-template={template}
      >
        {children}
      </body>
    </html>
  )
}
```

- [ ] **Step 3: Verify build compiles**

```bash
npm run build
```

Expected: build succeeds. The site background should now be driven by `--color-bg`.

- [ ] **Step 4: Commit**

```bash
git add app/globals.css app/layout.tsx
git commit -m "feat: inject CSS custom properties from DB settings in root layout"
```

---

## Task 4: Create public settings API and admin settings API

**Files:**
- Create: `app/api/settings/route.ts`
- Create: `app/api/admin/settings/route.ts`

- [ ] **Step 1: Create public GET `/api/settings/route.ts`**

```ts
import { NextResponse } from 'next/server'
import { getSettings } from '@/lib/settings'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const settings = await getSettings()
    return NextResponse.json(settings)
  } catch {
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}
```

- [ ] **Step 2: Create admin GET + PUT `/api/admin/settings/route.ts`**

```ts
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/drizzle/db'
import { siteSettings } from '@/drizzle/schema'
import { getSettings, defaultColors } from '@/lib/settings'

export const dynamic = 'force-dynamic'

const hexColor = z
  .string()
  .regex(/^#[0-9A-Fa-f]{6}$/, 'Cor inválida (use formato #RRGGBB)')

const putSchema = z.object({
  template: z.enum(['default', 'portal']).optional(),
  colors: z
    .object({
      primary: hexColor,
      secondary: hexColor,
      background: hexColor,
      surface: hexColor,
    })
    .optional(),
})

export async function GET() {
  try {
    const settings = await getSettings()
    return NextResponse.json(settings)
  } catch {
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json()
    const parsed = putSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Dados inválidos', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const { template, colors } = parsed.data
    const now = new Date()

    if (template !== undefined) {
      await db
        .insert(siteSettings)
        .values({ key: 'active_template', value: template, updated_at: now })
        .onConflictDoUpdate({ target: siteSettings.key, set: { value: template, updated_at: now } })
    }

    if (colors !== undefined) {
      const colorsJson = JSON.stringify(colors)
      await db
        .insert(siteSettings)
        .values({ key: 'theme_colors', value: colorsJson, updated_at: now })
        .onConflictDoUpdate({ target: siteSettings.key, set: { value: colorsJson, updated_at: now } })
    }

    const current = await getSettings()
    return NextResponse.json(current)
  } catch {
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add app/api/settings/route.ts app/api/admin/settings/route.ts
git commit -m "feat: add public and admin settings API routes"
```

---

## Task 5: Create `PortalHeader` component

**Files:**
- Create: `components/layout/PortalHeader.tsx`

- [ ] **Step 1: Create the component**

```tsx
import Link from 'next/link'
import { SearchBar } from '@/components/blog/SearchBar'
import { db } from '@/drizzle/db'
import { categories } from '@/drizzle/schema'
import { asc } from 'drizzle-orm'

async function getCategories() {
  try {
    return db.select().from(categories).orderBy(asc(categories.name))
  } catch {
    return []
  }
}

export async function PortalHeader() {
  const cats = await getCategories()

  return (
    <header style={{ backgroundColor: 'var(--color-primary)' }} className="text-white shadow-md">
      {/* Row 1: logo + search */}
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
        <Link href="/" className="text-xl font-bold tracking-tight hover:opacity-90 transition-opacity whitespace-nowrap">
          MMA Sistemas Blog
        </Link>
        <div className="w-full max-w-xs">
          <SearchBar />
        </div>
      </div>

      {/* Row 2: category navigation */}
      <div style={{ backgroundColor: 'color-mix(in srgb, var(--color-primary) 80%, black)' }} className="border-t border-white/10">
        <div className="max-w-7xl mx-auto px-4">
          <nav className="flex items-center gap-0 overflow-x-auto scrollbar-hide">
            <Link
              href="/"
              className="px-4 py-2.5 text-sm font-semibold whitespace-nowrap hover:bg-white/10 transition-colors border-b-2 border-transparent hover:border-white/50"
            >
              Início
            </Link>
            {cats.map((cat) => (
              <Link
                key={cat.id}
                href={`/categoria/${cat.slug}`}
                className="px-4 py-2.5 text-sm font-medium whitespace-nowrap hover:bg-white/10 transition-colors text-white/80 hover:text-white border-b-2 border-transparent hover:border-white/50"
              >
                {cat.name}
              </Link>
            ))}
          </nav>
        </div>
      </div>
    </header>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add components/layout/PortalHeader.tsx
git commit -m "feat: add PortalHeader with two-row layout and category navigation"
```

---

## Task 6: Create `HeroPost` component

**Files:**
- Create: `components/blog/HeroPost.tsx`

- [ ] **Step 1: Create the component**

```tsx
import Link from 'next/link'
import type { Post, Category } from '@/drizzle/schema'

interface HeroPostProps {
  post: Post & { categories: Category[] }
}

function formatDate(date: Date | null): string {
  if (!date) return ''
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }).format(new Date(date))
}

export function HeroPost({ post }: HeroPostProps) {
  return (
    <Link href={`/${post.slug}`} className="block group mb-8">
      <div className="relative w-full aspect-[21/9] min-h-[280px] rounded-xl overflow-hidden bg-gray-800">
        {post.cover_image ? (
          <img
            src={post.cover_image}
            alt={post.title}
            className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
        ) : (
          <div
            className="absolute inset-0"
            style={{ backgroundColor: 'var(--color-primary)' }}
          />
        )}

        {/* Dark gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />

        {/* Content */}
        <div className="absolute bottom-0 left-0 right-0 p-6 md:p-8">
          {post.categories.length > 0 && (
            <span
              className="inline-block text-white text-xs font-bold px-2.5 py-1 rounded mb-3 uppercase tracking-wide"
              style={{ backgroundColor: 'var(--color-secondary)' }}
            >
              {post.categories[0].name}
            </span>
          )}
          <h2 className="text-white text-2xl md:text-4xl font-bold leading-tight mb-2 group-hover:underline">
            {post.title}
          </h2>
          {post.excerpt && (
            <p className="text-white/80 text-sm md:text-base line-clamp-2 mb-3 max-w-2xl">
              {post.excerpt}
            </p>
          )}
          <div className="flex items-center gap-3 text-white/60 text-sm">
            {post.published_at && <time>{formatDate(post.published_at)}</time>}
            <span
              className="text-white text-xs font-semibold px-3 py-1 rounded-full"
              style={{ backgroundColor: 'var(--color-primary)' }}
            >
              Ler mais →
            </span>
          </div>
        </div>
      </div>
    </Link>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add components/blog/HeroPost.tsx
git commit -m "feat: add HeroPost component for portal template"
```

---

## Task 7: Create `PostCardPortal` component

**Files:**
- Create: `components/blog/PostCardPortal.tsx`

- [ ] **Step 1: Create the component**

```tsx
import Link from 'next/link'
import type { Post, Category } from '@/drizzle/schema'

interface PostCardPortalProps {
  post: Post & { categories: Category[] }
  size?: 'large' | 'small'
}

function formatDate(date: Date | null): string {
  if (!date) return ''
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(date))
}

export function PostCardPortal({ post, size = 'small' }: PostCardPortalProps) {
  const isLarge = size === 'large'

  return (
    <article
      className="bg-white rounded-lg overflow-hidden hover:shadow-md transition-shadow group border border-gray-100"
      style={{ borderTop: '4px solid var(--color-secondary)' }}
    >
      <Link href={`/${post.slug}`} className="block">
        {post.cover_image && (
          <div className={`relative overflow-hidden ${isLarge ? 'aspect-video' : 'aspect-video'}`}>
            <img
              src={post.cover_image}
              alt={post.title}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            />
          </div>
        )}
      </Link>

      <div className={`p-4 ${isLarge ? 'p-5' : ''}`}>
        {post.categories.length > 0 && (
          <span
            className="text-xs font-bold uppercase tracking-wider mb-2 block"
            style={{ color: 'var(--color-secondary)' }}
          >
            {post.categories[0].name}
          </span>
        )}

        <Link href={`/${post.slug}`}>
          <h3
            className={`font-bold leading-snug hover:underline mb-2 ${
              isLarge ? 'text-xl line-clamp-3' : 'text-base line-clamp-2'
            }`}
            style={{ color: 'var(--color-primary)' }}
          >
            {post.title}
          </h3>
        </Link>

        {isLarge && post.excerpt && (
          <p className="text-gray-500 text-sm line-clamp-2 mb-3">{post.excerpt}</p>
        )}

        {post.published_at && (
          <time className="text-xs text-gray-400">{formatDate(post.published_at)}</time>
        )}
      </div>
    </article>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add components/blog/PostCardPortal.tsx
git commit -m "feat: add PostCardPortal component with accent bar for portal template"
```

---

## Task 8: Create `EditorialGrid` component

**Files:**
- Create: `components/blog/EditorialGrid.tsx`

- [ ] **Step 1: Create the component**

```tsx
import { PostCardPortal } from './PostCardPortal'
import type { Post, Category } from '@/drizzle/schema'

interface EditorialGridProps {
  posts: (Post & { categories: Category[] })[]
}

export function EditorialGrid({ posts }: EditorialGridProps) {
  if (posts.length === 0) return null

  const [featured, ...rest] = posts
  const secondary = rest.slice(0, 3)
  const remaining = rest.slice(3)

  return (
    <div>
      {/* Featured row: 1 large + up to 3 small */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        {featured && (
          <div className="md:col-span-2">
            <PostCardPortal post={featured} size="large" />
          </div>
        )}
        {secondary.length > 0 && (
          <div className="flex flex-col gap-4">
            {secondary.map((post) => (
              <PostCardPortal key={post.id} post={post} size="small" />
            ))}
          </div>
        )}
      </div>

      {/* Remaining posts: 3-column grid */}
      {remaining.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {remaining.map((post) => (
            <PostCardPortal key={post.id} post={post} size="small" />
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add components/blog/EditorialGrid.tsx
git commit -m "feat: add EditorialGrid component with featured + secondary layout"
```

---

## Task 9: Update `app/(public)/layout.tsx` to switch headers by template

**Files:**
- Modify: `app/(public)/layout.tsx`

- [ ] **Step 1: Replace the file contents**

```tsx
import { Header } from '@/components/layout/Header'
import { PortalHeader } from '@/components/layout/PortalHeader'
import { Footer } from '@/components/layout/Footer'
import { getSettings } from '@/lib/settings'

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const { template } = await getSettings()

  return (
    <div className="min-h-screen flex flex-col">
      {template === 'portal' ? <PortalHeader /> : <Header />}
      <main
        className={`flex-1 w-full mx-auto px-4 py-8 ${
          template === 'portal' ? 'max-w-7xl' : 'max-w-6xl'
        }`}
      >
        {children}
      </main>
      <Footer />
    </div>
  )
}
```

- [ ] **Step 2: Verify build**

```bash
npm run build
```

Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add app/(public)/layout.tsx
git commit -m "feat: switch between Default and Portal header based on active template"
```

---

## Task 10: Update `app/(public)/page.tsx` to render Portal editorial layout

**Files:**
- Modify: `app/(public)/page.tsx`

- [ ] **Step 1: Replace the file contents**

```tsx
import { Suspense } from 'react'
import type { Metadata } from 'next'
import { PostGrid } from '@/components/blog/PostGrid'
import { CategoryFilter } from '@/components/blog/CategoryFilter'
import { HeroPost } from '@/components/blog/HeroPost'
import { EditorialGrid } from '@/components/blog/EditorialGrid'
import { Pagination } from '@/components/ui/Pagination'
import { getSettings } from '@/lib/settings'

export const metadata: Metadata = {
  title: 'Home',
  description: 'Tecnologia, gestão e inovação para empresas — MMA Sistemas Blog',
}

async function getPosts(searchParams: Record<string, string>) {
  const params = new URLSearchParams(searchParams)
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_APP_URL}/api/posts?${params.toString()}`,
    { cache: 'no-store' }
  )
  if (!res.ok) return { posts: [], total: 0, page: 1, pages: 1 }
  return res.json()
}

async function getCategories() {
  const res = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/categories`, {
    next: { revalidate: 300 },
  })
  if (!res.ok) return { categories: [] }
  return res.json()
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: { page?: string; category?: string; tag?: string }
}) {
  const { template } = await getSettings()

  const pageLimit = template === 'portal' ? '10' : '9'
  const [postsData, categoriesData] = await Promise.all([
    getPosts({ page: searchParams.page ?? '1', limit: pageLimit, ...searchParams }),
    getCategories(),
  ])

  if (template === 'portal') {
    const [heroPost, ...gridPosts] = postsData.posts
    return (
      <div>
        {heroPost && <HeroPost post={heroPost} />}
        <EditorialGrid posts={gridPosts} />
        <Suspense>
          <Pagination currentPage={postsData.page} totalPages={postsData.pages} />
        </Suspense>
      </div>
    )
  }

  return (
    <div className="flex gap-8">
      <div className="flex-1 min-w-0">
        <h1 className="text-3xl font-bold text-neutral-900 mb-2 font-serif">Blog</h1>
        <p className="text-gray-500 mb-8">Tecnologia, gestão e inovação para empresas</p>

        <Suspense>
          <CategoryFilter
            categories={categoriesData.categories}
            selected={searchParams.category}
          />
        </Suspense>

        <div className="mt-6">
          <PostGrid posts={postsData.posts} />
        </div>

        <Suspense>
          <Pagination currentPage={postsData.page} totalPages={postsData.pages} />
        </Suspense>
      </div>

      <aside className="hidden lg:block w-64 shrink-0">
        <div className="sticky top-8">
          <h2 className="font-semibold text-neutral-900 mb-4">Categorias</h2>
          <div className="flex flex-col gap-1">
            {categoriesData.categories.map((cat: { id: number; name: string; slug: string }) => (
              <a
                key={cat.id}
                href={`/categoria/${cat.slug}`}
                className="text-sm text-brand-primary hover:text-brand-primary-dark px-3 py-1.5 rounded-lg hover:bg-brand-primary-light transition-colors"
              >
                {cat.name}
              </a>
            ))}
          </div>
        </div>
      </aside>
    </div>
  )
}
```

- [ ] **Step 2: Verify build**

```bash
npm run build
```

Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add app/(public)/page.tsx
git commit -m "feat: render Portal editorial layout on home page when portal template is active"
```

---

## Task 11: Create `/admin/aparencia` client component

**Files:**
- Create: `app/admin/aparencia/ApparenceClient.tsx`
- Create: `app/admin/aparencia/page.tsx`

- [ ] **Step 1: Create `ApparenceClient.tsx`**

```tsx
'use client'

import { useState } from 'react'
import type { SiteSettings, ThemeColors } from '@/lib/settings'

interface Props {
  initial: SiteSettings
}

const TEMPLATE_OPTIONS = [
  {
    id: 'default',
    name: 'Default',
    description: 'Layout limpo com sidebar de categorias e grid de posts',
    preview: (
      <svg viewBox="0 0 240 160" className="w-full" xmlns="http://www.w3.org/2000/svg">
        {/* Header */}
        <rect x="0" y="0" width="240" height="24" fill="#1A4FA0" rx="4" />
        <rect x="8" y="8" width="60" height="8" fill="white" rx="2" />
        <rect x="160" y="8" width="72" height="8" fill="white" opacity="0.5" rx="2" />
        {/* Sidebar */}
        <rect x="0" y="28" width="56" height="132" fill="#f3f4f6" rx="2" />
        <rect x="4" y="36" width="48" height="6" fill="#d1d5db" rx="1" />
        <rect x="4" y="46" width="40" height="4" fill="#d1d5db" rx="1" />
        <rect x="4" y="54" width="44" height="4" fill="#d1d5db" rx="1" />
        <rect x="4" y="62" width="36" height="4" fill="#d1d5db" rx="1" />
        {/* Post cards */}
        <rect x="62" y="28" width="56" height="70" fill="white" rx="3" />
        <rect x="62" y="28" width="56" height="32" fill="#e5e7eb" rx="3" />
        <rect x="66" y="64" width="48" height="5" fill="#d1d5db" rx="1" />
        <rect x="66" y="72" width="40" height="4" fill="#e5e7eb" rx="1" />
        <rect x="124" y="28" width="56" height="70" fill="white" rx="3" />
        <rect x="124" y="28" width="56" height="32" fill="#e5e7eb" rx="3" />
        <rect x="128" y="64" width="48" height="5" fill="#d1d5db" rx="1" />
        <rect x="128" y="72" width="40" height="4" fill="#e5e7eb" rx="1" />
        <rect x="184" y="28" width="56" height="70" fill="white" rx="3" />
        <rect x="184" y="28" width="56" height="32" fill="#e5e7eb" rx="3" />
        <rect x="188" y="64" width="48" height="5" fill="#d1d5db" rx="1" />
        <rect x="188" y="72" width="40" height="4" fill="#e5e7eb" rx="1" />
        {/* Footer */}
        <rect x="0" y="148" width="240" height="12" fill="#1A4FA0" rx="2" />
      </svg>
    ),
  },
  {
    id: 'portal',
    name: 'Portal',
    description: 'Estilo portal de notícias com hero destacado e grade editorial',
    preview: (
      <svg viewBox="0 0 240 160" className="w-full" xmlns="http://www.w3.org/2000/svg">
        {/* Header row 1 */}
        <rect x="0" y="0" width="240" height="18" fill="#CC0000" rx="4" />
        <rect x="8" y="5" width="60" height="8" fill="white" rx="2" />
        <rect x="160" y="5" width="72" height="8" fill="white" opacity="0.5" rx="2" />
        {/* Header row 2 - category nav */}
        <rect x="0" y="18" width="240" height="12" fill="#AA0000" />
        <rect x="8" y="21" width="20" height="5" fill="white" opacity="0.7" rx="1" />
        <rect x="34" y="21" width="24" height="5" fill="white" opacity="0.5" rx="1" />
        <rect x="64" y="21" width="28" height="5" fill="white" opacity="0.5" rx="1" />
        <rect x="98" y="21" width="20" height="5" fill="white" opacity="0.5" rx="1" />
        {/* Hero */}
        <rect x="0" y="30" width="240" height="52" fill="#555" rx="3" />
        <rect x="0" y="58" width="240" height="24" fill="black" opacity="0.5" />
        <rect x="8" y="56" width="40" height="5" fill="#FF6600" rx="1" />
        <rect x="8" y="64" width="180" height="7" fill="white" rx="2" />
        <rect x="8" y="74" width="120" height="4" fill="white" opacity="0.6" rx="1" />
        {/* Editorial grid */}
        <rect x="0" y="86" width="152" height="62" fill="white" rx="2" />
        <rect x="0" y="86" width="152" height="3" fill="#FF6600" rx="2" />
        <rect x="0" y="86" width="152" height="28" fill="#e5e7eb" rx="2" />
        <rect x="4" y="118" width="144" height="7" fill="#d1d5db" rx="1" />
        <rect x="4" y="128" width="100" height="5" fill="#e5e7eb" rx="1" />
        <rect x="156" y="86" width="84" height="28" fill="white" rx="2" />
        <rect x="156" y="86" width="84" height="3" fill="#FF6600" />
        <rect x="160" y="92" width="76" height="5" fill="#d1d5db" rx="1" />
        <rect x="156" y="118" width="84" height="28" fill="white" rx="2" />
        <rect x="156" y="118" width="84" height="3" fill="#FF6600" />
        <rect x="160" y="124" width="76" height="5" fill="#d1d5db" rx="1" />
        {/* Footer */}
        <rect x="0" y="150" width="240" height="10" fill="#CC0000" rx="2" />
      </svg>
    ),
  },
]

const COLOR_LABELS: { key: keyof ThemeColors; label: string }[] = [
  { key: 'primary', label: 'Cor primária (header, botões, links)' },
  { key: 'secondary', label: 'Cor de destaque (badges, acentos)' },
  { key: 'background', label: 'Fundo da página' },
  { key: 'surface', label: 'Fundo dos cards' },
]

const DEFAULT_COLORS: Record<string, ThemeColors> = {
  default: { primary: '#1A4FA0', secondary: '#F58A2D', background: '#F9FAFB', surface: '#FFFFFF' },
  portal: { primary: '#CC0000', secondary: '#FF6600', background: '#F5F5F5', surface: '#FFFFFF' },
}

export function ApparenceClient({ initial }: Props) {
  const [template, setTemplate] = useState(initial.template)
  const [colors, setColors] = useState<ThemeColors>(initial.colors)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null)

  function handleTemplateChange(id: string) {
    setTemplate(id)
    setColors(DEFAULT_COLORS[id] ?? DEFAULT_COLORS.default)
  }

  function handleColorChange(key: keyof ThemeColors, value: string) {
    setColors((prev) => ({ ...prev, [key]: value }))
  }

  function handleReset(key: keyof ThemeColors) {
    setColors((prev) => ({
      ...prev,
      [key]: (DEFAULT_COLORS[template] ?? DEFAULT_COLORS.default)[key],
    }))
  }

  async function handleSave() {
    setSaving(true)
    setToast(null)
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template, colors }),
      })
      if (!res.ok) throw new Error('Falha ao salvar')
      setToast({ type: 'success', msg: 'Configurações salvas! Recarregue a página para ver o novo tema.' })
    } catch {
      setToast({ type: 'error', msg: 'Erro ao salvar configurações.' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold text-neutral-900">Aparência</h1>
        <button
          onClick={handleSave}
          disabled={saving}
          className="bg-brand-primary text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-brand-primary-dark transition-colors disabled:opacity-50"
        >
          {saving ? 'Salvando...' : 'Salvar alterações'}
        </button>
      </div>

      {toast && (
        <div
          className={`mb-6 px-4 py-3 rounded-lg text-sm ${
            toast.type === 'success'
              ? 'bg-green-50 text-green-800 border border-green-200'
              : 'bg-red-50 text-red-800 border border-red-200'
          }`}
        >
          {toast.msg}
        </div>
      )}

      {/* Template selector */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold text-neutral-900 mb-4">Template</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {TEMPLATE_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              onClick={() => handleTemplateChange(opt.id)}
              className={`relative text-left rounded-xl border-2 p-4 transition-all ${
                template === opt.id
                  ? 'border-brand-primary bg-brand-primary-light'
                  : 'border-gray-200 bg-white hover:border-gray-300'
              }`}
            >
              {template === opt.id && (
                <span className="absolute top-3 right-3 bg-brand-primary text-white text-xs px-2 py-0.5 rounded-full">
                  Ativo
                </span>
              )}
              <div className="mb-3 rounded overflow-hidden border border-gray-100">
                {opt.preview}
              </div>
              <p className="font-semibold text-neutral-900">{opt.name}</p>
              <p className="text-sm text-gray-500 mt-0.5">{opt.description}</p>
            </button>
          ))}
        </div>
      </section>

      {/* Color customizer */}
      <section>
        <h2 className="text-lg font-semibold text-neutral-900 mb-4">Cores</h2>
        <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
          {COLOR_LABELS.map(({ key, label }) => (
            <div key={key} className="flex items-center justify-between px-5 py-4 gap-4">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-neutral-900">{label}</p>
                <p className="text-xs text-gray-400 font-mono mt-0.5">{colors[key]}</p>
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={colors[key]}
                  onChange={(e) => handleColorChange(key, e.target.value)}
                  className="w-10 h-10 rounded cursor-pointer border border-gray-200"
                />
                <input
                  type="text"
                  value={colors[key]}
                  onChange={(e) => {
                    const v = e.target.value
                    if (/^#[0-9A-Fa-f]{0,6}$/.test(v)) handleColorChange(key, v)
                  }}
                  className="w-24 text-sm font-mono border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-primary"
                />
                <button
                  onClick={() => handleReset(key)}
                  className="text-xs text-gray-400 hover:text-brand-primary transition-colors"
                  title="Restaurar padrão"
                >
                  Padrão
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
```

- [ ] **Step 2: Create `app/admin/aparencia/page.tsx`**

```tsx
import { getSettings } from '@/lib/settings'
import { ApparenceClient } from './ApparenceClient'

export default async function ApparencePage() {
  const settings = await getSettings()
  return <ApparenceClient initial={settings} />
}
```

- [ ] **Step 3: Commit**

```bash
git add app/admin/aparencia/
git commit -m "feat: add /admin/aparencia page with template selector and color pickers"
```

---

## Task 12: Add Aparência link to admin navigation

**Files:**
- Modify: `app/admin/layout.tsx`

- [ ] **Step 1: Add nav item**

In `app/admin/layout.tsx`, find the `navItems` array:

```ts
const navItems = [
  { href: '/admin', label: 'Dashboard', icon: '📊' },
  { href: '/admin/artigos', label: 'Artigos', icon: '📝' },
  { href: '/admin/categorias', label: 'Categorias', icon: '🗂️' },
  { href: '/admin/tags', label: 'Tags', icon: '🏷️' },
]
```

Replace it with:

```ts
const navItems = [
  { href: '/admin', label: 'Dashboard', icon: '📊' },
  { href: '/admin/artigos', label: 'Artigos', icon: '📝' },
  { href: '/admin/categorias', label: 'Categorias', icon: '🗂️' },
  { href: '/admin/tags', label: 'Tags', icon: '🏷️' },
  { href: '/admin/aparencia', label: 'Aparência', icon: '🎨' },
]
```

- [ ] **Step 2: Final build check**

```bash
npm run build
```

Expected: build succeeds with no TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add app/admin/layout.tsx
git commit -m "feat: add Aparência link to admin navigation"
```

---

## Task 13: Manual smoke test

- [ ] **Step 1: Start dev server**

```bash
npm run dev
```

- [ ] **Step 2: Test default template (should be unchanged)**

Open `http://localhost:3000`. Verify: blue header, post grid with sidebar. Everything looks the same as before.

- [ ] **Step 3: Switch to Portal template**

Open `http://localhost:3000/admin/aparencia`. Log in if needed. Click "Portal" template card, then "Salvar alterações". Expected: success toast.

- [ ] **Step 4: Verify Portal template on public site**

Open `http://localhost:3000` in a new tab (or hard-refresh). Verify: double-row red header with category nav, hero post at top, editorial grid below.

- [ ] **Step 5: Test color customization**

In `/admin/aparencia`, change the "Cor primária" to `#006600` (green), save. Reload the public site. Verify: header and links are now green.

- [ ] **Step 6: Restore default template**

Switch back to "Default" template and save. Reload public site. Verify: blue header and original layout are back.

- [ ] **Step 7: Final push to GitHub**

```bash
git push origin master
```

Expected: Vercel picks up the push and deploys automatically.
