import { getSettings } from '@/lib/settings'
import { getDefaultModels, getAIApiKey, getAIModelFromDB } from '@/lib/ai'
import { getTelegramConfig } from '@/lib/telegram'
import { ConfiguracoesClient } from './ConfiguracoesClient'

export default async function ConfiguracoesPage() {
  const settings = await getSettings()
  const aiApiKey = (await getAIApiKey()) ?? ''

  const defaults = getDefaultModels()
  const aiModels: Record<string, string> = {}
  for (const feature of Object.keys(defaults)) {
    aiModels[feature] = await getAIModelFromDB(feature)
  }

  const telegramConfig = await getTelegramConfig()

  return (
    <ConfiguracoesClient
      initial={settings.company}
      initialAI={{ api_key: aiApiKey, models: aiModels }}
      initialTelegram={{
        bot_token: telegramConfig?.bot_token ?? '',
        allowed_chat_ids: telegramConfig?.allowed_chat_ids ?? '',
      }}
    />
  )
}
