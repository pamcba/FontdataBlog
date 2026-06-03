# /analisar-bug — Análise profunda de causa-raiz com relatório estruturado

Conduz uma investigação sistemática e profunda do bug descrito: leitura de código, rastreamento de causa-raiz, e geração de relatório que alimenta o `/corrigir-bug`.

## O que este comando faz

### Etapa 1 — Coleta de contexto
Analisa a descrição do erro fornecida e mapeia o escopo da investigação:
- Identifica os domínios afetados (DB, API, UI, pipeline de IA, cron, autenticação)
- Lista os arquivos candidatos com base nos caminhos e nomenclaturas do projeto
- Lê os arquivos relevantes integralmente — **nunca faz suposições sem ler o código**

Domínios e caminhos conhecidos do projeto:
| Domínio | Caminhos |
|---|---|
| Schema / DB | `drizzle/schema.ts`, `drizzle/db.ts`, `lib/db-queries.ts` |
| API pública | `app/api/posts/`, `app/api/categories/`, `app/api/tags/` |
| API admin | `app/api/admin/` |
| API v1 | `app/api/v1/` |
| Admin UI | `app/admin/`, `components/blog/` |
| Frontend público | `app/(public)/` |
| Pipeline de IA | `lib/agents/`, `lib/agent-pipeline.ts`, `lib/ai.ts` |
| Cron / automação | `app/api/cron/`, `lib/automation.ts`, `lib/source-crawlers/` |
| Auth | `middleware.ts`, `lib/auth.ts` |
| Config | `lib/`, `next.config.js`, `drizzle.config.ts` |

### Etapa 2 — Rastreamento de causa-raiz
Segue o fluxo de execução de ponta a ponta a partir do sintoma descrito:

1. **Ponto de entrada** — onde o erro se manifesta (componente, rota, função)
2. **Fluxo de dados** — rastreia como os dados chegam ao ponto de falha (request → middleware → handler → DB → response)
3. **Hipóteses candidatas** — lista todas as causas possíveis, classificadas por probabilidade
4. **Causa-raiz confirmada** — identifica a causa com evidência direta no código (linha exata, arquivo)
5. **Impacto colateral** — verifica se o mesmo bug existe em outros locais do codebase

### Etapa 3 — Verificação de contexto adicional
Para cada causa-raiz identificada, verifica:
- Se há constraint no banco que contradiz o comportamento esperado
- Se o middleware intercepta o request antes de chegar ao handler correto
- Se há validação Zod ausente ou incorreta
- Se a sanitização de HTML está sendo aplicada corretamente
- Se modelos de AI usam `lib/ai.ts` (nunca SDK direto)
- Se chaves de API leem de `site_settings` (nunca de `process.env`)

### Etapa 4 — Relatório de análise
Gera um relatório estruturado em Markdown:

```markdown
## Relatório de Bug — <título curto do problema>

### Descrição do problema
<o que o usuário reportou>

### Causa-raiz identificada
**Arquivo**: `<caminho/arquivo.ts>`  
**Linha**: <número>  
**Tipo**: <tipo do bug: lógica / tipagem / validação / auth / DB / UI>

<explicação técnica da causa-raiz em 2–4 frases>

### Evidência no código
```<linguagem>
<trecho relevante do código com o problema>
```

### Impacto
- **Severidade**: CRÍTICO / ALTO / MÉDIO / BAIXO
- **Escopo**: <arquivos/funcionalidades afetadas além do ponto de falha>
- **Usuários afetados**: <admin / público / ambos / sistema automatizado>

### Hipóteses descartadas
- <hipótese 1> — descartada porque <razão>
- <hipótese 2> — descartada porque <razão>

### Solução proposta
**Abordagem**: <descrição da correção>

**Arquivos a modificar**:
- `<arquivo 1>` — <o que mudar>
- `<arquivo 2>` — <o que mudar>

**Agentes responsáveis pela correção**:
| Arquivo | Agente |
|---|---|
| `app/api/admin/...` | `api-builder` |
| `app/admin/...` | `admin-ui` |
| `drizzle/schema.ts` | `db-engineer` |
| `lib/agents/...` | `ai-pipeline` |
| `app/(public)/...` | `public-frontend` |
| `app/api/cron/...` | `cron-automator` |

**Estimativa**: <simples (< 30min) / moderada (30min–2h) / complexa (> 2h)>

### Riscos da correção
- <risco 1: ex. "migration com ALTER TABLE pode exigir dois passos">
- <risco 2: ex. "mudança no shape da resposta da API pode quebrar o client">

### Checklist de verificação pós-correção
- [ ] <verificação 1>
- [ ] <verificação 2>
- [ ] `npm run build` passa sem erros TypeScript
- [ ] `npm run lint` limpo
```

### Etapa 5 — Apresentação e decisão
Apresenta o relatório ao usuário e pergunta:

> **Análise concluída.** A causa-raiz foi identificada em `<arquivo>:<linha>`.  
> Deseja que eu execute `/corrigir-bug` automaticamente com este relatório?  
> **[S] Sim, corrigir agora** · **[N] Não, vou revisar primeiro**

Se o usuário confirmar, invoca `/corrigir-bug` passando o relatório completo como contexto.

## Uso

```
/analisar-bug <descrição do erro>
/analisar-bug posts publicados aparecem na API pública mesmo com status draft
/analisar-bug erro 500 ao salvar artigo com imagem do imgur
/analisar-bug pipeline de IA trava após o agente Reviewer reprovar 3 vezes
/analisar-bug login não funciona após deploy — cookie auth-token não está sendo setado
```

## Regras da análise

1. **Nunca sugira correção sem ler o código** — toda hipótese deve ter evidência no arquivo
2. **Rastreie o fluxo completo** — não pare no ponto de manifetação, vá até a origem
3. **Verifique impacto colateral** — o mesmo padrão quebrado pode existir em outros lugares
4. **Priorize segurança** — bugs de auth, XSS e SQL injection são sempre CRÍTICO
5. **Documente o que foi descartado** — hipóteses descartadas evitam investigação duplicada

---

**Próximo passo**: `/corrigir-bug` (automático se confirmado, ou manual)  
**Referências**: `CLAUDE.md`, `.claude/rules/`, `SPEC.md`
