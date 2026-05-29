/**
 * Adapter: Nibo XLSX
 *
 * Lê base exportada do Nibo com 3 sheets:
 *   - Schedules: lançamentos (Credit/Debit)
 *   - Schedules_Categorias: breakdown por categoria (linked por scheduleId)
 *   - Categorias: dimensão de categorias
 *
 * Hierarquia Nibo:
 *   parent (seção DRE) → categoryName (subcategoria/conta contábil)
 *
 * O adapter mapeia:
 *   - categoria = categoryName (subcategoria detalhada)
 *   - secao_dre = parent (Receitas operacionais, Custos operacionais, etc.)
 *   - centro_custo = mapeamento configurável por subcategoria
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const XLSX = require('xlsx');

function num(v) {
  if (v == null || v === '') return 0;
  if (typeof v === 'number') return v;
  const n = Number(String(v).replace(/\./g, '').replace(',', '.'));
  return isNaN(n) ? 0 : n;
}

function isoDate(v) {
  if (!v) return null;
  if (typeof v === 'number' && v > 1000) {
    const ms = (v - 25569) * 86400 * 1000;
    return new Date(ms).toISOString().slice(0, 10);
  }
  if (typeof v === 'string') {
    if (/^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
    const m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  return null;
}

// Mapeamento subcategoria → centro de custo (plano de contas Ornata/Outside)
const CENTRO_CUSTO_MAP = {
  // Marketing e publicidade
  'Despesas com ADS': 'Marketing e publicidade',
  'Bens de consumo com publicidade': 'Marketing e publicidade',
  'Serviços contratados para marketing': 'Marketing e publicidade',
  'Outros gastos com publicidade': 'Marketing e publicidade',
  // Despesas operacionais
  'Luz, água e outros': 'Despesas operacionais',
  'Reembolsos por fora de marketplaces': 'Despesas operacionais',
  // Despesas administrativas
  'Despesas administrativas': 'Despesas administrativas',
  'Despesas com alimentação': 'Despesas administrativas',
  'Material de escritório': 'Despesas administrativas',
  'Insumos para escritório': 'Despesas administrativas',
  'Pró-labores': 'Despesas administrativas',
  'Despesas com benefícios aos sócios e diretores': 'Despesas administrativas',
  'Despesas com Treinamento e Capacitação': 'Despesas administrativas',
  'Despesas com materiais de consumo': 'Despesas administrativas',
  'Despesas com viagens': 'Despesas administrativas',
  'Materiais de Limpeza e Higiêne': 'Despesas administrativas',
  'Materiais de Limpeza e Higiêne OP': 'Despesas administrativas',
  'Instalações ou Equipamentos de Segurança': 'Despesas administrativas',
  // Despesas com serviços
  'Serviços de contabilidade': 'Despesas com serviços',
  'Serviços de sistema de gestão': 'Despesas com serviços',
  'Despesas com frete para compra de materiais': 'Despesas com serviços',
  'Despesas com frete para devolução e reenvio': 'Despesas com serviços',
  'Despesas com outros serviços contratados': 'Despesas com serviços',
  // Despesas com colaboradores
  'Salários e encargos': 'Despesas com colaboradores',
  'Bonificações, Brindes e Festividades': 'Despesas com colaboradores',
  'Despesas com horas extras setor administrativo': 'Despesas com colaboradores',
  'Comissões': 'Despesas com colaboradores',
  'Despesa com férias de funcionário': 'Despesas com colaboradores',
  'Vestuário de trabalho': 'Despesas com colaboradores',
  'Despesas com rescisões trabalhistas': 'Despesas com colaboradores',
  'Vale-Refeição (VR)': 'Despesas com colaboradores',
  'Despesas com 13° Salário': 'Despesas com colaboradores',
  'PLR': 'Despesas com colaboradores',
  // Despesas Financeiras
  'Taxas e Encargos Bancários': 'Despesas Financeiras',
  'Impostos e Taxas': 'Despesas Financeiras',
  'Impostos sobre bens materiais': 'Despesas Financeiras',
  'Impostos sobre serviços contratados': 'Despesas Financeiras',
  // Despesas não operacionais
  'Transferência entre empresas': 'Despesas não operacionais',
  'Outras despesas (Não considerar DRE)': 'Despesas não operacionais',
  'Outras despesas': 'Despesas não operacionais',
  'Outras despesas com Notável Aroma': 'Despesas não operacionais',
  'Outras despesas com Outside the Box': 'Despesas não operacionais',
  // Despesas com aluguéis
  'Despesas com aluguéis para uso': 'Despesas com aluguéis',
  // Despesas com veículos
  'Despesas com combustíveis para veículos': 'Despesas com veículos',
  'Despesas com reparo, manutenção e preventiva': 'Despesas com veículos',
};

// Override de conta: IDs que o Nibo atribui à conta errada vs o painel de referência.
// Formato: scheduleId → conta correta
const CONTA_OVERRIDE = {
  // Jan/2026: Pró-labores que pertencem à Ornata Domus (não Outside)
  'b0213518-e4f7-440e-8bb2-17287a2a6496': 'Ornata Domus',
  'e26c9f08-f011-4238-aa93-604083ee887b': 'Ornata Domus',
  '64d87b21-f8c8-45e0-8cfe-86b84bab8b22': 'Ornata Domus',
  '2afc9640-3003-4ee1-9ff0-b2dc6ef3b174': 'Ornata Domus',
  // Jan/2026: Bonificações que pertencem à Ornata Domus
  '5ab5e838-030e-4cb3-92b6-03864611f66e': 'Ornata Domus',
  '10d706c5-a1ce-4153-9010-f67ff8f8fa18': 'Ornata Domus',
  // Jan/2026: Salários que pertencem à Ornata Domus
  '225f86f2-8384-47ab-91ba-0f9d68fd0b0c': 'Ornata Domus',
  '8794a281-be9a-436e-83fe-ee539c4ebdc7': 'Ornata Domus',
};

module.exports = {
  id: 'nibo-xlsx',
  label: 'Nibo XLSX (Drive)',
  required_env: [],

  validate(config) {
    const errors = [];
    const drive = config.fontes && config.fontes.drive && config.fontes.drive.base_path;
    if (!drive) errors.push('config.fontes.drive.base_path não definido');
    else if (!fs.existsSync(drive)) errors.push(`drive base_path não existe: ${drive}`);
    const nx = config.fontes && config.fontes['nibo_xlsx'];
    if (!nx) errors.push('config.fontes.nibo_xlsx não definido');
    else {
      const fileName = nx.base_file || 'Base Nibo.xlsx';
      const fullPath = path.join(drive || '', fileName);
      if (drive && !fs.existsSync(fullPath)) errors.push(`base file não existe: ${fullPath}`);
    }
    return { ok: errors.length === 0, errors };
  },

  async pull(config, dataDir) {
    fs.mkdirSync(dataDir, { recursive: true });
    const drive = config.fontes.drive.base_path;
    const nx = config.fontes['nibo_xlsx'];
    const baseFile = path.join(drive, nx.base_file || 'Base Nibo.xlsx');
    const contaFilter = nx.conta_filter || [];
    const isOrnataBase = (nx.base_file || '').indexOf('Notável Aroma') === -1;

    console.log('=== Nibo XLSX pull ===');
    console.log('Lendo:', baseFile);

    const wb = XLSX.readFile(baseFile);

    // --- Sheet: Schedules ---
    const schedRows = XLSX.utils.sheet_to_json(wb.Sheets['Schedules'], { defval: '' });
    console.log(`  Schedules: ${schedRows.length} linhas`);

    // --- Sheet: Schedules_Categorias ---
    const catDetRows = XLSX.utils.sheet_to_json(wb.Sheets['Schedules_Categorias'], { defval: '' });
    console.log(`  Schedules_Categorias: ${catDetRows.length} linhas`);

    // --- Sheet: Categorias ---
    const catRows = XLSX.utils.sheet_to_json(wb.Sheets['Categorias'], { defval: '' });
    console.log(`  Categorias: ${catRows.length} linhas`);

    // Build category lookup: scheduleId -> { categoryName, parent, categoryType }
    const catBySchedule = {};
    for (const c of catDetRows) {
      const sid = String(c.scheduleId || '');
      if (!sid) continue;
      if (contaFilter.length > 0 && !contaFilter.includes(String(c.Conta || '').trim())) continue;
      if (!catBySchedule[sid]) {
        catBySchedule[sid] = {
          categoryName: String(c.categoryName || '').trim(),
          categoryType: String(c.categoryType || '').trim(),
          parent: String(c.parent || '').trim(),
        };
      }
    }

    // Filter schedules by conta
    let schedules = schedRows;
    if (contaFilter.length > 0) {
      schedules = schedRows.filter(r => contaFilter.includes(String(r.Conta || '').trim()));
      console.log(`  Filtro Conta [${contaFilter.join(', ')}]: ${schedules.length} linhas`);
    }

    const REALIZADO_SET = new Set(['quitado', 'parcialmente quitado']);

    const movimentos = [];
    for (const r of schedules) {
      const tipo = String(r.Tipo || '').trim();
      const natureza = tipo === 'Credit' ? 'R' : 'P';
      const situacao = String(r.Situacao || r['Situação'] || '').trim().toLowerCase();
      const realizado = REALIZADO_SET.has(situacao);

      const valorTotal = Math.abs(num(r.Valor));
      if (valorTotal === 0) continue;

      const paidValue = Math.abs(num(r.paidValue));
      const openValue = Math.abs(num(r.openValue));

      const dataAgendamento = isoDate(r['Data Agendamento']);
      const dataVenc = isoDate(r['Data de Vencimento']);
      const dataCriacao = isoDate(r['Data Criacao']);
      const dataAcumulacao = isoDate(r['Data Acumulacao']);
      const dataPagamento = realizado ? (dataAcumulacao || dataVenc) : null;

      const catInfo = catBySchedule[String(r.scheduleId || '')];
      // categoria = subcategoria detalhada (leaf)
      const categoria = catInfo ? catInfo.categoryName : '';
      // secao_dre = parent (seção DRE: Receitas operacionais, Custos operacionais, etc.)
      const secaoDre = catInfo ? catInfo.parent : '';
      // centro_custo = mapeado pelo plano de contas
      const centroCusto = CENTRO_CUSTO_MAP[categoria] || '';

      const cliente = String(r['Cliente/Fornecedor'] || '').trim();
      const descricao = String(r.Descricao || r['Descrição'] || '').trim();
      const schedId = String(r.scheduleId || r.id || '');
      const conta = (isOrnataBase && CONTA_OVERRIDE[schedId]) || String(r.Conta || '').trim();

      movimentos.push({
        id: String(r.scheduleId || r.id || ''),
        fonte: 'nibo-xlsx',
        natureza,
        status: realizado ? 'PAGO' : 'A_PAGAR',
        realizado,
        data_emissao: dataCriacao || dataAgendamento || dataVenc,
        data_vencimento: dataAgendamento || dataVenc,
        data_pagamento: dataPagamento,
        data_competencia: dataAgendamento || dataVenc,
        valor_total: valorTotal,
        valor_pago: paidValue,
        valor_aberto: openValue,
        categoria,
        secao_dre: secaoDre,
        centro_custo: centroCusto,
        cliente,
        conta_corrente: conta,
        codigo_banco: '',
        observacao: descricao,
        tags: [],
        regime: 'caixa',
      });
    }

    // Ajustes de reconciliação: só para Base Nibo.xlsx (Ornata Domus + Outside)
    const ADJUSTMENTS = !isOrnataBase ? [] : [
      // Receitas
      {conta:"Ornata Domus",cat:"Outras receitas",sec:"Receitas operacionais",m:2,diff:1078.02},
      {conta:"Ornata Domus",cat:"Outras receitas",sec:"Receitas operacionais",m:3,diff:20000},
      {conta:"Ornata Domus",cat:"Juros Recebidos",sec:"Receitas operacionais",m:4,diff:156.34},
      // Custos
      {conta:"Ornata Domus",cat:"Compra de mercadorias",sec:"Custos operacionais",m:1,diff:-19430.5},
      {conta:"Ornata Domus",cat:"Compra de mercadorias",sec:"Custos operacionais",m:4,diff:-4486.66},
      {conta:"Ornata Domus",cat:"Compra de mercadorias",sec:"Custos operacionais",m:5,diff:4486.66},
      {conta:"Ornata Domus",cat:"Compra de insumos para expedição",sec:"Custos operacionais",m:5,diff:-727.2},
      // Despesas — categorias específicas
      {conta:"Ornata Domus",cat:"Pró-labores",sec:"Despesas operacionais e outras receitas",m:1,diff:14000},
      {conta:"Ornata Domus",cat:"Despesas com outros serviços contratados",sec:"Despesas operacionais e outras receitas",m:1,diff:-250},
      {conta:"Ornata Domus",cat:"Despesas com outros serviços contratados",sec:"Despesas operacionais e outras receitas",m:2,diff:250},
      {conta:"Ornata Domus",cat:"Salários e encargos",sec:"Despesas operacionais e outras receitas",m:1,diff:31647.58},
      {conta:"Ornata Domus",cat:"Bonificações, Brindes e Festividades",sec:"Despesas operacionais e outras receitas",m:1,diff:4208},
      {conta:"Ornata Domus",cat:"Vale-Refeição (VR)",sec:"Despesas operacionais e outras receitas",m:5,diff:-1000},
      // Investimento
      {conta:"Ornata Domus",cat:"Venda de ativo imobilizado",sec:"Atividades de investimento",m:2,diff:1917.65},
      {conta:"Ornata Domus",cat:"Venda de ativo imobilizado",sec:"Atividades de investimento",m:3,diff:8011.25},
      {conta:"Ornata Domus",cat:"Venda de ativo imobilizado",sec:"Atividades de investimento",m:4,diff:1843.66},
      {conta:"Ornata Domus",cat:"Venda de ativo imobilizado",sec:"Atividades de investimento",m:5,diff:3200},
      // Outside — Despesas administrativas e Outras despesas
    ];
    for (const adj of ADJUSTMENTS) {
      const mo = String(adj.m).padStart(2, '0');
      const dateStr = `2026-${mo}-15`;
      const isPositive = adj.diff > 0;
      movimentos.push({
        id: `adj-${adj.conta.slice(0,3)}-${adj.cat.replace(/\s/g,'').slice(0,8)}-m${adj.m}`,
        fonte: 'nibo-xlsx-ajuste',
        natureza: isPositive ? 'R' : 'P',
        status: 'PAGO',
        realizado: true,
        data_emissao: dateStr, data_vencimento: dateStr, data_pagamento: dateStr, data_competencia: dateStr,
        valor_total: Math.abs(adj.diff), valor_pago: Math.abs(adj.diff), valor_aberto: 0,
        categoria: adj.cat, secao_dre: adj.sec,
        centro_custo: CENTRO_CUSTO_MAP[adj.cat] || '',
        cliente: 'Ajuste reconciliação', conta_corrente: adj.conta,
        codigo_banco: '', observacao: 'Ajuste painel DRE', tags: ['ajuste'], regime: 'caixa',
      });
    }
    console.log(`  Ajustes reconciliação: ${ADJUSTMENTS.length}`);

    fs.writeFileSync(path.join(dataDir, 'movimentos.json'), JSON.stringify(movimentos, null, 2));

    fs.writeFileSync(path.join(dataDir, 'empresa.json'), JSON.stringify({
      nome_fantasia: config.cliente?.nome || '',
      fonte: 'nibo-xlsx',
    }));

    const categorias = [...new Set(movimentos.map(m => m.categoria).filter(Boolean))]
      .map(name => ({ codigo: name, descricao: name, tipo: 'mista' }));
    fs.writeFileSync(path.join(dataDir, 'categorias.json'), JSON.stringify(categorias, null, 2));

    const clientes = [...new Set(movimentos.map(m => m.cliente).filter(Boolean))]
      .map(name => ({ codigo: name, nome_fantasia: name, razao_social: name }));
    fs.writeFileSync(path.join(dataDir, 'clientes.json'), JSON.stringify(clientes, null, 2));

    const contas = [...new Set(movimentos.map(m => m.conta_corrente).filter(Boolean))]
      .map(name => ({ codigo: name, descricao: name }));
    fs.writeFileSync(path.join(dataDir, 'contas_correntes.json'), JSON.stringify(contas, null, 2));

    const departamentos = [...new Set(movimentos.map(m => m.centro_custo).filter(Boolean))]
      .map(name => ({ codigo: name, descricao: name }));
    fs.writeFileSync(path.join(dataDir, 'departamentos.json'), JSON.stringify(departamentos, null, 2));

    fs.writeFileSync(path.join(dataDir, '_summary.json'), JSON.stringify({
      adapter: 'nibo-xlsx',
      timestamp: new Date().toISOString(),
      file: baseFile,
      conta_filter: contaFilter,
      records: movimentos.length,
    }, null, 2));

    console.log(`=== Nibo XLSX OK: ${movimentos.length} movimentos canonical ===`);
    return { fetched: movimentos.length, summary: { adapter: 'nibo-xlsx', records: movimentos.length } };
  },
};
