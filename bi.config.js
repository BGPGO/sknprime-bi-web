// Configuração — Grupo DEX (24 contas Omie consolidadas)
// Credenciais NÃO ficam aqui — vêm do Sheets (10dCg9c...) baixado em runtime.
module.exports = {
  cliente: {
    nome: "Grupo Demo",
    subdomain: "demo-bi",
    coolify_app_uuid: "ow97qdhlrzakhvz8fxzc4kws",
    cor_primaria: "#22d3ee",
  },

  fontes: {
    adapters: ["omie-multi"],

    omie_multi: {
      sheets_id: "10dCg9cunnS-RSQyOFTPixFpO504H814Q8woTI7w6aRw",
      concurrency: 24,                      // todas as contas em paralelo (rate limit é por App_Key)
      skip: [],                             // contas a pular (nome exato)
      only: [],                             // se preenchido, só essas contas
      cliente_label: "Grupo DEX",
      bancos_ok: [],                        // [] = aceita todos os bancos (não filtra)
    },

    drive: {
      base_path: "G:/Meu Drive/BGP/CLIENTES/BI/454. GRUPO DEX/BASES",
    },
  },

  pages: {
    geral: {
      overview: "active",
      receita: "active",
      despesa: "active",
      fluxo: "active",
      tesouraria: "active",
      comparativo: "active",
      relatorio: "active",       // liberado pro Grupo DEX
      valuation: "active",       // liberado pro Grupo DEX
    },
    outros: {
      orcamento: "active",             // tela de orçamento — análise específica
      lojas: "active",                 // ranking 24 lojas
      risco: "active",                 // HHI / concentração / risco
      indicators: "upsell",            // PRO
      faturamento_produto: "upsell",   // PRO
      curva_abc: "upsell",             // PRO
      marketing: "upsell",             // PRO
      hierarquia: "hidden",
      detalhado: "hidden",
      profunda_cliente: "hidden",
      crm: "hidden",
    },
  },

  meta: {
    ano_corrente: 2026,
    metas_crm: { mes: 1_000_000, ano: 12_000_000 },
    valuation_premissas: { wacc: 25, growth_year2: 20, growth_year3: 20, ipca: 4.5, perpetuity_growth: 10 },
  },

  template: {
    version_when_created: "1.0.0",
    version_last_synced: "1.0.0",
  },
};
