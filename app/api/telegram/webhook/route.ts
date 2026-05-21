import { NextRequest, NextResponse } from 'next/server'
import { getAppUrl } from '@/lib/app-url'
import {
  getTelegramConfig,
  computeWebhookSecret,
  sendTelegramMessage,
  generateAndPublishPost,
} from '@/lib/telegram'

export const maxDuration = 60

interface TelegramMessage {
  message_id: number
  from?: { id: number; username?: string }
  chat: { id: number; type: string }
  text?: string
}

interface TelegramUpdate {
  update_id: number
  message?: TelegramMessage
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export async function POST(request: NextRequest) {
  const config = await getTelegramConfig()
  if (!config?.bot_token) return NextResponse.json({ ok: true })

  const incomingSecret = request.headers.get('x-telegram-bot-api-secret-token')
  const expectedSecret = computeWebhookSecret(config.bot_token)
  if (incomingSecret !== expectedSecret) return NextResponse.json({ ok: true })

  let update: TelegramUpdate
  try {
    update = await request.json()
  } catch {
    return NextResponse.json({ ok: true })
  }

  const message = update?.message
  if (!message?.text || !message?.chat?.id) return NextResponse.json({ ok: true })

  const chatId = message.chat.id
  const text = message.text.trim()

  if (text === '/start' || text.startsWith('/start ')) {
    await sendTelegramMessage(
      config.bot_token,
      chatId,
      `Olá! Este bot gera artigos automaticamente.\n\nSeu Chat ID é: <code>${chatId}</code>\n\nEnvie um tema ou um link para gerar e publicar um artigo.`
    )
    return NextResponse.json({ ok: true })
  }

  if (text.startsWith('/')) return NextResponse.json({ ok: true })

  const allowedIds = config.allowed_chat_ids
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

  if (allowedIds.length > 0 && !allowedIds.includes(String(chatId))) {
    return NextResponse.json({ ok: true })
  }

  await sendTelegramMessage(config.bot_token, chatId, '⏳ Gerando artigo, aguarde...')

  try {
    const appUrl = getAppUrl().replace(/\/$/, '')
    const { title, slug } = await generateAndPublishPost(text)
    const postUrl = `${appUrl}/${slug}`

    await sendTelegramMessage(
      config.bot_token,
      chatId,
      `✅ Artigo publicado!\n\n<b>${escapeHtml(title)}</b>\n\n🔗 ${postUrl}`
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erro ao gerar artigo'
    await sendTelegramMessage(config.bot_token, chatId, `❌ Erro: ${msg}`)
  }

  return NextResponse.json({ ok: true })
}
