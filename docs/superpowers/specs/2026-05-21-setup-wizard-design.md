# Setup Wizard — Design Spec

**Data:** 2026-05-21  
**Objetivo:** Wizard de instalação estilo WordPress que configura o banco Supabase, roda migrations, cria o usuário admin e persiste as env vars na Vercel — tudo pela UI, sem acesso manual ao `.env`.

---

## Contexto

O projeto é um blog Next.js 14 App Router + Drizzle ORM + Supabase PostgreSQL hospedado na Vercel. Atualmente, o setup exige configuração manual do `.env` antes do primeiro uso. O objetivo é eliminar essa etapa: o usuário faz deploy na Vercel e acessa o `/admin` — o sistema detecta que não está configurado e redireciona para o wizard.

---

## Arquitetura

### Detecção e Roteamento

O `middleware.ts` é estendido para verificar `DATABASE_URL` antes de checar autenticação:

- Se `DATABASE_URL` está ausente: qualquer acesso a `/admin/*` redireciona para `/setup`
- Se `DATABASE_URL` está presente: `/setup` redireciona para `/admin/login` (bloqueia acesso pós-instalação)
- A rota `/setup` é pública e fica fora do matcher de autenticação do middleware

### Rota `/setup`

Página client component com wizard de 6 steps sequenciais e barra de progresso no topo.

### API Routes `/api/setup/*`

Todas públicas, sem autenticação JWT. Todas verificam se `DATABASE_URL` já está definida no processo — retornam 403 se o sistema já foi instalado.

---

## Steps do Wizard

**Step 1 — Vercel Token**
- Campo: Vercel Access Token (gerado em vercel.com/account/tokens)
- Ação: `POST /api/setup/verify-vercel` → valida token na Vercel API, descobre `projectId` e `teamId` via `VERCEL_PROJECT_ID` / `VERCEL_TEAM_ID` (injetados automaticamente pela Vercel)
- Avança apenas com token válido

**Step 2 — Credenciais Supabase**
- Campos: `DATABASE_URL` (connection string pooler porta 6543), `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- Ação: `POST /api/setup/test-db` → cria conexão temporária, executa `SELECT 1`
- Botão "Testar conexão" obrigatório antes de avançar

**Step 3 — Configurar banco** *(automático)*
- Sem input do usuário
- Chama `POST /api/setup/install` (apenas a fase de migrations)
- Executa SQL de criação das tabelas (`CREATE TABLE IF NOT EXISTS`) via `postgres.js` diretamente
- Exibe progresso e erros. Permite tentar novamente em caso de falha

**Step 4 — Usuário administrador**
- Campos: Nome, Email, Senha, Confirmar Senha
- Validação: senha mínima de 8 caracteres, confirmação obrigatória
- Dados enviados juntos no payload do step 5

**Step 5 — Salvar e redesployar** *(automático)*
- Chama `POST /api/setup/install` (fase de criação do usuário + env vars + redeploy)
- Servidor gera `JWT_SECRET` e `CRON_SECRET` com `crypto.randomBytes(32).toString('base64')`
- Salva env vars na Vercel via `PATCH /v9/projects/{id}/env`
- Dispara redeploy via Vercel API
- Frontend faz polling em `GET /api/setup/deploy-status?deploymentId=xxx` a cada 3s
- Em caso de `ERROR` no deploy: exibe erro + link para o painel da Vercel (env vars já foram salvas, redeploy manual funciona)

**Step 6 — Concluído**
- Exibe as credenciais do admin criado (nome, email)
- Botão "Acessar o painel" → redireciona para `/admin/login`

---

## API Routes

### `POST /api/setup/verify-vercel`
```
body: { token: string }
response: { valid: boolean, teamId?: string, projectId?: string }
```
Chama `GET https://api.vercel.com/v2/user`. Lê `VERCEL_PROJECT_ID` e `VERCEL_TEAM_ID` das env vars do processo para identificar o projeto atual.

### `POST /api/setup/test-db`
```
body: { databaseUrl: string, supabaseUrl: string, serviceRoleKey: string }
response: { ok: boolean, error?: string }
```
Cria conexão temporária com `postgres(databaseUrl)`, executa `SELECT 1`, fecha a conexão.

### `POST /api/setup/install`
```
body: {
  vercelToken: string,
  databaseUrl: string,
  supabaseUrl: string,
  serviceRoleKey: string,
  adminName: string,
  adminEmail: string,
  adminPassword: string
}
response: { deploymentId: string }
```
Executa em sequência:
1. Conecta ao banco com `databaseUrl`
2. Executa SQL de criação das tabelas (`drizzle/setup-sql.ts`)
3. Cria usuário admin com `hashPassword` de `lib/auth.ts`
4. Gera `JWT_SECRET` e `CRON_SECRET` com `crypto.randomBytes`
5. Salva todas as env vars na Vercel API (`PATCH /v9/projects/{projectId}/env`)
6. Dispara redeploy (`POST /v13/deployments`)
7. Retorna `deploymentId`

### `GET /api/setup/deploy-status`
```
query: { deploymentId: string }
response: { state: 'BUILDING' | 'READY' | 'ERROR', url?: string }
```
Chama `GET https://api.vercel.com/v13/deployments/{id}`. Retorna o estado atual.

---

## Migrations em Runtime

Arquivo `drizzle/setup-sql.ts` exporta uma string SQL com `CREATE TABLE IF NOT EXISTS` para todas as tabelas do schema atual. Executado via `postgres.js` diretamente — sem dependência do `drizzle-kit` em runtime.

Quando houver uma nova migration futura, o desenvolvedor atualiza `setup-sql.ts` junto com `schema.ts`.

Tabelas cobertas: `users`, `posts`, `categories`, `tags`, `post_categories`, `post_tags`, `site_settings`, `api_tokens`, `article_themes`, `page_views`, `newsletter_subscribers`, `automation_config`.

---

## Segurança

- Rotas `/api/setup/*` retornam 403 se `DATABASE_URL` já está definida no processo
- `/setup` redireciona para `/admin/login` se `DATABASE_URL` presente (via middleware)
- `JWT_SECRET` e `CRON_SECRET` gerados pelo servidor — nunca expostos ao usuário
- Senha do admin: mínimo 8 caracteres, confirmação obrigatória no frontend
- Conexão com banco testada antes de prosseguir (step 2 obrigatório)

---

## Arquivos a criar/modificar

| Arquivo | Ação |
|---|---|
| `middleware.ts` | Modificar — adicionar detecção de `DATABASE_URL` ausente |
| `app/setup/page.tsx` | Criar — wizard client component |
| `app/api/setup/verify-vercel/route.ts` | Criar |
| `app/api/setup/test-db/route.ts` | Criar |
| `app/api/setup/install/route.ts` | Criar |
| `app/api/setup/deploy-status/route.ts` | Criar |
| `drizzle/setup-sql.ts` | Criar — SQL de criação das tabelas |
