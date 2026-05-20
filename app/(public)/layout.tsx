import { Header } from '@/components/layout/Header'
import { PortalHeader } from '@/components/layout/PortalHeader'
import { Footer } from '@/components/layout/Footer'
import { getSettings } from '@/lib/settings'

export const dynamic = 'force-dynamic'

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const { template, company } = await getSettings()
  const blogName = company.blog_name || process.env.NEXT_PUBLIC_BLOG_NAME || 'Blog'
  const logoUrl = company.logo_url

  return (
    <div className="min-h-screen flex flex-col">
      {template === 'portal'
        ? <PortalHeader blogName={blogName} logoUrl={logoUrl} />
        : <Header blogName={blogName} logoUrl={logoUrl} />
      }
      <main
        className={`flex-1 w-full mx-auto px-4 py-8 ${
          template === 'portal' ? 'max-w-7xl' : 'max-w-6xl'
        }`}
      >
        {children}
      </main>
      <Footer
        blogName={blogName}
        companyName={company.company_name}
        companyEmail={company.company_email}
        companyPhone={company.company_phone}
        socialFacebook={company.social_facebook}
        socialInstagram={company.social_instagram}
        socialTwitter={company.social_twitter}
        socialYoutube={company.social_youtube}
      />
    </div>
  )
}
