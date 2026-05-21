import { NextResponse } from 'next/server'
import { getTelegramConfig, computeWebhookSecret } from '@/lib/telegram'
import { getAppUrl } from '@/lib/app-url'

export async function POST() {
  const config = await getTelegramConfig()
  if (!config?.bot_token) {
    return NextResponse.json(
      { error: 'Token do bot não configurado. Salve as configurações primeiro.' },
      { status: 400 }
    )
  }

  const webhookUrl = `${getAppUrl().replace(/\/$/, '')}/api/telegram/webhook`
  const secretToken = computeWebhookSecret(config.bot_token)

  const response = await fetch(
    `https://api.telegram.org/bot${config.bot_token}/setWebhook`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: webhookUrl,
        secret_token: secretToken,
        allowed_updates: ['message'],
      }),
    }
  )

  const data = await response.json()
  if (!data.ok) {
    return NextResponse.json({ error: `Telegram: ${data.description}` }, { status: 400 })
  }

  return NextResponse.json({ success: true, webhook_url: webhookUrl })
}
