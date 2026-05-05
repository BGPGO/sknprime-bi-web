#!/usr/bin/env node
/**
 * build-data.cjs — gera data.js (window.BIT) a partir dos JSONs Omie em data/.
 *
 * Como funciona:
 *  1. Le todos os JSONs de data/ (com tolerancia a arquivos faltantes/vazios).
 *  2. Constroi mapas de resolucao (categoria, departamento, cliente).
 *  3. Para cada lancamento (contas_pagar, contas_receber):
 *      - Resolve nomes legiveis
 *      - Normaliza datas (dd/mm/aaaa -> Date)
 *      - Marca realizado (status_titulo === 'PAGO')
 *  4. Calcula 3 cortes (realizado / a_pagar_receber / tudo) com:
 *      - MONTH_DATA (12 meses do ano corrente)
 *      - RECEITA_CATEGORIAS / DESPESA_CATEGORIAS
 *      - RECEITA_CLIENTES / DESPESA_FORNECEDORES
 *      - EXTRATO (top 200 lancamentos por data desc)
 *      - Totais e KPIs
 *  5. Escreve data.js com `window.BIT = {...}` hardcoded (sem fetch async no boot).
 *
 * Tolerancia:
 *  - Se um arquivo nao existe ou esta vazio, usa array vazio e segue.
 *  - Console mostra warnings claros pra o operador.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const DATA_DIR = path.join(__dirname, 'data');
const OUT_FILE = path.join(__dirname, 'data.js');

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const MONTHS_FULL = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

// ---------- helpers ----------
function readJson(name, fallback) {
  const p = path.join(DATA_DIR, name + '.json');
  if (!fs.existsSync(p)) {
    console.warn(`  [warn] ${name}.json nao existe — usando fallback (${Array.isArray(fallback) ? 'array vazio' : 'null'})`);
    return fallback;
  }
  try {
    const raw = fs.readFileSync(p, 'utf8');
    if (!raw.trim()) {
      console.warn(`  [warn] ${name}.json vazio — usando fallback`);
      return fallback;
    }
    return JSON.parse(raw);
  } catch (e) {
    console.warn(`  [warn] ${name}.json parse falhou: ${e.message} — usando fallback`);
    return fallback;
  }
}

// dd/mm/aaaa -> Date | null
function parseBR(d) {
  if (!d || typeof d !== 'string') return null;
  const m = d.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const dt = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  if (isNaN(dt.getTime())) return null;
  return dt;
}

function fmtBR(d) {
  if (!d) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

function num(v) {
  if (v == null || v === '') return 0;
  if (typeof v === 'number') return v;
  // Omie devolve numeros como number, mas vai com cinto e suspensorio
  const s = String(v).replace(/\./g, '').replace(',', '.');
  const n = Number(s);
  return isNaN(n) ? 0 : n;
}

// ---------- carregar dados ----------
console.log('=== Lendo data/*.json ===');
const empresa = readJson('empresa', null);
const categorias = readJson('categorias', []);
const departamentos = readJson('departamentos', []);
const clientes = readJson('clientes', []);
const contasPagar = readJson('contas_pagar', []);
const contasReceber = readJson('contas_receber', []);
const movimentos = readJson('movimentos', []);
const contasCorrentes = readJson('contas_correntes', []);
const summary = readJson('_summary', null);

// Bancos aceitos — configurável via bi.config.js > fontes.omie.bancos_ok
// (ou fontes.omie_multi.bancos_ok). Lista vazia = aceita todos.
let _cfg;
try { _cfg = require('./bi.config.js'); } catch (e) { _cfg = null; }
const _bancosCfg = (_cfg?.fontes?.omie?.bancos_ok) ?? (_cfg?.fontes?.omie_multi?.bancos_ok) ?? ['033', '748', '756'];
const BANCOS_OK = new Set(_bancosCfg.map(String));
console.log(`  bancos_ok: ${BANCOS_OK.size === 0 ? '(aceita todos)' : [..._bancosCfg].join(', ')}`);
const ccOk = new Set();
for (const c of contasCorrentes) {
  if (BANCOS_OK.has(String(c.codigo_banco))) ccOk.add(String(c.nCodCC));
}
console.log(`  contas correntes filtradas (Santander/Sicredi/Sicoob): ${ccOk.size}/${contasCorrentes.length}`);

console.log(`  empresa: ${empresa ? empresa.nome_fantasia : '(faltando)'}`);
console.log(`  categorias: ${categorias.length}`);
console.log(`  departamentos: ${departamentos.length}`);
console.log(`  clientes/fornecedores: ${clientes.length}`);
console.log(`  contas_pagar: ${contasPagar.length}`);
console.log(`  contas_receber: ${contasReceber.length}`);
console.log(`  movimentos: ${movimentos.length}`);

// ---------- montar mapas ----------
const catById = new Map();
for (const c of categorias) {
  // codigo (string) eh chave em ListarCategorias
  if (c.codigo) catById.set(String(c.codigo), c);
}
const depById = new Map();
for (const d of departamentos) {
  if (d.codigo) depById.set(String(d.codigo), d);
}
const cliById = new Map();
for (const c of clientes) {
  if (c.codigo_cliente_omie) cliById.set(String(c.codigo_cliente_omie), c);
}

function getCategoriaNome(codigo) {
  if (!codigo) return 'Sem categoria';
  const c = catById.get(String(codigo));
  if (!c) return `Cat ${codigo}`;
  return c.descricao || c.descricao_categoria || `Cat ${codigo}`;
}

// Classificador inteligente de categoria → seção DRE { custo | despesa | imposto | outros }
// Customizado para o varejo do Grupo DEX (food + óptica). Heurística sobre nome
// da categoria. User pode overrider via bi.config.js > meta.categoria_overrides.
function classificarSecao(desc, overrides) {
  if (!desc) return 'outros';
  const k = String(desc).trim();
  if (overrides && overrides[k]) return overrides[k];
  const s = k.toLowerCase();

  // Outros — fora do FCF operacional (não entram no DRE de operação)
  if (/^<.*>|dispon[ií]vel/.test(s)) return 'outros';
  if (/transfer[eê]ncia/.test(s)) return 'outros';
  if (/empr[eé]stim|aplica[cç][aã]o\s+financ|distribui[cç][aã]o\s+de\s+(lucr|result)|aporte|integraliza|novas\s+opera[cç][oõ]es/.test(s)) return 'outros';
  if (/^juros\b|encargos\s+financ|multa.*atras/.test(s)) return 'outros';

  // Impostos sobre vendas / federais (NÃO inclui IPTU, INSS, FGTS — esses são despesa operacional)
  if (/\b(icms|iss|cofins|pis|tribut|iof|irpj|csll)\b/.test(s)) return 'imposto';
  if (/simples\s+nacional|\bdas\b/.test(s)) return 'imposto';

  // Custo direto — variável com vendas / CMV / produção
  if (/^compras\b|mercadoria|mat[eé]ria.prima|insumo|cmv|food\s*cost/.test(s)) return 'custo';
  if (/royalt/.test(s)) return 'custo';
  if (/repass/.test(s)) return 'custo';
  if (/^frete\b|servi[cç]os?\s+de\s+entrega/.test(s)) return 'custo';
  if (/^comiss/.test(s)) return 'custo';
  if (/devolu[cç][aã]o/.test(s)) return 'custo';
  if (/aluguel.*vari[aá]vel/.test(s)) return 'custo';
  if (/fundo\s+de\s+promo/.test(s)) return 'custo';   // royalty marketing food
  if (/^cdu\b/.test(s)) return 'custo';                // taxa CDU food (judgment)

  // Default: despesa operacional
  return 'despesa';
}

function getCategoriaNatureza(codigo) {
  // Omie: natureza pode ser "R" (receita) | "D" (despesa) | "T" (transferencia)
  const c = catById.get(String(codigo));
  return (c && (c.natureza || c.tipo_categoria)) || null;
}

function getDepartamentoNome(codigo) {
  if (!codigo) return null;
  const d = depById.get(String(codigo));
  return d ? d.descricao : `CC ${codigo}`;
}

function getClienteNome(codigo) {
  if (!codigo) return 'Sem cliente';
  const c = cliById.get(String(codigo));
  if (!c) return `Cliente ${codigo}`;
  return c.nome_fantasia || c.razao_social || `Cliente ${codigo}`;
}

// ---------- normalizar lancamentos ----------
// Estrategia: prefere ListarMovimentos (fonte canonica do PBI do cliente) por
// trazer nValPago + dDtPagamento (caixa) E nValorTitulo + dDtVenc (competencia).
// Fallback: ListarContasPagar/Receber (so competencia, sem nValPago).
function normalize(t, kind) {
  const dataVenc = parseBR(t.data_vencimento) || parseBR(t.data_previsao) || parseBR(t.data_emissao) || parseBR(t.data_entrada);
  const dataPago = parseBR(t.data_pagamento) || (t.info && parseBR(t.info.dAlt)) || dataVenc;
  const status = (t.status_titulo || '').toUpperCase();
  const realizado = status === 'PAGO' || status === 'RECEBIDO';
  const cancelado = status === 'CANCELADO';
  const valor = num(t.valor_documento);
  return {
    id: t.codigo_lancamento_omie || t.codigo_lancamento_integracao || null,
    kind,
    cliente: getClienteNome(t.codigo_cliente_fornecedor || t.codigo_cliente),
    categoria: getCategoriaNome(t.codigo_categoria),
    centroCusto: getDepartamentoNome(t.codigo_departamento || (t.distribuicao && t.distribuicao[0] && t.distribuicao[0].cCodDep)),
    data_venc: dataVenc,
    data_efetiva: realizado ? dataPago : dataVenc,
    valor,
    status,
    realizado,
    cancelado,
    nf: t.numero_documento_fiscal || '',
    parcela: t.numero_parcela || '',
  };
}

// Normaliza UMA row de ListarMovimentos aplicando "estilo conta" DAX do PBI.
//
// CRITICO: a row do TITULO e a row da BAIXA aparecem AMBAS com mesmo cStatus.
// Sem o filtro de cGrupo, contamos duplicado:
//   27.244 P|PAGO|CONTA_CORRENTE_PAG (baixa real - efetivo no caixa)
//   14.416 P|PAGO|CONTA_A_PAGAR      (titulo - apenas marca que ta pago)
// O DAX so conta se cGrupo bater com a categoria esperada:
//   Realizado receita: R + RECEBIDO + CONTA_CORRENTE_REC
//   Previsto  receita: R + (A VENCER|ATRASADO|VENCE HOJE) + CONTA_A_RECEBER
//   Realizado despesa: P + PAGO + CONTA_CORRENTE_PAG
//   Previsto  despesa: P + (A VENCER|ATRASADO|VENCE HOJE) + CONTA_A_PAGAR
// Tudo o mais (CANCELADO, PREVISAO_*, etc) -> exclui.
//
// Tambem exclui transferencias (categoria Entrada/Saida de Transferencia)
// porque sao movimentacoes internas entre contas, nao receita/despesa real.
const TRANSFERENCIA_RE = /transfer[eê]ncia/i;

function normalizeMovimento(m) {
  const d = m.detalhes || {};
  const r = m.resumo || {};
  const status = (d.cStatus || '').toUpperCase();
  const natureza = d.cNatureza || '';
  const grupo = d.cGrupo || '';
  // Filtro DAX estilo conta — combinacao natureza × status × grupo precisa bater.
  let realizado = null;
  if (natureza === 'R' && status === 'RECEBIDO' && grupo === 'CONTA_CORRENTE_REC') realizado = true;
  else if (natureza === 'R' && (status === 'A VENCER' || status === 'ATRASADO' || status === 'VENCE HOJE') && grupo === 'CONTA_A_RECEBER') realizado = false;
  else if (natureza === 'P' && status === 'PAGO' && grupo === 'CONTA_CORRENTE_PAG') realizado = true;
  else if (natureza === 'P' && (status === 'A VENCER' || status === 'ATRASADO' || status === 'VENCE HOJE') && grupo === 'CONTA_A_PAGAR') realizado = false;
  else return null; // CANCELADO, PREVISAO, ou combinacao espuria - exclui

  // Filtro transferencias entre contas (nao sao receita/despesa real)
  const categoria = getCategoriaNome(d.cCodCateg);
  if (TRANSFERENCIA_RE.test(categoria)) return null;

  // Filtro contas correntes: apenas bancos formais (Santander/Sicredi/Sicoob).
  // Operacional interno (Caixa, adiantamentos de viagem, contas de socio) fica fora.
  if (ccOk.size && !ccOk.has(String(d.nCodCC))) return null;

  const dataPago = parseBR(d.dDtPagamento);
  const dataVenc = parseBR(d.dDtVenc) || parseBR(d.dDtPrevisao) || parseBR(d.dDtEmissao);
  const data_efetiva = realizado ? (dataPago || dataVenc) : dataVenc;
  if (!data_efetiva) return null;
  // Valor: realizado = nValPago (caixa). Previsto = nValAberto (saldo nao pago).
  let valor = realizado ? num(r.nValPago) : (num(r.nValAberto) || num(d.nValorTitulo));
  if (!valor && !realizado) valor = num(d.nValorTitulo);
  if (!valor) return null;
  const dept = (m.departamentos && m.departamentos[0] && m.departamentos[0].cCodDepartamento) || null;
  return {
    id: d.nCodTitulo || null,
    kind: natureza === 'R' ? 'receita' : 'despesa',
    cliente: getClienteNome(d.nCodCliente),
    categoria,
    centroCusto: getDepartamentoNome(dept),
    data_venc: dataVenc,
    data_efetiva,
    valor: Math.abs(valor),
    status,
    realizado,
    cancelado: false,
    grupo,
    nf: d.cNumDocFiscal || '',
    parcela: d.cNumParcela || '',
    conta: m._conta || '',                  // ← multi-conta: nome da loja/empresa
    conta_slug: m._conta_slug || '',
    cliente_grupo: m._cliente_grupo || '',
    secao: natureza === 'R' ? 'receita' : classificarSecao(categoria, _categoriaOverrides),
  };
}

// Carrega overrides do bi.config.js > meta.categoria_overrides
const _categoriaOverrides = (_cfg?.meta?.categoria_overrides) || {};

console.log('\n=== Normalizando lancamentos ===');
let recNorm, despNorm, dataSource;
if (movimentos.length > 1000) {
  // Source canonica: ListarMovimentos. Bate 100% com PBI personalizado.
  dataSource = 'movimentos';
  const allMovs = movimentos.map(normalizeMovimento).filter(Boolean);
  recNorm = allMovs.filter((t) => t.kind === 'receita');
  despNorm = allMovs.filter((t) => t.kind === 'despesa');
  console.log(`  fonte: ListarMovimentos (${movimentos.length} rows brutos -> ${allMovs.length} validos)`);
} else {
  // Fallback: ListarContasPagar/Receber. So bate competencia.
  dataSource = 'contas_pagar_receber';
  recNorm = contasReceber.map((t) => normalize(t, 'receita')).filter((t) => !t.cancelado);
  despNorm = contasPagar.map((t) => normalize(t, 'despesa')).filter((t) => !t.cancelado);
  console.log(`  fonte: contas_pagar/receber (sem nValPago — pode divergir do PBI no caixa)`);
}
console.log(`  receitas validas: ${recNorm.length}`);
console.log(`  despesas validas: ${despNorm.length}`);

// ---------- decidir ano de referencia ----------
// Default: ANO CORRENTE (operador quer ver o que ta acontecendo agora).
// Tambem expomos lista de anos disponiveis pro selector no header.
const yearCount = {};
for (const t of [...recNorm, ...despNorm]) {
  if (!t.data_efetiva) continue;
  const y = t.data_efetiva.getFullYear();
  yearCount[y] = (yearCount[y] || 0) + 1;
}
const REF_YEAR = new Date().getFullYear();
const AVAILABLE_YEARS = Object.keys(yearCount).map(Number).sort((a, b) => b - a);
console.log(`  ano de referencia: ${REF_YEAR} | anos disponiveis: ${AVAILABLE_YEARS.join(', ')}`);

// ============================================================
// DRE mensal (REF_YEAR) + ORCAMENTO
// ============================================================
// MONTH_DRE[0..11] = { m, receita, custo, despesa, imposto, outros, liquido, count }
// Considera APENAS movimentos REALIZADOS no REF_YEAR (caixa real, comparável com fin40).
const MONTH_DRE = MONTHS_FULL.map(m => ({ m, receita: 0, custo: 0, despesa: 0, imposto: 0, outros: 0, liquido: 0, count: 0 }));
const monthsTouched = new Set();
for (const t of [...recNorm, ...despNorm]) {
  if (!t.realizado || !t.data_efetiva) continue;
  if (t.data_efetiva.getFullYear() !== REF_YEAR) continue;
  const mIdx = t.data_efetiva.getMonth();
  monthsTouched.add(mIdx);
  const md = MONTH_DRE[mIdx];
  if (t.kind === 'receita') md.receita += t.valor;
  else {
    const sec = t.secao || 'despesa';
    if (sec === 'custo') md.custo += t.valor;
    else if (sec === 'imposto') md.imposto += t.valor;
    else if (sec === 'outros') md.outros += t.valor;
    else md.despesa += t.valor;
  }
  md.count += 1;
}
for (const md of MONTH_DRE) md.liquido = md.receita - md.custo - md.imposto - md.despesa;

// Mostra log da classificação (audit pro user)
const _classCounts = { custo: 0, despesa: 0, imposto: 0, outros: 0 };
const _classValor = { custo: 0, despesa: 0, imposto: 0, outros: 0 };
for (const t of despNorm) {
  if (!t.realizado || !t.data_efetiva || t.data_efetiva.getFullYear() !== REF_YEAR) continue;
  const sec = t.secao || 'despesa';
  _classCounts[sec] = (_classCounts[sec] || 0) + 1;
  _classValor[sec] = (_classValor[sec] || 0) + t.valor;
}
console.log(`  classificacao DRE (${REF_YEAR} realizado):`);
console.log(`    custo:    R$ ${_classValor.custo.toFixed(2).padStart(15)} (${_classCounts.custo} mov)`);
console.log(`    despesa:  R$ ${_classValor.despesa.toFixed(2).padStart(15)} (${_classCounts.despesa} mov)`);
console.log(`    imposto:  R$ ${_classValor.imposto.toFixed(2).padStart(15)} (${_classCounts.imposto} mov)`);
console.log(`    outros:   R$ ${_classValor.outros.toFixed(2).padStart(15)} (${_classCounts.outros} mov, fora FCF)`);

// ORCAMENTO conforme regra do user:
//   receita_mes_orcado = MELHOR mês de receita do histórico do REF_YEAR
//   custo_mes_orcado   = MEDIA dos meses com movimento (não conta meses zerados)
//   despesa_mes_orcado = MEDIA dos meses com movimento
//   imposto_mes_orcado = MEDIA dos meses com movimento
const _activeMonths = MONTH_DRE.filter(m => m.count > 0);
const _N = Math.max(1, _activeMonths.length);
const ORCAMENTO = {
  receita_mes: Math.max(...MONTH_DRE.map(m => m.receita), 0),    // melhor mês
  custo_mes:   _activeMonths.reduce((s, m) => s + m.custo, 0)   / _N,  // média
  despesa_mes: _activeMonths.reduce((s, m) => s + m.despesa, 0) / _N,
  imposto_mes: _activeMonths.reduce((s, m) => s + m.imposto, 0) / _N,
  meses_ativos: _activeMonths.length,
  melhor_mes_idx: MONTH_DRE.reduce((bi, m, i, a) => m.receita > a[bi].receita ? i : bi, 0),
};
ORCAMENTO.liquido_mes = ORCAMENTO.receita_mes - ORCAMENTO.custo_mes - ORCAMENTO.imposto_mes - ORCAMENTO.despesa_mes;
ORCAMENTO.receita_ano = ORCAMENTO.receita_mes * 12;
ORCAMENTO.custo_ano   = ORCAMENTO.custo_mes   * 12;
ORCAMENTO.despesa_ano = ORCAMENTO.despesa_mes * 12;
ORCAMENTO.imposto_ano = ORCAMENTO.imposto_mes * 12;
ORCAMENTO.liquido_ano = ORCAMENTO.liquido_mes * 12;
console.log(`  ORCAMENTO mensal (regra: receita=melhor mes, demais=media):`);
console.log(`    Receita orcada: R$ ${ORCAMENTO.receita_mes.toFixed(2)} (mes ${MONTHS[ORCAMENTO.melhor_mes_idx]})`);
console.log(`    Custo medio:    R$ ${ORCAMENTO.custo_mes.toFixed(2)}`);
console.log(`    Despesa media:  R$ ${ORCAMENTO.despesa_mes.toFixed(2)}`);
console.log(`    Imposto medio:  R$ ${ORCAMENTO.imposto_mes.toFixed(2)}`);
console.log(`    Liquido orcado: R$ ${ORCAMENTO.liquido_mes.toFixed(2)} (anual R$ ${ORCAMENTO.liquido_ano.toFixed(2)})`);

// DRE_BY_CONTA: mesma estrutura (MONTH_DRE + ORCAMENTO) por conta_slug.
// Permite que telas de Orçamento/Valuation funcionem com filtro de empresa
// sem precisar recomputar no browser (56k movs × N filters seria caro).
const DRE_BY_CONTA = {};
const _slugSet = new Set([...recNorm, ...despNorm].map(t => t.conta_slug).filter(Boolean));
for (const slug of _slugSet) {
  const dre = MONTHS_FULL.map(m => ({ m, receita: 0, custo: 0, despesa: 0, imposto: 0, outros: 0, liquido: 0, count: 0 }));
  let label = slug;
  for (const t of [...recNorm, ...despNorm]) {
    if (t.conta_slug !== slug) continue;
    if (!t.realizado || !t.data_efetiva) continue;
    if (t.data_efetiva.getFullYear() !== REF_YEAR) continue;
    const mIdx = t.data_efetiva.getMonth();
    const md = dre[mIdx];
    if (t.kind === 'receita') md.receita += t.valor;
    else {
      const sec = t.secao || 'despesa';
      if (sec === 'custo') md.custo += t.valor;
      else if (sec === 'imposto') md.imposto += t.valor;
      else if (sec === 'outros') md.outros += t.valor;
      else md.despesa += t.valor;
    }
    md.count += 1;
    if (t.conta && !label.includes(t.conta)) label = t.conta;
  }
  for (const md of dre) md.liquido = md.receita - md.custo - md.imposto - md.despesa;
  const active = dre.filter(m => m.count > 0);
  const N = Math.max(1, active.length);
  const orc = {
    receita_mes: Math.max(...dre.map(m => m.receita), 0),
    custo_mes:   active.reduce((s,m)=>s+m.custo, 0)/N,
    despesa_mes: active.reduce((s,m)=>s+m.despesa, 0)/N,
    imposto_mes: active.reduce((s,m)=>s+m.imposto, 0)/N,
    meses_ativos: active.length,
    melhor_mes_idx: dre.reduce((bi,m,i,a)=>m.receita>a[bi].receita?i:bi, 0),
  };
  orc.liquido_mes = orc.receita_mes - orc.custo_mes - orc.imposto_mes - orc.despesa_mes;
  orc.receita_ano = orc.receita_mes * 12;
  orc.custo_ano   = orc.custo_mes * 12;
  orc.despesa_ano = orc.despesa_mes * 12;
  orc.imposto_ano = orc.imposto_mes * 12;
  orc.liquido_ano = orc.liquido_mes * 12;
  DRE_BY_CONTA[slug] = { label, MONTH_DRE: dre, ORCAMENTO: orc };
}
console.log(`  DRE_BY_CONTA: ${Object.keys(DRE_BY_CONTA).length} contas pre-computadas`);

// ---------- segmentos por filtro ----------
function selectByFilter(items, filter) {
  // 'realizado'      => status PAGO/RECEBIDO
  // 'a_pagar_receber'=> status A VENCER, ATRASADO, VENCE HOJE (nao pago)
  // 'tudo'           => tudo (exceto CANCELADO, ja filtrado antes)
  if (filter === 'realizado') return items.filter((t) => t.realizado);
  if (filter === 'a_pagar_receber') return items.filter((t) => !t.realizado);
  return items;
}

// ---------- agregacoes ----------
function buildMonthData(rec, desp, year) {
  const data = MONTHS_FULL.map((m) => ({ m, receita: 0, despesa: 0 }));
  for (const t of rec) {
    const d = t.data_efetiva;
    if (!d || d.getFullYear() !== year) continue;
    data[d.getMonth()].receita += t.valor;
  }
  for (const t of desp) {
    const d = t.data_efetiva;
    if (!d || d.getFullYear() !== year) continue;
    data[d.getMonth()].despesa += t.valor;
  }
  return data;
}

function buildCategoriaAgg(items, year, kindLabel) {
  const map = new Map();
  for (const t of items) {
    const d = t.data_efetiva;
    if (year && d && d.getFullYear() !== year) continue;
    const k = t.categoria;
    if (!map.has(k)) map.set(k, { name: k, value: 0, count: 0, clientesSet: new Set() });
    const obj = map.get(k);
    obj.value += t.valor;
    obj.count += 1;
    obj.clientesSet.add(t.cliente);
  }
  const out = [];
  for (const v of map.values()) {
    const o = { name: v.name, value: v.value };
    if (kindLabel === 'receita') o.clientes = v.clientesSet.size;
    else o.fornecedores = v.clientesSet.size;
    out.push(o);
  }
  return out.sort((a, b) => b.value - a.value).slice(0, 12);
}

function buildClienteAgg(items, year) {
  const map = new Map();
  for (const t of items) {
    const d = t.data_efetiva;
    if (year && d && d.getFullYear() !== year) continue;
    const k = t.cliente;
    if (!map.has(k)) map.set(k, { name: k, value: 0 });
    map.get(k).value += t.valor;
  }
  return Array.from(map.values()).sort((a, b) => b.value - a.value).slice(0, 12);
}

function buildExtrato(rec, desp, limit = 200) {
  // tupla compativel com mock: [data, cc, categoria, cliente, valor, status]
  const all = [], recArr = [], despArr = [];
  for (const t of rec) {
    const r = [fmtBR(t.data_efetiva), t.centroCusto || 'Operações', t.categoria, t.cliente, t.valor, t.status];
    all.push(r); recArr.push(r);
  }
  for (const t of desp) {
    const r = [fmtBR(t.data_efetiva), t.centroCusto || 'Operações', t.categoria, t.cliente, -t.valor, t.status];
    all.push(r); despArr.push(r);
  }
  // sort por data desc
  const sortDesc = (a, b) => {
    const [da, ma, ya] = (a[0] || '01/01/1970').split('/').map(Number);
    const [db, mb, yb] = (b[0] || '01/01/1970').split('/').map(Number);
    return new Date(yb, mb - 1, db) - new Date(ya, ma - 1, da);
  };
  all.sort(sortDesc); recArr.sort(sortDesc); despArr.sort(sortDesc);
  return {
    EXTRATO: all.slice(0, limit),
    EXTRATO_RECEITAS: recArr.slice(0, limit),
    EXTRATO_DESPESAS: despArr.slice(0, limit),
  };
}

function buildKpis(monthData) {
  const TOTAL_RECEITA = monthData.reduce((s, x) => s + x.receita, 0);
  const TOTAL_DESPESA = monthData.reduce((s, x) => s + x.despesa, 0);
  const VALOR_LIQUIDO = TOTAL_RECEITA - TOTAL_DESPESA;
  const MARGEM_LIQUIDA = TOTAL_RECEITA > 0 ? (VALOR_LIQUIDO / TOTAL_RECEITA) * 100 : 0;
  // Heuristicas — sem dados reais de impostos/capex separados, estimamos via categorias
  const VALOR_LIQ_SERIES = monthData.map((m) => m.receita - m.despesa);
  return { TOTAL_RECEITA, TOTAL_DESPESA, VALOR_LIQUIDO, MARGEM_LIQUIDA, VALOR_LIQ_SERIES };
}

function buildSegment(rec, desp, year, label) {
  const r = selectByFilter(rec, label);
  const d = selectByFilter(desp, label);
  const MONTH_DATA = buildMonthData(r, d, year);
  const RECEITA_CATEGORIAS = buildCategoriaAgg(r, year, 'receita');
  const DESPESA_CATEGORIAS = buildCategoriaAgg(d, year, 'despesa');
  const RECEITA_CLIENTES = buildClienteAgg(r, year);
  const DESPESA_FORNECEDORES = buildClienteAgg(d, year);
  const extOut = buildExtrato(r, d, 200);
  const EXTRATO = extOut.EXTRATO;
  const EXTRATO_RECEITAS = extOut.EXTRATO_RECEITAS;
  const EXTRATO_DESPESAS = extOut.EXTRATO_DESPESAS;
  const KPIS = buildKpis(MONTH_DATA);
  // count de lancamentos por mes (pra DailyBars/RECEITA_DIA usar como proxy)
  const RECEITA_DIA = Array(31).fill(0);
  const DESPESA_DIA = Array(31).fill(0);
  for (const t of r) {
    const dt = t.data_efetiva;
    if (!dt || dt.getFullYear() !== year) continue;
    RECEITA_DIA[dt.getDate() - 1] += t.valor;
  }
  for (const t of d) {
    const dt = t.data_efetiva;
    if (!dt || dt.getFullYear() !== year) continue;
    DESPESA_DIA[dt.getDate() - 1] += t.valor;
  }
  // saldos cumulativos
  const SALDOS_MES = [];
  let saldo = 0;
  for (const m of MONTH_DATA) {
    saldo += m.receita - m.despesa;
    SALDOS_MES.push(saldo);
  }
  // FLUXO horizontal (top 5 categorias receita / top 5 despesa)
  const FLUXO_RECEITA = RECEITA_CATEGORIAS.slice(0, 5).map((cat) => ({
    cat: cat.name,
    values: MONTHS_FULL.map((mn, mi) => {
      let s = 0;
      for (const t of r) {
        const dt = t.data_efetiva;
        if (!dt || dt.getFullYear() !== year) continue;
        if (dt.getMonth() !== mi) continue;
        if (t.categoria !== cat.name) continue;
        s += t.valor;
      }
      return s;
    }),
  }));
  const FLUXO_DESPESA = DESPESA_CATEGORIAS.slice(0, 5).map((cat) => ({
    cat: cat.name,
    values: MONTHS_FULL.map((mn, mi) => {
      let s = 0;
      for (const t of d) {
        const dt = t.data_efetiva;
        if (!dt || dt.getFullYear() !== year) continue;
        if (dt.getMonth() !== mi) continue;
        if (t.categoria !== cat.name) continue;
        s -= t.valor;
      }
      return s;
    }),
  }));
  // Comparativo: trim1 vs trim2 do ano corrente
  const buildTrimAgg = (items, mStart, mEnd) => {
    const map = new Map();
    let total = 0;
    for (const t of items) {
      const dt = t.data_efetiva;
      if (!dt || dt.getFullYear() !== year) continue;
      if (dt.getMonth() < mStart || dt.getMonth() > mEnd) continue;
      const k = t.categoria;
      map.set(k, (map.get(k) || 0) + t.valor);
      total += t.valor;
    }
    return { map, total };
  };
  const recT1 = buildTrimAgg(r, 0, 2), recT2 = buildTrimAgg(r, 3, 5);
  const despT1 = buildTrimAgg(d, 0, 2), despT2 = buildTrimAgg(d, 3, 5);
  const COMP_DATA = [
    { tipo: 'Receita', isHeader: true, d1: recT1.total, d2: recT2.total },
  ];
  const allRecCats = new Set([...recT1.map.keys(), ...recT2.map.keys()]);
  for (const k of allRecCats) {
    COMP_DATA.push({ tipo: k, parent: 'Receita', d1: recT1.map.get(k) || 0, d2: recT2.map.get(k) || 0 });
  }
  COMP_DATA.push({ tipo: 'Despesa', isHeader: true, d1: -despT1.total, d2: -despT2.total });
  const allDespCats = new Set([...despT1.map.keys(), ...despT2.map.keys()]);
  for (const k of allDespCats) {
    COMP_DATA.push({ tipo: k, parent: 'Despesa', d1: -(despT1.map.get(k) || 0), d2: -(despT2.map.get(k) || 0) });
  }
  return {
    MONTH_DATA, RECEITA_CATEGORIAS, DESPESA_CATEGORIAS,
    RECEITA_CLIENTES, DESPESA_FORNECEDORES, EXTRATO,
    EXTRATO_RECEITAS, EXTRATO_DESPESAS,
    KPIS, RECEITA_DIA, DESPESA_DIA, SALDOS_MES,
    FLUXO_RECEITA, FLUXO_DESPESA, COMP_DATA,
  };
}

console.log('\n=== Construindo segmentos (realizado / a_pagar_receber / tudo) ===');
const realizado = buildSegment(recNorm, despNorm, REF_YEAR, 'realizado');
const a_pagar_receber = buildSegment(recNorm, despNorm, REF_YEAR, 'a_pagar_receber');
const tudo = buildSegment(recNorm, despNorm, REF_YEAR, 'tudo');

console.log(`  realizado: receita=${realizado.KPIS.TOTAL_RECEITA.toFixed(2)} despesa=${realizado.KPIS.TOTAL_DESPESA.toFixed(2)} liq=${realizado.KPIS.VALOR_LIQUIDO.toFixed(2)}`);
console.log(`  a_pagar:   receita=${a_pagar_receber.KPIS.TOTAL_RECEITA.toFixed(2)} despesa=${a_pagar_receber.KPIS.TOTAL_DESPESA.toFixed(2)}`);
console.log(`  tudo:      receita=${tudo.KPIS.TOTAL_RECEITA.toFixed(2)} despesa=${tudo.KPIS.TOTAL_DESPESA.toFixed(2)}`);

// ---------- meta + posicao caixa (placeholder) ----------
const meta = {
  empresa: empresa ? {
    nome_fantasia: empresa.nome_fantasia,
    razao_social: empresa.razao_social,
    cnpj: empresa.cnpj,
    cidade: empresa.cidade,
  } : null,
  fetched_at: summary ? summary.fetched_at : null,
  ref_year: REF_YEAR,
  counts: {
    contas_pagar: contasPagar.length,
    contas_receber: contasReceber.length,
    categorias: categorias.length,
    departamentos: departamentos.length,
    clientes: clientes.length,
  },
};

// Posicao caixa: nao temos dados de saldo bancario direto. Usamos saldo_acumulado do realizado.
const POSICAO_CAIXA = [
  { name: 'Saldo realizado YTD', value: realizado.KPIS.VALOR_LIQUIDO },
  { name: 'A receber (futuro)', value: a_pagar_receber.KPIS.TOTAL_RECEITA },
  { name: 'A pagar (futuro)', value: a_pagar_receber.KPIS.TOTAL_DESPESA },
];

// CONTAS: metadata por loja/empresa — TODAS as 24 contas extraídas (independente
// de terem movimento realizado no ano). Permite filtrar por qualquer uma no
// header mesmo se zerada no período corrente. Receita/despesa são do REF_YEAR
// realizado, pra ordenar por relevância.
const _contasMap = new Map();
// Primeiro pass: registra TODAS as contas que vieram da extração (todos os movimentos, mesmo previstos)
for (const t of [...recNorm, ...despNorm]) {
  if (!t.conta_slug) continue;
  if (!_contasMap.has(t.conta_slug)) {
    _contasMap.set(t.conta_slug, {
      slug: t.conta_slug,
      label: t.conta,
      cliente_grupo: t.cliente_grupo || '',
      receita: 0, despesa: 0, count: 0,
    });
  }
}
// Segundo pass: agrega receita/despesa SÓ realizado no REF_YEAR (pra ordenação)
for (const t of [...recNorm, ...despNorm]) {
  if (!t.conta_slug || !t.realizado) continue;
  if (!t.data_efetiva || t.data_efetiva.getFullYear() !== REF_YEAR) continue;
  const o = _contasMap.get(t.conta_slug);
  if (!o) continue;
  if (t.kind === 'receita') o.receita += t.valor;
  else o.despesa += t.valor;
  o.count += 1;
}
const CONTAS = Array.from(_contasMap.values())
  .map(c => ({ ...c, liquido: c.receita - c.despesa, margem: c.receita > 0 ? ((c.receita - c.despesa) / c.receita) * 100 : 0 }))
  .sort((a, b) => a.label.localeCompare(b.label));   // ordem alfabetica pro select
console.log(`  CONTAS metadata: ${CONTAS.length} contas (com ou sem realizado em ${REF_YEAR})`);

const COMPOSICAO_DESPESA = realizado.DESPESA_CATEGORIAS.slice(0, 6).map((c, i) => ({
  name: c.name,
  value: c.value,
  color: ['#2dd4bf', '#22c55e', '#a78bfa', '#f59e0b', '#ef4444', '#6b7686'][i] || '#6b7686',
}));

// ---------- escrever data.js ----------
const DATA_JS = `/* BGP BI — gerado por build-data.cjs em ${new Date().toISOString()} */
/* Empresa: ${meta.empresa ? meta.empresa.nome_fantasia : '(faltando)'} | Ano ref: ${REF_YEAR} */
const MONTHS = ${JSON.stringify(MONTHS)};
const MONTHS_FULL = ${JSON.stringify(MONTHS_FULL)};

function fmt(n, opts = {}) {
  const { dec = 2, prefix = "R$", showSign = false } = opts;
  const sign = n < 0 ? "-" : (showSign ? "+" : "");
  const abs = Math.abs(n);
  const parts = abs.toFixed(dec).split(".");
  parts[0] = parts[0].replace(/\\B(?=(\\d{3})+(?!\\d))/g, ".");
  return \`\${sign}\${prefix}\${parts.join(",")}\`;
}
function fmtK(n) {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1e6) return \`\${sign}R$\${(abs / 1e6).toFixed(2).replace(".", ",")} M\`;
  if (abs >= 1e3) return \`\${sign}R$\${(abs / 1e3).toFixed(2).replace(".", ",")} K\`;
  return \`\${sign}R$\${abs.toFixed(0)}\`;
}
function fmtPct(n, dec = 2) {
  const sign = n > 0 ? "+" : (n < 0 ? "-" : "");
  return \`\${sign}\${Math.abs(n).toFixed(dec).replace(".", ",")}%\`;
}

const META = ${JSON.stringify(meta, null, 2)};
const POSICAO_CAIXA = ${JSON.stringify(POSICAO_CAIXA, null, 2)};
const COMPOSICAO_DESPESA = ${JSON.stringify(COMPOSICAO_DESPESA, null, 2)};
const CONTAS = ${JSON.stringify(CONTAS, null, 2)};
const MONTH_DRE = ${JSON.stringify(MONTH_DRE, null, 2)};
const ORCAMENTO = ${JSON.stringify(ORCAMENTO, null, 2)};
const DRE_BY_CONTA = ${JSON.stringify(DRE_BY_CONTA)};

const SEGMENTS = ${JSON.stringify({ realizado, a_pagar_receber, tudo }, null, 2)};

// ALL_TX: lista flat de TODAS as transacoes normalizadas (despesa + receita,
// realizadas + a pagar + canceladas excluidas). Usada pra cross-filter real
// — pagina recalcula KPIs/charts/tabelas em runtime via aggregateTx().
// Cada row eh tupla compacta pra reduzir tamanho do bundle:
// [kind, mes, dia, categoria, cliente, valor, realizado, fornecedor, centroCusto, conta_slug]
const ALL_TX = ${JSON.stringify([
  ...recNorm.map(t => [
    'r',
    t.data_efetiva ? t.data_efetiva.toISOString().slice(0,7) : '',
    t.data_efetiva ? t.data_efetiva.getDate() : 0,
    t.categoria,
    t.cliente,
    t.valor,
    t.realizado ? 1 : 0,
    '',
    t.centroCusto || '',
    t.conta_slug || '',
  ]),
  ...despNorm.map(t => [
    'd',
    t.data_efetiva ? t.data_efetiva.toISOString().slice(0,7) : '',
    t.data_efetiva ? t.data_efetiva.getDate() : 0,
    t.categoria,
    '',
    t.valor,
    t.realizado ? 1 : 0,
    t.cliente,
    t.centroCusto || '',
    t.conta_slug || '',
  ]),
])};

const REF_YEAR = ${REF_YEAR};
const AVAILABLE_YEARS = ${JSON.stringify(AVAILABLE_YEARS)};

// aggregateTx: recomputa MONTH_DATA, KPIS, top categorias/clientes/fornecedores
// e EXTRATO a partir de uma lista filtrada de transacoes. Chamada pelas Pages
// quando drilldown ou statusFilter estao ativos.
function aggregateTx(txList, year) {
  year = year || REF_YEAR;
  const months = ${JSON.stringify(MONTHS_FULL)};
  const MONTH_DATA = months.map(m => ({ m, receita: 0, despesa: 0 }));
  const recCat = new Map(), despCat = new Map();
  const recCli = new Map(), despForn = new Map();
  const extratoArr = [];
  const extratoRecArr = [], extratoDespArr = [];
  let totalReceita = 0, totalDespesa = 0;

  for (const row of txList) {
    const [kind, mes, dia, categoria, cliente, valor, realizado, fornecedor, cc] = row;
    if (!mes) continue;
    const ymonth = mes.slice(0,4);
    if (Number(ymonth) !== year) continue;
    const mIdx = parseInt(mes.slice(5,7), 10) - 1;
    if (mIdx < 0 || mIdx > 11) continue;
    if (kind === 'r') {
      MONTH_DATA[mIdx].receita += valor;
      totalReceita += valor;
      recCat.set(categoria, (recCat.get(categoria) || 0) + valor);
      if (cliente) recCli.set(cliente, (recCli.get(cliente) || 0) + valor);
    } else {
      MONTH_DATA[mIdx].despesa += valor;
      totalDespesa += valor;
      despCat.set(categoria, (despCat.get(categoria) || 0) + valor);
      if (fornecedor) despForn.set(fornecedor, (despForn.get(fornecedor) || 0) + valor);
    }
    // Extrato compacto pra tabela (renomeado pra extRow porque outer for já usa 'row')
    const dataStr = String(dia).padStart(2,'0') + '/' + mes.slice(5,7) + '/' + mes.slice(0,4);
    const extRow = [dataStr, cc || 'Operações', categoria, kind === 'r' ? cliente : fornecedor, kind === 'r' ? valor : -valor, realizado ? 'PAGO' : ''];
    extratoArr.push(extRow);
    if (kind === 'r') extratoRecArr.push(extRow); else extratoDespArr.push(extRow);
  }

  // sort por data desc (string DD/MM/YYYY → Date) — aplica nos 3 arrays
  const sortByDateDesc = (a, b) => {
    const [da,ma,ya] = a[0].split('/').map(Number);
    const [db,mb,yb] = b[0].split('/').map(Number);
    return new Date(yb,mb-1,db) - new Date(ya,ma-1,da);
  };
  extratoArr.sort(sortByDateDesc);
  extratoRecArr.sort(sortByDateDesc);
  extratoDespArr.sort(sortByDateDesc);

  const topN = (mp, n) => Array.from(mp.entries()).map(([name,value]) => ({name,value})).sort((a,b)=>b.value-a.value).slice(0,n);
  const VALOR_LIQUIDO = totalReceita - totalDespesa;
  const MARGEM_LIQUIDA = totalReceita > 0 ? (VALOR_LIQUIDO / totalReceita) * 100 : 0;

  return {
    MONTH_DATA,
    RECEITA_CATEGORIAS: topN(recCat, 12),
    DESPESA_CATEGORIAS: topN(despCat, 12),
    RECEITA_CLIENTES: topN(recCli, 12),
    DESPESA_FORNECEDORES: topN(despForn, 12),
    EXTRATO: extratoArr.slice(0, 200),
    EXTRATO_RECEITAS: extratoRecArr.slice(0, 200),
    EXTRATO_DESPESAS: extratoDespArr.slice(0, 200),
    KPIS: {
      TOTAL_RECEITA: totalReceita,
      TOTAL_DESPESA: totalDespesa,
      VALOR_LIQUIDO,
      MARGEM_LIQUIDA,
      VALOR_LIQ_SERIES: MONTH_DATA.map(m => m.receita - m.despesa),
    },
  };
}

// applyDrilldown: filtra ALL_TX baseado em statusFilter + drilldown.
// statusFilter: 'realizado' | 'a_pagar_receber' | 'tudo'
// drilldown: null | { type: 'mes'|'categoria'|'cliente'|'fornecedor'|'conta', value: ... }
function filterTx(allTx, statusFilter, drilldown) {
  let out = allTx;
  if (statusFilter === 'realizado') out = out.filter(r => r[6] === 1);
  else if (statusFilter === 'a_pagar_receber') out = out.filter(r => r[6] === 0);
  if (drilldown) {
    if (drilldown.type === 'mes') out = out.filter(r => r[1] === drilldown.value);
    else if (drilldown.type === 'categoria') out = out.filter(r => r[3] === drilldown.value);
    else if (drilldown.type === 'cliente') out = out.filter(r => r[0] === 'r' && r[4] === drilldown.value);
    else if (drilldown.type === 'fornecedor') out = out.filter(r => r[0] === 'd' && r[7] === drilldown.value);
    else if (drilldown.type === 'conta') out = out.filter(r => r[9] === drilldown.value);
  }
  return out;
}

// Sintetiza um BIT "flat" baseado no filtro escolhido (window.BIT_FILTER).
// Default: 'realizado' (PAGO).
function _makeBit(filter) {
  const seg = SEGMENTS[filter] || SEGMENTS.realizado;
  const K = seg.KPIS;
  const indicadores = {
    TOTAL_RECEITA: K.TOTAL_RECEITA,
    TOTAL_DESPESA: K.TOTAL_DESPESA,
    VALOR_LIQUIDO: K.VALOR_LIQUIDO,
    MARGEM_LIQUIDA: K.MARGEM_LIQUIDA,
    IMPOSTOS: 0,
    EBITDA: K.VALOR_LIQUIDO,
    RESULTADO_OPERACIONAL: K.VALOR_LIQUIDO,
    CAPEX: 0,
    MARGEM_CONTRIB: K.MARGEM_LIQUIDA,
    EBITDA_PCT: K.MARGEM_LIQUIDA,
    IMPOSTOS_PCT: 0,
  };
  return Object.assign({
    META, POSICAO_CAIXA, COMPOSICAO_DESPESA, CONTAS, MONTH_DRE, ORCAMENTO, DRE_BY_CONTA,
    MONTHS, MONTHS_FULL, fmt, fmtK, fmtPct,
    SEGMENTS,
    MONTH_DATA: seg.MONTH_DATA,
    RECEITA_CATEGORIAS: seg.RECEITA_CATEGORIAS,
    DESPESA_CATEGORIAS: seg.DESPESA_CATEGORIAS,
    RECEITA_CLIENTES: seg.RECEITA_CLIENTES,
    DESPESA_FORNECEDORES: seg.DESPESA_FORNECEDORES,
    EXTRATO: seg.EXTRATO,
    DIAS: Array.from({ length: 31 }, (_, i) => i + 1),
    RECEITA_DIA: seg.RECEITA_DIA,
    DESPESA_DIA: seg.DESPESA_DIA,
    SALDOS_MES: seg.SALDOS_MES,
    VALOR_LIQ_SERIES: K.VALOR_LIQ_SERIES,
    FLUXO_RECEITA: seg.FLUXO_RECEITA,
    FLUXO_DESPESA: seg.FLUXO_DESPESA,
    COMP_DATA: seg.COMP_DATA,
    RECDESP_AREA: seg.MONTH_DATA.map(m => ({ m: m.m.slice(0,3), receita: m.receita, despesa: m.despesa })),
  }, indicadores);
}

window.BIT = _makeBit(window.BIT_FILTER || 'realizado');
window._makeBit = _makeBit;
window.BIT_SEGMENTS = SEGMENTS;
window.BIT_META = META;
window.ALL_TX = ALL_TX;
window.REF_YEAR = REF_YEAR;
window.AVAILABLE_YEARS = AVAILABLE_YEARS;
window.aggregateTx = aggregateTx;
window.filterTx = filterTx;
// getBit: SEMPRE recomputa via recomputeBit (sem cache de window.BIT).
// Evita lag no toggle Previsto/Realizado e suporta year/month arbitrario.
// month: 0 = ano completo, 1-12 = mes especifico.
window.getBit = function (statusFilter, drilldown, year, month) {
  const sf = statusFilter || window.BIT_FILTER || 'realizado';
  const y = year || window.REF_YEAR;
  let dd = drilldown;
  if (!dd && month && month >= 1 && month <= 12) {
    const mm = String(month).padStart(2, '0');
    const ym = y + '-' + mm;
    dd = { type: 'mes', value: ym, label: ym };
  }
  return window.recomputeBit(sf, dd, y);
};
// Cross-filter helper: combina statusFilter + drilldown e retorna BIT-like
// com KPIs/charts/extrato recalculados em ~10ms (17k rows).
window.recomputeBit = function (statusFilter, drilldown, year) {
  const filtered = filterTx(ALL_TX, statusFilter, drilldown);
  const agg = aggregateTx(filtered, year || REF_YEAR);
  // Mescla com BIT base pra preservar META, helpers (fmt, fmtK), MONTHS etc.
  const base = window.BIT || {};
  return Object.assign({}, base, agg, {
    TOTAL_RECEITA: agg.KPIS.TOTAL_RECEITA,
    TOTAL_DESPESA: agg.KPIS.TOTAL_DESPESA,
    VALOR_LIQUIDO: agg.KPIS.VALOR_LIQUIDO,
    MARGEM_LIQUIDA: agg.KPIS.MARGEM_LIQUIDA,
  });
};
`;

fs.writeFileSync(OUT_FILE, DATA_JS);
const stat = fs.statSync(OUT_FILE);
console.log(`\n=== OK ===`);
console.log(`  ${OUT_FILE} (${(stat.size / 1024).toFixed(1)} KB)`);
