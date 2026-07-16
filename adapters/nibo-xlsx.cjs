/**
 * Adapter: Nibo XLSX — SKN Prime
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

// Mapeamento subcategoria → centro de custo (plano de contas SKN Prime)
const CENTRO_CUSTO_MAP = {
  // Receitas
  'Receita com serviços': 'Receita operacional',
  'Receita com certificado digital': 'Receita operacional',
  'Receita com legalização': 'Receita operacional',
  'Receita com inadimplência': 'Receita operacional',
  'Contas de terceiros': 'Receita operacional',
  'Receita com adicional anual 13º': 'Receita operacional',
  'Receita com pessoal': 'Receita operacional',
  'Receita com fiscal': 'Receita operacional',
  'Receita  bpo  financeiro': 'Receita operacional',
  'Receitas outros serviços': 'Receita operacional',
  'Receita Serviços MEI': 'Receita operacional',
  'Receita com contábil': 'Receita operacional',
  'Receita com vendas': 'Receita operacional',
  'Receita com Irpf': 'Receita não operacional',
  'Remanescentes lounge beer': 'Receita não operacional',
  'Rendimento s/ aplicações': 'Receita financeira',
  'Receitas Com Condominio SKN': 'Receita não operacional',
  'Receita com rendimentos': 'Receita financeira',

  // Custos operacionais (folha)
  'Salários, encargos e benefícios': 'Custos com pessoal',
  'Adiantamento salarial': 'Custos com pessoal',
  'Vale refeição': 'Custos com pessoal',
  'Vale transporte': 'Custos com pessoal',
  'Meta': 'Custos com pessoal',
  'Férias': 'Custos com pessoal',
  '13° salário': 'Custos com pessoal',
  'Adiantamento 13º': 'Custos com pessoal',
  'Irrf': 'Custos com pessoal',
  'Rescisão': 'Custos com pessoal',
  'Inss': 'Custos com pessoal',
  'Fgts': 'Custos com pessoal',
  'Fgts rescisório': 'Custos com pessoal',
  'Salários estágio': 'Custos com pessoal',
  'Horas extra': 'Custos com pessoal',
  'Serviços pj - Sheyla': 'Custos com pessoal',
  'Assistência odontológica': 'Custos com pessoal',
  'Serviços de Irpf': 'Custos com pessoal',
  'Estorno (custo)': 'Custos com pessoal',

  // Custos operacionais (outros)
  'Sistemas Operacionais': 'Custos operacionais',
  'Impostos sobre receita / Das': 'Impostos',

  // Despesas administrativas
  'Retirada/pró-Labore - Anderson': 'Pró-labore e sócios',
  'Retirada/pró-labore - Isaias': 'Pró-labore e sócios',
  'Retirada/pró-Labore - Anderson (entrada)': 'Pró-labore e sócios',
  'Grupo skn': 'Despesas administrativas',
  'Material de escritório': 'Despesas administrativas',
  'Lanches e refeições': 'Despesas administrativas',
  'Produtos para copa': 'Despesas administrativas',
  'Higiene e limpeza': 'Despesas administrativas',
  'Água': 'Despesas administrativas',
  'Água (galão)': 'Despesas administrativas',
  'Energia elétrica': 'Despesas administrativas',
  'Confraternizações': 'Despesas administrativas',
  'Brindes': 'Despesas administrativas',
  'Coffee break': 'Despesas administrativas',
  'Conservação e decoração': 'Despesas administrativas',
  'Móveis e utensílios': 'Despesas administrativas',
  'Material de uso e consumo': 'Despesas administrativas',
  'Bens de pequeno valor': 'Despesas administrativas',
  'Gás': 'Despesas administrativas',
  'Iptu': 'Despesas administrativas',
  'Uniforme': 'Despesas administrativas',
  'Doações': 'Despesas administrativas',
  'Contribuição sindical': 'Despesas administrativas',

  // Despesas com serviços
  'Telefone e internet': 'Despesas com serviços',
  'Aluguel de equipamentos': 'Despesas com serviços',
  'Informática': 'Despesas com serviços',
  'Segurança e monitoramento': 'Despesas com serviços',
  'Hospedagem': 'Despesas com serviços',
  'Domínio sites e e-mails': 'Despesas com serviços',
  'Serviços contratados': 'Despesas com serviços',
  'Assessoria e consultoria empresarial': 'Despesas com serviços',
  'Motoboy': 'Despesas com serviços',
  'Office boy': 'Despesas com serviços',
  'Correios': 'Despesas com serviços',
  'Saúde ocupacional': 'Despesas com serviços',
  'Frete': 'Despesas com serviços',
  'Infraestrutura': 'Despesas com serviços',

  // Despesas com pessoal (RH)
  'Premiações à funcionários': 'Despesas com pessoal',
  'Cursos e treinamentos': 'Despesas com pessoal',
  'Assistência médica': 'Despesas com pessoal',
  'Auxílio Moradia': 'Despesas com pessoal',
  'Bolsa auxílio': 'Despesas com pessoal',
  'Pensão alimentícia': 'Despesas com pessoal',
  'Recarga Bilhete Único': 'Despesas com pessoal',

  // Marketing
  'Marketing': 'Marketing e publicidade',
  'Marketing digital': 'Marketing e publicidade',
  'Materiais gráficos': 'Marketing e publicidade',
  'Publicidade e propaganda': 'Marketing e publicidade',
  'BNI': 'Marketing e publicidade',
  'Eventos': 'Marketing e publicidade',

  // Despesas financeiras
  'Despesas financeiras': 'Despesas financeiras',
  'Taxas e contribuições': 'Despesas financeiras',
  'Juros, multa e encargos': 'Despesas financeiras',
  'Tarifa bancária': 'Despesas financeiras',
  'Parcelamento de impostos': 'Despesas financeiras',
  'Prorrogação de impostos': 'Despesas financeiras',
  'Seguros': 'Despesas financeiras',
  'Taxas e despesas de legalização': 'Custos operacionais',
  'Certificado digital': 'Custos operacionais',
  'Certificado (vouchers)': 'Custos operacionais',

  // Despesas com imóvel
  'Imóvel sede - skn prime contabilidade': 'Despesas com imóvel',
  'Reforma': 'Despesas com imóvel',
  'Conserto e manutenção': 'Despesas com imóvel',

  // Despesas com veículos
  'Combustível': 'Despesas com veículos',
  'Combustível motoboy': 'Despesas com veículos',
  'Veículos': 'Despesas com veículos',
  'Estacionamento': 'Despesas com veículos',
  'Pedágio': 'Despesas com veículos',
  'Condução': 'Despesas com veículos',

  // Empréstimos e financiamentos
  'Empréstimo caixa': 'Empréstimos e financiamentos',
  'Empréstimos itaú': 'Empréstimos e financiamentos',
  'Empréstimos itaú - juros': 'Empréstimos e financiamentos',
  'Empréstimo inter': 'Empréstimos e financiamentos',
  'Empréstimos pronampe': 'Empréstimos e financiamentos',
  'Cartão  bndes': 'Empréstimos e financiamentos',
  'Cartão empresarial ourocard': 'Empréstimos e financiamentos',
  'Consórcio': 'Empréstimos e financiamentos',
  'Emprestimos Irene': 'Empréstimos e financiamentos',

  // Não operacional / investimento
  'Despesas - prejuízo de clientes': 'Despesas não operacionais',
  'Compra de ativo fixo': 'Investimentos',
  'Marcas e patentes': 'Investimentos',
  'Cartório': 'Despesas administrativas',
  'Estorno (despesa)': 'Estornos',
  'Estorno': 'Estornos',
  'Estorno (despesas estornadas)': 'Estornos',
  'Devolução de cheques': 'Estornos',
  'Repasses': 'Repasses',
  'Custo irpf': 'Custos operacionais',
  'Luz': 'Despesas administrativas',

  // Atividades de investimento
  'Cheirinho de pet': 'Investimentos',
  'Meta compartilhada': 'Investimentos',
  'Quitação de empréstimo': 'Empréstimos e financiamentos',
  'Rescisão (parcelada)': 'Custos com pessoal',
  'Obtenção de empréstimo': 'Empréstimos e financiamentos',
  'Venda de ativo fixo': 'Investimentos',
  'Anderson (arua)': 'Investimentos',
  'Empréstimo sócio': 'Empréstimos e financiamentos',
  'Custo aquis emprestimo': 'Empréstimos e financiamentos',

  // Atividades de financiamento
  'Retirada - caragua': 'Distribuição e retiradas',
  'Retirada caragua (entrada)': 'Distribuição e retiradas',
  'Distribuição skn': 'Distribuição e retiradas',
  'Distribuição de lucros': 'Distribuição e retiradas',
  'Distribuições anos anteriores anderson pf': 'Distribuição e retiradas',
  'Serviços  irpf': 'Custos operacionais',
  'Ferias (prorrogação)': 'Custos com pessoal',
  'Curso gestão de pessoas': 'Despesas com pessoal',
  'Regularização de imóveis': 'Despesas com imóvel',
  'Eventos Pde': 'Marketing e publicidade',
  'Adiantamento salarios (n op)': 'Custos com pessoal',
  'Empréstimos à funcionários': 'Empréstimos e financiamentos',
  'Outras despesas ñ operacionais': 'Despesas não operacionais',
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
      const conta = String(r.Conta || '').trim();

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
