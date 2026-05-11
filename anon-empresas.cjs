/* eslint-disable */
// Agrega as 24 contas do data.js em 4 buckets ("Empresa 1..4")
// e reescreve CONTAS + DRE_BY_CONTA in-place. Outros consts ficam intactos.

const fs = require("fs");
const path = require("path");

const DATA_PATH = path.join(__dirname, "data.js");
const N_BUCKETS = 4;
const src = fs.readFileSync(DATA_PATH, "utf8");

function extractBlock(text, header, openChar, closeChar) {
  const start = text.indexOf(header);
  if (start === -1) throw new Error("Header not found: " + header);
  let i = text.indexOf(openChar, start);
  if (i === -1) throw new Error("Open char not found");
  const blockStart = i;
  let depth = 0;
  for (; i < text.length; i++) {
    const c = text[i];
    if (c === openChar) depth++;
    else if (c === closeChar) {
      depth--;
      if (depth === 0) {
        // expect ";" right after
        let end = i + 1;
        while (end < text.length && text[end] !== ";") end++;
        return { headerStart: start, blockStart, blockEnd: i + 1, end: end + 1, body: text.slice(blockStart, i + 1) };
      }
    }
  }
  throw new Error("Unbalanced brackets");
}

const contasBlock = extractBlock(src, "const CONTAS = ", "[", "]");
const dreBlock    = extractBlock(src, "const DRE_BY_CONTA = ", "{", "}");

const CONTAS       = JSON.parse(contasBlock.body);
const DRE_BY_CONTA = JSON.parse(dreBlock.body);

// Sort by receita desc and distribute round-robin into 4 buckets.
// This mixes high/low performers per bucket, avoiding "bucket 1 = all winners".
const sorted = [...CONTAS].sort((a, b) => (b.receita || 0) - (a.receita || 0));
const buckets = Array.from({ length: N_BUCKETS }, () => []);
sorted.forEach((c, idx) => buckets[idx % N_BUCKETS].push(c.slug));

// slug_velho → slug_novo (e label_velho → label_novo) p/ remapear ALL_TX,
// RECEITA_POR_LOJA, etc. — tudo que referencia slugs/labels no resto do data.js.
const slugMap = {};
const labelMap = {};
buckets.forEach((slugs, idx) => {
  const newSlug = `empresa-${idx + 1}`;
  const newLabel = `Empresa ${idx + 1}`;
  for (const s of slugs) {
    slugMap[s] = newSlug;
    const c = CONTAS.find(x => x.slug === s);
    if (c && c.label) labelMap[c.label] = newLabel;
  }
});

const MONTHS_FULL = ["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];

const NEW_CONTAS = [];
const NEW_DRE = {};

buckets.forEach((slugs, idx) => {
  const n = idx + 1;
  const newSlug = `empresa-${n}`;
  const newLabel = `Empresa ${n}`;

  // ---- CONTAS aggregate
  let receita = 0, despesa = 0, count = 0, liquido = 0;
  for (const s of slugs) {
    const c = CONTAS.find(x => x.slug === s);
    if (!c) continue;
    receita += c.receita || 0;
    despesa += c.despesa || 0;
    count   += c.count   || 0;
    liquido += c.liquido || 0;
  }
  const margem = receita > 0 ? (liquido / receita) * 100 : 0;
  NEW_CONTAS.push({
    slug: newSlug,
    label: newLabel,
    cliente_grupo: "Demo Holding",
    receita, despesa, count, liquido, margem,
  });

  // ---- DRE_BY_CONTA aggregate
  const monthAgg = MONTHS_FULL.map(m => ({
    m, receita: 0, custo: 0, despesa: 0, imposto: 0, outros: 0, liquido: 0, count: 0,
  }));
  for (const s of slugs) {
    const dre = DRE_BY_CONTA[s];
    if (!dre || !dre.MONTH_DRE) continue;
    dre.MONTH_DRE.forEach((row, i) => {
      const tgt = monthAgg[i];
      tgt.receita += row.receita || 0;
      tgt.custo   += row.custo   || 0;
      tgt.despesa += row.despesa || 0;
      tgt.imposto += row.imposto || 0;
      tgt.outros  += row.outros  || 0;
      tgt.liquido += row.liquido || 0;
      tgt.count   += row.count   || 0;
    });
  }

  // Recompute ORCAMENTO consistent with existing convention:
  //   - meses_ativos = months with receita > 0
  //   - melhor_mes_idx = argmax(receita)
  //   - receita_mes = max receita
  //   - custo_mes/despesa_mes/imposto_mes = mean over active months
  //   - liquido_mes = receita_mes - custo_mes - despesa_mes - imposto_mes
  //   - *_ano = *_mes * 12
  const ativos = monthAgg.filter(r => r.receita > 0);
  const meses_ativos = ativos.length;
  let melhor_mes_idx = 0, maxR = -Infinity;
  monthAgg.forEach((r, i) => { if (r.receita > maxR) { maxR = r.receita; melhor_mes_idx = i; } });
  const receita_mes = monthAgg[melhor_mes_idx]?.receita || 0;
  const mean = (key) => meses_ativos > 0 ? ativos.reduce((a, r) => a + (r[key] || 0), 0) / meses_ativos : 0;
  const custo_mes   = mean("custo");
  const despesa_mes = mean("despesa");
  const imposto_mes = mean("imposto");
  const liquido_mes = receita_mes - custo_mes - despesa_mes - imposto_mes;

  NEW_DRE[newSlug] = {
    label: newLabel,
    MONTH_DRE: monthAgg,
    ORCAMENTO: {
      receita_mes, custo_mes, despesa_mes, imposto_mes,
      meses_ativos, melhor_mes_idx, liquido_mes,
      receita_ano: receita_mes * 12,
      custo_ano: custo_mes * 12,
      despesa_ano: despesa_mes * 12,
      imposto_ano: imposto_mes * 12,
      liquido_ano: liquido_mes * 12,
    },
  };
});

// Reassemble file: replace CONTAS body and DRE_BY_CONTA body. Process from the later
// offset first so earlier indexes stay valid.
const newContasText = JSON.stringify(NEW_CONTAS, null, 2);
const newDreText    = JSON.stringify(NEW_DRE);

let out = src;
if (dreBlock.blockStart > contasBlock.blockStart) {
  out = out.slice(0, dreBlock.blockStart) + newDreText + out.slice(dreBlock.blockEnd);
  out = out.slice(0, contasBlock.blockStart) + newContasText + out.slice(contasBlock.blockEnd);
} else {
  out = out.slice(0, contasBlock.blockStart) + newContasText + out.slice(contasBlock.blockEnd);
  out = out.slice(0, dreBlock.blockStart) + newDreText + out.slice(dreBlock.blockEnd);
}

// Substitui todas as ocorrencias de "<slug-antigo>" e "<label-antigo>"
// no resto do data.js (ALL_TX, RECEITA_POR_LOJA, etc).
// Usa aspas como delimitador pra nao bater dentro de palavras maiores.
function escapeRegExp(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
for (const [oldSlug, newSlug] of Object.entries(slugMap)) {
  out = out.split(`"${oldSlug}"`).join(`"${newSlug}"`);
}
for (const [oldLabel, newLabel] of Object.entries(labelMap)) {
  out = out.split(`"${oldLabel}"`).join(`"${newLabel}"`);
}

fs.writeFileSync(DATA_PATH, out);

console.log("OK");
console.log("CONTAS:", CONTAS.length, "->", NEW_CONTAS.length);
console.log("DRE_BY_CONTA keys:", Object.keys(DRE_BY_CONTA).length, "->", Object.keys(NEW_DRE).length);
NEW_CONTAS.forEach(c => console.log(`  ${c.slug}: receita=${c.receita.toFixed(2)} despesa=${c.despesa.toFixed(2)} liquido=${c.liquido.toFixed(2)} margem=${c.margem.toFixed(2)}%`));
