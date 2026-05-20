import { getSettings } from '@/lib/settings'
import { ConfiguracoesClient } from './ConfiguracoesClient'

export default async function ConfiguracoesPage() {
  const settings = await getSettings()
  return <ConfiguracoesClient initial={settings.company} />
}
