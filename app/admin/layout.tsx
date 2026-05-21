import Link from 'next/link'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { verifyToken } from '@/lib/auth'
import { getSettings } from '@/lib/settings'
import { getAppUrl } from '@/lib/app-url'

const navItems = [
  { href: '/admin', label: 'Dashboard', icon: '📊' },
  { href: '/admin/analytics', label: 'Analytics', icon: '📈' },
  { href: '/admin/artigos', label: 'Artigos', icon: '📝' },
  { href: '/admin/categorias', label: 'Categorias', icon: '🗂️' },
  { href: '/admin/tags', label: 'Tags', icon: '🏷️' },
  { href: '/admin/api', label: 'API', icon: '🔑' },
  { href: '/admin/newsletter', label: 'Newsletter', icon: '✉️' },
  { href: '/admin/aparencia', label: 'Aparência', icon: '🎨' },
  { href: '/admin/configuracoes', label: 'Configurações', icon: '⚙️' },
]

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = cookies()
  const token = cookieStore.get('auth_token')?.value
  const user = token ? await verifyToken(token) : null

  if (!user) {
    return <>{children}</>
  }

  const { company } = await getSettings()
  const blogName = company.blog_name || process.env.NEXT_PUBLIC_BLOG_NAME || 'Blog'

  return (
    <div className="min-h-screen flex bg-gray-50">
      <aside className="w-56 bg-brand-primary text-white flex flex-col shrink-0">
        <div className="p-5 border-b border-white/20">
          <p className="font-bold text-sm">{blogName}</p>
          <p className="text-white/60 text-xs mt-0.5">Admin</p>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm hover:bg-white/10 transition-colors"
            >
              <span>{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="p-3 border-t border-white/20">
          <form action={async () => {
            'use server'
            await fetch(`${getAppUrl()}/api/auth/logout`, { method: 'POST' })
            redirect('/admin/login')
          }}>
            <button
              type="submit"
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-white/60 hover:text-white hover:bg-white/10 transition-colors"
            >
              <span>🚪</span> Sair
            </button>
          </form>
        </div>
      </aside>

      <main className="flex-1 p-8 overflow-y-auto">
        {children}
      </main>
    </div>
  )
}
