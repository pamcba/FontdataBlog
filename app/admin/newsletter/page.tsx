import { getSettings } from '@/lib/settings'
import { NewsletterClient } from './NewsletterClient'

export const dynamic = 'force-dynamic'

export default async function NewsletterPage() {
  const { newsletter } = await getSettings()
  return <NewsletterClient initialConfig={newsletter} />
}
