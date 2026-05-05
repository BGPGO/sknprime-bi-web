/**
 * Adapter: Omie Multi-Conta
 *
 * Lê N contas Omie em PARALELO. Cada conta tem App_Key/Secret próprios →
 * rate limit é independente, então paralelismo total é seguro.
 *
 * Source de contas: Google Sheets público (CSV export). Apenas linhas com
 * Ativo == "Sim" são processadas. Campos esperados:
 *   Ativo, Clientes, Conta, App_Key, App_Secret, Endereços
 *
 * SCHEMA DO OUTPUT (compatível com build-data.cjs do radke-bi):
 *   data/movimentos.json       — array RAW de ListarMovimentos.movimentos[],
 *                                cada item com { detalhes, resumo, departamentos,
 *                                _conta, _conta_slug, _cliente_grupo } injetados.
 *   data/categorias.json       — RAW deduplicado (codigo único, primeira ocorrência).
 *   data/departamentos.json    — RAW deduplicado.
 *   data/clientes.json         — RAW deduplicado por codigo_cliente_omie.
 *   data/contas_correntes.json — RAW deduplicado por (conta, nCodCC) via _conta.
 *   data/empresa.json          — synthetic (Grupo).
 *   data/contas/<slug>/        — raw isolado por conta (auditoria).
 *   data/_summary.json         — métricas agregadas + breakdown por conta.
 *
 * Configuração mínima em bi.config.js:
 *   fontes: {
 *     adapters: ["omie-multi"],
 *     omie_multi: {
 *       sheets_id: "10dCg9c...",
 *       concurrency: 24,            // # contas em paralelo
 *       skip: [], only: [],         // filtros
 *       cliente_label: "Grupo DEX", // nome do grupo no BI
 *     }
 *   }
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const BASE = 'https://app.omie.com.br/api/v1';
const PAGE_SIZE = 500;
const PAGE_DELAY_MS = 200;
const SHEETS_ID_DEFAULT = '10dCg9cunnS-RSQyOFTPixFpO504H814Q8woTI7w6aRw';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function slugify(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function parseCsv(text) {
  const rows = [];
  const lines = text.replace(/\r/g, '').split('\n').filter(l => l.length > 0);
  for (const line of lines) {
    const cells = [];
    let cur = '', inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') { inQ = !inQ; continue; }
      if (c === ',' && !inQ) { cells.push(cur); cur = ''; continue; }
      cur += c;
    }
    cells.push(cur);
    rows.push(cells);
  }
  if (rows.length === 0) return [];
  const header = rows[0].map(h => h.trim());
  return rows.slice(1).map(r => {
    const obj = {};
    header.forEach((h, i) => { obj[h] = (r[i] || '').trim(); });
    return obj;
  });
}

async function loadContas(sheetsId) {
  const url = `https://docs.google.com/spreadsheets/d/${sheetsId}/export?format=csv`;
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`Sheets ${sheetsId} → HTTP ${res.status}`);
  const text = await res.text();
  const rows = parseCsv(text);
  const contas = rows
    .filter(r => (r.Ativo || '').toLowerCase().startsWith('sim'))
    .map(r => ({
      cliente: r.Clientes || '',
      conta: r.Conta || '',
      slug: slugify(r.Conta),
      app_key: r.App_Key || '',
      app_secret: r.App_Secret || '',
    }))
    .filter(c => c.app_key && c.app_secret && c.conta);
  return contas;
}

function createOmieClient(appKey, appSecret) {
  async function call(p, method, params, retries = 8) {
    const body = JSON.stringify({ call: method, app_key: appKey, app_secret: appSecret, param: [params] });
    let res;
    try {
      res = await fetch(`${BASE}${p}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
    } catch (netErr) {
      if (retries > 0) {
        await sleep(Math.min(30000, 2000 * (9 - retries)));
        return call(p, method, params, retries - 1);
      }
      throw netErr;
    }
    let j;
    try { j = await res.json(); }
    catch (e) {
      if (retries > 0) { await sleep(2000); return call(p, method, params, retries - 1); }
      throw new Error(`${method}: bad JSON (${res.status})`);
    }
    if (j.faultstring) {
      const transient = /Consumo|consumo|excedido|simultaneas|simult|Many|busy|Broken response|Application Server|BG|temporariamente|gateway|timeout|503|502|504|SOAP-ERROR/i.test(j.faultstring);
      if (transient && retries > 0) {
        await sleep(Math.min(30000, 2000 * (9 - retries)));
        return call(p, method, params, retries - 1);
      }
      throw new Error(`${method}: ${j.faultstring}`);
    }
    return j;
  }

  async function fetchAllPaginated(apiPath, method, baseParam, dataKey, cacheDir, opts) {
    fs.mkdirSync(cacheDir, { recursive: true });
    const pageFile = (n) => path.join(cacheDir, `page-${String(n).padStart(5, '0')}.json`);
    const metaFile = path.join(cacheDir, '_meta.json');
    const readCachedPage = (n) => {
      try { const a = JSON.parse(fs.readFileSync(pageFile(n), 'utf8')); return Array.isArray(a) ? a : null; }
      catch { return null; }
    };
    const writePage = (n, arr) => fs.writeFileSync(pageFile(n), JSON.stringify(arr));
    const style = (opts && opts.style) || 'snake';
    const buildParams = (page, size) => style === 'camel'
      ? { ...baseParam, nPagina: page, nRegPorPagina: size }
      : { ...baseParam, pagina: page, registros_por_pagina: size };
    const readMeta = (resp) => style === 'camel'
      ? { total: resp.nTotRegistros, pages: resp.nTotPaginas }
      : { total: resp.total_de_registros, pages: resp.total_de_paginas };

    let totalPages, totalRegs;
    let firstCached = readCachedPage(1);
    if (firstCached && fs.existsSync(metaFile)) {
      const m = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
      totalPages = m.totalPages; totalRegs = m.totalRegs;
    } else {
      const r = await call(apiPath, method, buildParams(1, PAGE_SIZE));
      const meta = readMeta(r);
      totalPages = meta.pages || 1;
      totalRegs = meta.total || (r[dataKey] || []).length;
      writePage(1, r[dataKey] || []);
      fs.writeFileSync(metaFile, JSON.stringify({ totalPages, totalRegs }));
    }

    let failed = 0;
    for (let p = 2; p <= totalPages; p++) {
      let arr = readCachedPage(p);
      if (!arr) {
        await sleep(PAGE_DELAY_MS);
        try {
          const r = await call(apiPath, method, buildParams(p, PAGE_SIZE));
          arr = r[dataKey] || [];
          writePage(p, arr);
        } catch (e) {
          failed++;
          if (failed > 50) break;
          continue;
        }
      }
    }

    const all = [];
    for (let p = 1; p <= totalPages; p++) all.push(...(readCachedPage(p) || []));
    return { records: all, totalPages, totalRegs };
  }

  return { call, fetchAllPaginated };
}

async function pullConta(conta, dataDir) {
  const t0 = Date.now();
  const { call, fetchAllPaginated } = createOmieClient(conta.app_key, conta.app_secret);
  const cacheBase = path.join(dataDir, '_cache', conta.slug);
  const contaDir = path.join(dataDir, 'contas', conta.slug);
  fs.mkdirSync(contaDir, { recursive: true });

  let empresa = null;
  try {
    const e = await call('/geral/empresas/', 'ListarEmpresas', { pagina: 1, registros_por_pagina: 50, apenas_importado_api: 'N' });
    empresa = (e.empresas_cadastro && e.empresas_cadastro[0]) || null;
  } catch (e) {
    return { conta, error: `empresa: ${e.message}`, movimentos: [] };
  }

  const [catR, deptR] = await Promise.all([
    fetchAllPaginated('/geral/categorias/', 'ListarCategorias', {}, 'categoria_cadastro', path.join(cacheBase, 'categorias')).catch(() => ({ records: [] })),
    fetchAllPaginated('/geral/depart/', 'ListarDepartamentos', {}, 'departamentos', path.join(cacheBase, 'departamentos')).catch(() => ({ records: [] })),
  ]);
  const cliR = await fetchAllPaginated('/geral/clientes/', 'ListarClientes', {}, 'clientes_cadastro', path.join(cacheBase, 'clientes')).catch(() => ({ records: [] }));
  const ccR = await fetchAllPaginated('/geral/contacorrente/', 'ListarContasCorrentes', {}, 'ListarContasCorrentes', path.join(cacheBase, 'contas_correntes')).catch(() => ({ records: [] }));
  const movR = await fetchAllPaginated(
    '/financas/mf/', 'ListarMovimentos', { cExibirDepartamentos: 'S' }, 'movimentos',
    path.join(cacheBase, 'movimentos'), { style: 'camel' }
  ).catch((e) => { return { records: [], _err: e.message }; });

  const categorias = catR.records;
  const departamentos = deptR.records;
  const clientes = cliR.records;
  const contasCorrentes = ccR.records;
  const movimentos = movR.records;

  // Tag de origem em cada movimento — preserva schema RAW pro build-data.cjs
  for (const m of movimentos) {
    m._conta = conta.conta;
    m._conta_slug = conta.slug;
    m._cliente_grupo = conta.cliente;
  }
  for (const c of contasCorrentes) {
    c._conta = conta.conta;
    c._conta_slug = conta.slug;
  }

  // Persiste raw por conta (auditoria + retomada)
  fs.writeFileSync(path.join(contaDir, 'empresa.json'), JSON.stringify(empresa, null, 2));
  fs.writeFileSync(path.join(contaDir, 'categorias.json'), JSON.stringify(categorias));
  fs.writeFileSync(path.join(contaDir, 'departamentos.json'), JSON.stringify(departamentos));
  fs.writeFileSync(path.join(contaDir, 'clientes.json'), JSON.stringify(clientes));
  fs.writeFileSync(path.join(contaDir, 'contas_correntes.json'), JSON.stringify(contasCorrentes));
  fs.writeFileSync(path.join(contaDir, 'movimentos.json'), JSON.stringify(movimentos));

  return {
    conta,
    empresa,
    categorias, departamentos, clientes, contasCorrentes, movimentos,
    summary: {
      conta: conta.conta,
      slug: conta.slug,
      cliente_grupo: conta.cliente,
      empresa: empresa?.nome_fantasia || '',
      cnpj: empresa?.cnpj_cpf || '',
      counts: {
        movimentos: movimentos.length,
        categorias: categorias.length,
        departamentos: departamentos.length,
        clientes: clientes.length,
        contas_correntes: contasCorrentes.length,
      },
      duration_ms: Date.now() - t0,
      err: movR._err || null,
    },
  };
}

module.exports = {
  id: 'omie-multi',
  label: 'Omie multi-conta (paralelo via Sheets)',
  required_env: [],
  validate(config) {
    const errors = [];
    if (!config.fontes || !config.fontes.omie_multi) {
      errors.push('config.fontes.omie_multi não definido');
    }
    return { ok: errors.length === 0, errors };
  },

  async pull(config, dataDir) {
    fs.mkdirSync(dataDir, { recursive: true });
    const cfg = config.fontes.omie_multi || {};
    const sheetsId = cfg.sheets_id || SHEETS_ID_DEFAULT;
    const concurrency = cfg.concurrency || 24;
    const skip = new Set((cfg.skip || []).map(s => s.toLowerCase()));
    const only = new Set((cfg.only || []).map(s => s.toLowerCase()));
    const clienteLabel = cfg.cliente_label || config.cliente?.nome || 'Grupo';

    console.log(`\n=== omie-multi pull ===`);
    console.log(`  Sheets: ${sheetsId}`);

    let contasAll = await loadContas(sheetsId);
    let contas = contasAll.filter(c => !skip.has(c.conta.toLowerCase()));
    if (only.size > 0) contas = contas.filter(c => only.has(c.conta.toLowerCase()));

    console.log(`  Contas ativas: ${contasAll.length} (após filtros: ${contas.length})`);
    console.log(`  Concorrência: ${Math.min(concurrency, contas.length)} paralelo(s)`);
    console.log();

    const t0 = Date.now();
    const inFlight = new Set();
    const results = [];
    let started = 0;

    async function runWorker(c) {
      const idx = ++started;
      const tStart = Date.now();
      console.log(`  [${String(idx).padStart(2, '0')}/${contas.length}] START  ${c.conta}`);
      try {
        const r = await pullConta(c, dataDir);
        const dur = ((Date.now() - tStart) / 1000).toFixed(1);
        if (r.error) {
          console.log(`  [${String(idx).padStart(2, '0')}/${contas.length}] ERROR  ${c.conta} (${dur}s) — ${r.error}`);
        } else {
          console.log(`  [${String(idx).padStart(2, '0')}/${contas.length}] OK     ${c.conta} (${dur}s) — ${r.movimentos.length} movs`);
        }
        return r;
      } catch (e) {
        const dur = ((Date.now() - tStart) / 1000).toFixed(1);
        console.log(`  [${String(idx).padStart(2, '0')}/${contas.length}] FATAL  ${c.conta} (${dur}s) — ${e.message.slice(0, 100)}`);
        return { conta: c, error: e.message, movimentos: [] };
      }
    }

    const queue = [...contas];
    while (queue.length > 0 || inFlight.size > 0) {
      while (inFlight.size < concurrency && queue.length > 0) {
        const c = queue.shift();
        const p = runWorker(c).then(r => { inFlight.delete(p); results.push(r); });
        inFlight.add(p);
      }
      if (inFlight.size > 0) await Promise.race(inFlight);
    }

    const totalDur = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`\n  Pull paralelo concluído em ${totalDur}s`);

    // Consolidação RAW (formato esperado pelo build-data.cjs)
    const allMovimentos = [];
    const okResults = results.filter(r => !r.error);
    const errResults = results.filter(r => r.error);

    // Movimentos RAW de TODAS as contas (com _conta, _conta_slug, _cliente_grupo já injetados)
    for (const r of okResults) allMovimentos.push(...(r.movimentos || []));
    fs.writeFileSync(path.join(dataDir, 'movimentos.json'), JSON.stringify(allMovimentos));

    // Lookups deduplicados — preserva primeira ocorrência por chave
    function dedupConsolidate(items, keyFn) {
      const seen = new Set();
      const out = [];
      for (const it of items) {
        const k = keyFn(it);
        if (k == null || seen.has(k)) continue;
        seen.add(k);
        out.push(it);
      }
      return out;
    }
    const allCategorias = okResults.flatMap(r => r.categorias || []);
    const allDepartamentos = okResults.flatMap(r => r.departamentos || []);
    const allClientes = okResults.flatMap(r => r.clientes || []);
    const allContasCorrentes = okResults.flatMap(r => r.contasCorrentes || []);

    fs.writeFileSync(path.join(dataDir, 'categorias.json'),
      JSON.stringify(dedupConsolidate(allCategorias, c => c.codigo)));
    fs.writeFileSync(path.join(dataDir, 'departamentos.json'),
      JSON.stringify(dedupConsolidate(allDepartamentos, d => d.codigo)));
    fs.writeFileSync(path.join(dataDir, 'clientes.json'),
      JSON.stringify(dedupConsolidate(allClientes, c => c.codigo_cliente_omie)));
    // CCs: chave composta (conta, nCodCC) — cada conta tem seu próprio espaço de IDs
    fs.writeFileSync(path.join(dataDir, 'contas_correntes.json'),
      JSON.stringify(dedupConsolidate(allContasCorrentes, c => `${c._conta_slug}:${c.nCodCC}`)));

    // Empresa "synthetic" — representa o grupo
    const cnpjs = okResults.map(r => r.empresa?.cnpj_cpf).filter(Boolean);
    fs.writeFileSync(path.join(dataDir, 'empresa.json'), JSON.stringify({
      nome_fantasia: clienteLabel,
      razao_social: `${clienteLabel} (consolidado de ${okResults.length} contas)`,
      cnpj: '',
      cidade: 'Multi',
      uf: 'SP/ES',
      contas_qtd: okResults.length,
      cnpjs,
    }, null, 2));

    // Summary com breakdown por conta
    const summary = {
      adapter: 'omie-multi',
      timestamp: new Date().toISOString(),
      sheets_id: sheetsId,
      records: allMovimentos.length,
      contas_total: contas.length,
      contas_ok: okResults.length,
      contas_erro: errResults.length,
      duration_s: Number(totalDur),
      counts: {
        movimentos: allMovimentos.length,
        categorias: dedupConsolidate(allCategorias, c => c.codigo).length,
        departamentos: dedupConsolidate(allDepartamentos, d => d.codigo).length,
        clientes: dedupConsolidate(allClientes, c => c.codigo_cliente_omie).length,
        contas_correntes: dedupConsolidate(allContasCorrentes, c => `${c._conta_slug}:${c.nCodCC}`).length,
      },
      por_conta: okResults.map(r => r.summary)
        .sort((a, b) => b.counts.movimentos - a.counts.movimentos),
      erros: errResults.map(r => ({ conta: r.conta?.conta || 'unknown', error: r.error })),
    };
    fs.writeFileSync(path.join(dataDir, '_summary.json'), JSON.stringify(summary, null, 2));

    console.log();
    console.log(`  Movimentos RAW consolidados: ${allMovimentos.length}`);
    console.log(`  Contas OK: ${okResults.length}/${contas.length}${errResults.length > 0 ? '  ERROS: ' + errResults.length : ''}`);
    if (errResults.length > 0) {
      for (const er of errResults) console.log(`    ✖ ${er.conta?.conta || '?'}: ${er.error}`);
    }
    console.log();

    return { fetched: allMovimentos.length, summary };
  },
};
