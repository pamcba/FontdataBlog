import { NextRequest, NextResponse } from 'next/server'
import path from 'path'
import { cookies } from 'next/headers'
import { verifyToken } from '@/lib/auth'
import { supabaseAdmin, STORAGE_BUCKET } from '@/lib/supabase-admin'

const MAX_SIZE = 5 * 1024 * 1024
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml']

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const token = cookies().get('auth_token')?.value
  if (!token || !(await verifyToken(token))) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  }

  const formData = await request.formData()
  const file = formData.get('file') as File | null

  if (!file) {
    return NextResponse.json({ error: 'Nenhum arquivo enviado' }, { status: 400 })
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: 'Formato não suportado. Use JPG, PNG, WebP, GIF ou SVG.' }, { status: 400 })
  }

  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: 'Imagem deve ter menos de 5MB' }, { status: 400 })
  }

  const ext = path.extname(file.name).toLowerCase() || '.jpg'
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`

  const bytes = await file.arrayBuffer()
  const { error } = await supabaseAdmin.storage
    .from(STORAGE_BUCKET)
    .upload(filename, Buffer.from(bytes), { contentType: file.type })

  if (error) {
    console.error('Supabase upload error:', error)
    return NextResponse.json({ error: 'Erro ao fazer upload da imagem' }, { status: 500 })
  }

  const { data: { publicUrl } } = supabaseAdmin.storage
    .from(STORAGE_BUCKET)
    .getPublicUrl(filename)

  return NextResponse.json({ url: publicUrl })
}
