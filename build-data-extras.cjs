#!/usr/bin/env node
/**
 * build-data-extras.cjs — SKN Prime
 * Lê XLSX extras (Inadimplência, Margem, Clientes/Ticket, Receita Nova) e gera data-extras.js.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const XLSX = require('xlsx');

const cfg = require('./bi.config.js');
const DRIVE = (cfg.fontes && cfg.fontes.drive && cfg.fontes.drive.base_path) || '';

const MONTH_MAP = {
  'JANEIRO': 0, 'FEVEREIRO': 1, 'MARÇO': 2, 'ABRIL': 3, 'MAIO': 4, 'JUNHO': 5,
  'JULHO': 6, 'AGOSTO': 7, 'SETEMBRO': 8, 'OUTUBRO': 9, 'NOVEMBRO': 10, 'DEZEMBRO': 11,
};
const MONTH_NAMES = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];

function readMonthlySheet(file, sheetName) {
  try {
    const wb = XLSX.readFile(path.join(DRIVE, file));
    const ws = wb.Sheets[sheetName || wb.SheetNames[0]];
    const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
    const result = Array(12).fill(null);
    for (const row of raw) {
      if (!row || !row[0] || typeof row[0] !== 'string') continue;
      const mes = MONTH_MAP[row[0].toUpperCase().trim()];
      if (mes == null) continue;
      result[mes] = row.slice(1); // rest of columns
    }
    return result;
  } catch (e) {
    console.error(`  WARN: ${file} [${sheetName}]: ${e.message}`);
    return Array(12).fill(null);
  }
}

// --- Inadimplência ---
console.log('=== Inadimplência ===');
const inadim = {};
for (const yr of ['2025', '2026']) {
  const data = readMonthlySheet('Inadimplentes.xlsx', yr);
  inadim[yr] = data.map((row, i) => ({
    m: MONTH_NAMES[i],
    pct: row && row[0] != null ? row[0] : null,
  }));
  const filled = inadim[yr].filter(d => d.pct != null);
  console.log(`  ${yr}: ${filled.length} meses`);
}

// --- Margem de Contribuição (XLSX) ---
console.log('=== Margem de Contribuição ===');
const margemXlsx = {};
for (const yr of ['2025', '2026']) {
  const data = readMonthlySheet('Margem de Contribuicao.xlsx', yr);
  margemXlsx[yr] = data.map((row, i) => ({
    m: MONTH_NAMES[i],
    pct: row && row[0] != null ? row[0] : null,
  }));
  const filled = margemXlsx[yr].filter(d => d.pct != null);
  console.log(`  ${yr}: ${filled.length} meses`);
}

// --- Quantidade de Clientes e Ticket Médio ---
console.log('=== Qtd Clientes & Ticket Médio ===');
const clientes = {};
for (const yr of ['2025', '2026']) {
  // This file has a title row, then headers, then data. readMonthlySheet handles it by matching month names.
  const data = readMonthlySheet('Quantidade de Clientes e Ticket Medio.xlsx', yr);
  clientes[yr] = data.map((row, i) => ({
    m: MONTH_NAMES[i],
    qtd: row && row[0] != null ? row[0] : null,
    ticket: row && row[1] != null ? row[1] : null,
  }));
  const filled = clientes[yr].filter(d => d.qtd != null);
  console.log(`  ${yr}: ${filled.length} meses`);
}

// --- Receitas Novas Comercial ---
console.log('=== Receitas Novas Comercial ===');
const receitaNova = {};
for (const yr of ['2025', '2026']) {
  const data = readMonthlySheet('Receitas Novas Comercial.xlsx', yr);
  receitaNova[yr] = data.map((row, i) => ({
    m: MONTH_NAMES[i],
    valor: row && row[0] != null ? row[0] : null,
  }));
  const filled = receitaNova[yr].filter(d => d.valor != null);
  console.log(`  ${yr}: ${filled.length} meses`);
}

// --- Custo por departamento (folha de pagamento) ---
console.log('=== Custo por Departamento ===');
const custoDepto = (function() {
  try {
    const wb = XLSX.readFile(path.join(DRIVE, 'Custo por departamento.xlsx'));
    const raw = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: null });
    // Headers at row 2: Nome, Cargo, Salário, Triênio, FGTS, VR, VT, Assis Odonto, Aux Estudantil, Aux Creche, Total s/ Prop, 13 Sal Prop, Férias Prop, 1/3 Férias Prop, Total
    const num = (v) => { if (v == null || v === '' || v === '-') return 0; return typeof v === 'number' ? v : Number(String(v).replace(/\./g,'').replace(',','.')) || 0; };
    const funcionarios = [];
    // Departamento groups separated by empty rows
    const deptos = ['Pessoal', 'Legalização', 'Fiscal', 'Contábil', 'Financeiro', 'Serviços'];
    let deptoIdx = 0;
    for (let i = 3; i < raw.length; i++) {
      const r = raw[i];
      if (!r || !r[0] || typeof r[0] !== 'string' || !r[0].trim()) {
        // Empty row = department separator
        if (funcionarios.length > 0 && raw[i-1] && raw[i-1][0]) deptoIdx++;
        continue;
      }
      const depto = deptos[deptoIdx] || 'Outros';
      funcionarios.push({
        nome: String(r[0]).trim(),
        cargo: String(r[1] || '').trim(),
        depto,
        salario: num(r[2]),
        trienio: num(r[3]),
        fgts: num(r[4]),
        vr: num(r[5]),
        vt: num(r[6]),
        odonto: num(r[7]),
        auxEstudantil: num(r[8]),
        auxCreche: num(r[9]),
        totalSemProp: num(r[10]),
        sal13prop: num(r[11]),
        feriasProp: num(r[12]),
        tercoFeriasProp: num(r[13]),
        total: num(r[14]),
      });
    }
    console.log(`  ${funcionarios.length} funcionários em ${new Set(funcionarios.map(f=>f.depto)).size} departamentos`);
    // Custo mensal com folha por categoria
    const byCat = {};
    for (const f of funcionarios) {
      const add = (cat, val) => { if (val > 0) byCat[cat] = (byCat[cat] || 0) + val; };
      add('Salários, encargos e benefícios', f.salario + f.trienio);
      add('Fgts', f.fgts);
      add('Vale refeição', f.vr);
      add('Vale transporte', f.vt);
      add('Assistência odontológica', f.odonto);
      add('Auxilio Estudantil', f.auxEstudantil);
      add('13 Salario Prop', f.sal13prop);
      add('Férias Prop', f.feriasProp);
    }
    const custoMensal = Object.entries(byCat).map(([cat, val]) => ({ name: cat, value: val })).sort((a,b) => b.value - a.value);
    const totalFolha = funcionarios.reduce((s, f) => s + f.total, 0);
    // Benefícios por funcionário (top)
    const benefPorFunc = funcionarios.map(f => ({
      nome: f.nome,
      valor: f.vr + f.vt + f.odonto + f.auxEstudantil + f.auxCreche,
    })).filter(b => b.valor > 0).sort((a,b) => b.valor - a.valor).slice(0, 10);
    // Benefícios por cargo
    const benefByCargo = {};
    for (const f of funcionarios) {
      const benef = f.vr + f.vt + f.odonto + f.auxEstudantil + f.auxCreche;
      if (benef > 0) benefByCargo[f.cargo] = (benefByCargo[f.cargo] || 0) + benef;
    }
    const benefPorCargo = Object.entries(benefByCargo).map(([c,v]) => ({ name: c, value: v })).sort((a,b) => b.value - a.value).slice(0, 10);
    console.log(`  Total folha: R$ ${totalFolha.toFixed(2)}`);
    return { funcionarios, custoMensal, totalFolha, benefPorFunc, benefPorCargo };
  } catch (e) {
    console.error('  Custo depto erro:', e.message);
    return null;
  }
})();

const out = {
  fetched_at: new Date().toISOString(),
  inadimplencia: inadim,
  margem_contribuicao_xlsx: margemXlsx,
  clientes_ticket: clientes,
  receita_nova: receitaNova,
  custo_depto: custoDepto,
  abc: null,
  faturamento: null,
  ads: null,
  crm: null,
  saldos: { daily: [], last: null, contas: [] },
};

const OUT = path.join(__dirname, 'data', 'extras.json');
const OUT_JS = path.join(__dirname, 'data-extras.js');

fs.mkdirSync(path.join(__dirname, 'data'), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
console.log(`\nextras.json OK (${(fs.statSync(OUT).size / 1024).toFixed(1)} KB)`);

const js = '/* BI EXTRAS — gerado por build-data-extras.cjs */\nwindow.BIT_EXTRAS = ' + JSON.stringify(out) + ';\n';
fs.writeFileSync(OUT_JS, js);
console.log(`data-extras.js OK (${(fs.statSync(OUT_JS).size / 1024).toFixed(1)} KB)`);
