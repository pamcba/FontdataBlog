# /melhoria — Planejamento e implementação de melhorias

Recebe uma solicitação de melhoria em linguagem natural, faz **exatamente 2 perguntas de clarificação**, monta um plano estruturado em Sprints → Fases → Tasks e delega a execução ao `/implementar` — que por sua vez usa o agente `orquestrador` para gerenciar toda a implementação.

## Fluxo obrigatório

```
Passo 1 — Análise da solicitação
Passo 2 — 2 perguntas de clarificação (aguardar resposta do usuário)
Passo 3 — Plano em Sprints/Fases/Tasks
Passo 4 — Delegação ao /implementar
```

**Nunca pule ou reordene esses passos.**

---

## Passo 1 — Análise da solicitação

Leia a solicitação e identifique:
- Domínios afetados (DB, API, Admin UI, Public Frontend, AI Pipeline, Cron)
- Dependências entre partes da melhoria
- Ambiguidades que impediriam um plano preciso

---

## Passo 2 — 2 perguntas de clarificação

Formule **exatamente 2 perguntas** — nem menos, nem mais — antes de qualquer plano ou código.

**Critérios para escolher as 2 perguntas:**
- Priorize perguntas cujas respostas mudam significativamente o escopo ou a abordagem
- Se há 3+ ambiguidades, escolha as 2 que têm maior impacto
- Nunca pergunte sobre detalhes que você pode inferir das convenções do projeto (CLAUDE.md, `.claude/rules/`)

**Formato das perguntas:**
```
Para planejar essa melhoria com precisão, preciso de 2 informações:

1. <pergunta objetiva com contexto breve>
2. <pergunta objetiva com contexto breve>
```

**Aguarde a resposta do usuário antes de continuar.**

---

## Passo 3 — Plano em Sprints/Fases/Tasks

Com as respostas em mãos, gere o plano completo:

```
## Plano de Melhoria — <título da melhoria>

Sprint 1 — <objetivo do sprint>
  Fase 1.1 — <domínio>
    [ ] Task: <o que fazer especificamente>
        Agente: <db-engineer | api-builder | admin-ui | ai-pipeline | cron-automator | public-frontend>
        Depende: <nenhuma | Task X.Y>
    [ ] Task: ...

  Fase 1.2 — <domínio dependente>
    [ ] Task: ...

Sprint 2 — <objetivo do sprint> (se necessário)
  ...

## Resumo de impacto
- Arquivos criados/modificados estimados: ...
- Domínios afetados: ...
- Estimativa de complexidade: <baixa | média | alta>
```

**Regras do plano:**
- Tarefas independentes ficam na mesma Fase (rodam em paralelo)
- Tarefas sequenciais ficam em Fases diferentes (respeitam dependência)
- Cada Task tem um agente especializado responsável
- Plano deve ser completo o suficiente para que `/implementar` execute sem perguntas adicionais

---

## Passo 4 — Delegação ao /implementar

Após apresentar o plano ao usuário, **invoque `/implementar`** passando:
1. A descrição completa da melhoria
2. O plano gerado (para que o orquestrador não precise replanejar do zero)

```
/implementar <descrição completa da melhoria com contexto das respostas de clarificação>

Plano pré-aprovado:
<cole o plano gerado no Passo 3>
```

O `/implementar` delega automaticamente ao agente `orquestrador`, que:
- Distribui tasks entre os agentes especializados
- Executa com TDD quando aplicável
- Chama `code-reviewer` ao final automaticamente
- Repete ciclo até aprovação em caso de BLOQUEANTE

---

## Uso

```
/melhoria <descrição da melhoria em linguagem natural>

/melhoria quero que o blog mostre artigos relacionados no final de cada post
/melhoria adicionar suporte a múltiplos autores nos artigos
/melhoria criar dashboard de analytics com gráfico de pageviews por dia
/melhoria sistema de comentários moderados nos artigos
```

---

## Regras invioláveis

1. **Sempre** fazer as 2 perguntas antes de qualquer plano
2. **Sempre** aguardar resposta do usuário antes do Passo 3
3. **Sempre** delegar para `/implementar` — nunca implementar diretamente neste command
4. O orquestrador **gerencia** a implementação — este command apenas planeja e delega
5. O plano deve respeitar todas as regras do CLAUDE.md e `.claude/rules/`

---

**Agente coordenador da implementação**: `orquestrador` (via `/implementar`)
**Agente de revisão final**: `code-reviewer` (automático, via `/implementar`)
**Referências**: `SPEC.md`, `CLAUDE.md`, `.claude/rules/`
