---
stepsCompleted: [1, 2]
inputDocuments: ["product-brief-MonitoraIA-2026-02-27.md"]
date: 2026-03-02
author: Rapha
---

# UX Design Specification MonitoraIA

**Author:** Rapha
**Date:** 2026-03-02

---

<!-- UX design content will be appended sequentially through collaborative workflow steps -->

## Executive Summary

### Project Vision

O MonitoraIA é uma plataforma de auditoria de atendimento com IA que analisa 100% das conversas dos atendentes (versus a média de 2% de amostragem humana), eliminando a "caixa preta" das interações com clientes. Não é um CRM nem uma ferramenta de BI — é um **co-piloto de gestão baseado em dados reais**, que transforma volumes massivos de conversas em direcionamentos acionáveis para gestores de operações de atendimento e vendas.

A experiência central é **proativa e fora do produto**: o gestor recebe alertas push e relatórios consolidados por e-mail/mensagem sem precisar abrir o dashboard — e quando abre, encontra um ambiente de contexto e histórico, não de análise manual.

### Target Users

**Gestor de Atendimento / Coordenador de Vendas (Primário):**
- Líder operacional sob pressão constante de metas e qualidade
- Sem tempo para garimpar dashboards complexos ou ouvir amostras de conversas
- Precisa de sinal claro e ação imediata — não de relatórios longos
- Opera majoritariamente via alertas recebidos no WhatsApp ou e-mail
- Intervém pessoalmente na operação quando acionado pela IA

**Atendentes (Não-usuário):**
- Não têm acesso à plataforma — são geridos pelos gestores com base nos dados da IA
- A experiência deles é impactada indiretamente pelas intervenções do gestor

### Key Design Challenges

1. **Experiência "fora do produto":** O principal ponto de contato com o usuário é o alerta/e-mail, não o dashboard. O app precisa ser complementar ao canal de notificação — um hub de contexto, não o palco principal.
2. **Confiança na IA:** O gestor precisa confiar na avaliação da IA para agir sem verificar manualmente cada caso. A forma como a informação é apresentada (linguagem, score, evidências) determina se ele age ou ignora.
3. **Hierarquia de criticidade:** Um sistema que alerta para tudo é ignorado. A UX precisa calibrar rigorosamente o que é crítico, importante ou informativo — sem criar fadiga de notificação.

### Design Opportunities

1. **"Notification-first" UX:** Paradigma onde o app é hub de contexto e os canais principais são push/e-mail — diferencial competitivo real frente a ferramentas tradicionais de BI e CRM.
2. **Dashboard "zero esforço":** Quando o gestor abre o app, em menos de 5 segundos ele sabe se a operação está saudável ou não — sem precisar clicar, filtrar ou interpretar gráficos.
3. **Alertas acionáveis:** Cada notificação carrega contexto claro (quem, o quê, por quê, risco) e uma ação sugerida — eliminando a ambiguidade de "e agora, o que eu faço?".
