module.exports = {
  cliente: {
    nome: "Ornata Domus",
    subdomain: "ornatadomus-bi",
    coolify_app_uuid: "w3rltjp4ch51aqvvo6003onn",
    cor_primaria: "#8B6914",
  },
  fontes: {
    adapters: ["nibo-xlsx"],
    nibo_xlsx: {
      base_file: "Base Nibo.xlsx",
      conta_filter: [],              // [] = todas as contas (Ornata Domus + Outside Box)
    },
    drive: {
      base_path: "G:/Meu Drive/BGP/CLIENTES/BI/479. ORNATA DOMUS/BASES",
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
      relatorio: "active",
      valuation: "hidden",
    },
    outros: {
      orcamento: "hidden",
      lojas: "hidden",
      risco: "hidden",
      indicators: "hidden",
      faturamento_produto: "hidden",
      curva_abc: "hidden",
      marketing: "hidden",
      hierarquia: "hidden",
      detalhado: "hidden",
      profunda_cliente: "hidden",
      crm: "hidden",
    },
  },
  meta: {
    ano_corrente: 2026,
    metas_crm: { mes: 0, ano: 0 },
    valuation_premissas: { wacc: 25, growth_year2: 20, growth_year3: 20, ipca: 4.5, perpetuity_growth: 10 },
  },
  template: { version_when_created: "1.0.0", version_last_synced: "1.0.0" },
};
