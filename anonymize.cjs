#!/usr/bin/env node
/* Anonimiza data.js: troca nomes reais (empresas, fornecedores, clientes,
 * CNPJs) por placeholders. Mantém estrutura, valores e datas reais. */
'use strict';
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, 'data.js');
let txt = fs.readFileSync(SRC, 'utf8');

// === Mapeamento de empresas reais → labels anônimos ===
const empresaMap = {
  'DOMINOS VILA CLEMENTINO':         'Pizzaria Loja 01',
  'BOALI SHOPPING PRAIA DA COSTA':   'Saudável Loja 02',
  'DOMINOS SERRA':                   'Pizzaria Loja 03',
  'DOMINOS JARDIM CAMBURI':          'Pizzaria Loja 04',
  'DOMINOS PRAIA DO CANTO':          'Pizzaria Loja 05',
  'DOMINOS ACLIMAÇÃO':               'Pizzaria Loja 06',
  'DOMINOS PINHEIROS':               'Pizzaria Loja 07',
  'DOMINOS AEROPORTO GUARULHOS':     'Pizzaria Aeroporto 08',
  'DOMINOS MANDAQUI':                'Pizzaria Loja 09',
  'DOMINOS GOPOUVA':                 'Pizzaria Loja 10',
  'DOMINOS CAMPO BELO':              'Pizzaria Loja 11',
  'SPOLETO JABAQUARA':               'Massas Shopping 12',
  'DOMINOS JABAQUARA':               'Pizzaria Loja 13',
  'BOLO DE ROLO FAIR TRADE SDU':     'Doces Aeroporto 14',
  'LUIGI ALEGRE':                    'Sorvetes Shopping 15',
  'CASA BAUDUCCO AEROPORTO VIX':     'Padaria Aeroporto 16',
  'OCULUM SHOPPING VILA VELHA':      'Óptica Shopping 17',
  'OCULUM SHOPPING VITÓRIA':         'Óptica Shopping 18',
  'BOLO DE ROLO AEROPORTO VIX':      'Doces Aeroporto 19',
  'NATUZON AEROPORTO VIX':           'Kiosk Aeroporto 20',
  'NOBEL & ZASTRAS AEROPORTO VIX':   'Livraria Aeroporto 21',
  'OPTCÁLIA SHOPPING PRAIA DA COSTA':'Óptica Shopping 22',
  'OPTCÁLIA SHOPPING VITÓRIA':       'Óptica Shopping 23',
  'OPTCÁLIA NITERÓI':                'Óptica Loja 24',
};

// 1. Substitui empresas (label e dentro de strings JSON)
for (const [orig, anon] of Object.entries(empresaMap)) {
  // escape regex meta
  const esc = orig.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  txt = txt.replace(new RegExp(esc, 'g'), anon);
}

// 2. Empresa do grupo
txt = txt.replace(/Grupo DEX/g, 'Grupo Demo');
txt = txt.replace(/DEX INVEST/g, 'DEMO HOLDING');
txt = txt.replace(/Dex Invest/g, 'Demo Holding');
txt = txt.replace(/ACE INVEST COMERCIO E VAREJO LTDA/g, 'EMPRESA A LTDA');
txt = txt.replace(/GACE INVEST COMERCIO E VAREJO LTDA/g, 'EMPRESA B LTDA');
txt = txt.replace(/DEX LUMEN VIX LTDA/g, 'EMPRESA C LTDA');
txt = txt.replace(/DEX INVEST COMERCIO E VAREJO LTDA/g, 'EMPRESA D LTDA');
txt = txt.replace(/TDF INVEST/g, 'EMPRESA E');
txt = txt.replace(/GELADOS e TAPIOCA COMERCIO E VAREJO/g, 'EMPRESA F');
txt = txt.replace(/OLMO SORVETES E CAFE LTDA/g, 'EMPRESA G LTDA');
txt = txt.replace(/OPTICAL PC/g, 'OPTICA H');
txt = txt.replace(/OPTICAL VIX/g, 'OPTICA I');
txt = txt.replace(/OPTICAL NIT/g, 'OPTICA J');
txt = txt.replace(/FAIR TRADE COFFEE BRASIL/g, 'EMPRESA K');
txt = txt.replace(/SR ALIMENTACAO LTDA/g, 'EMPRESA L LTDA');
txt = txt.replace(/PC ALIMENTOS LTDA/g, 'EMPRESA M LTDA');
txt = txt.replace(/JC REFEICOES LTDA/g, 'EMPRESA N LTDA');
txt = txt.replace(/OCULUM VILA VELHA/g, 'OPTICA O');
txt = txt.replace(/BROTHERS FRANCHISE COMERCIO VAREJISTA LTDA/g, 'EMPRESA P LTDA');

// 3. Anonimiza nomes de cliente / fornecedor dentro de strings JSON
// Padrão: tudo que esteja em "cliente":"NOME" ou no top-N de listas — vou substituir
// nomes específicos comuns que apareceram. Como são muitos (28k), uso uma estratégia
// mais agressiva: detecto sequências de letras maiúsculas longas (tipo razões sociais)
// e substituo. Risco baixo de afetar palavras curtas.
//
// Em vez disso, faço dedupe das strings em ALL_TX e CLIENTES/FORNECEDORES tops:
// - Junto todos os nomes que aparecem no data.js entre aspas e que pareçam nome próprio
//   (CAPS LOCK, > 6 letras, sem números)
// - Cria um map nome → "Cliente NN" / "Fornecedor NN"
const nameRegex = /"([A-Z][A-Z0-9 \-&.\/]{6,80}LTDA|[A-Z][A-Z0-9 \-&.\/]{6,80}ME|[A-Z][A-Z0-9 \-&.\/]{6,80}EIRELI|[A-Z][A-Z0-9 \-&.\/]{6,80}S\.?A\.?|[A-Z][A-Z0-9 \-&.\/]{6,80}SA)"/g;
const found = new Set();
let m;
while ((m = nameRegex.exec(txt)) !== null) {
  found.add(m[1]);
}
const nameMap = {};
let i = 1;
for (const name of found) {
  if (Object.values(empresaMap).includes(name)) continue;
  nameMap[name] = `Empresa Anônima ${String(i).padStart(3, '0')}`;
  i++;
}
console.log(`Detectados ${found.size} nomes pessoa-jurídica → anonimizando...`);
for (const [orig, anon] of Object.entries(nameMap)) {
  const esc = orig.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  txt = txt.replace(new RegExp('"' + esc + '"', 'g'), '"' + anon + '"');
}

// 4. Pessoas físicas (nomes próprios) — heurística: 2+ palavras capitalizadas em sequência.
// Risco: pegar nomes de cidade. Mitigação: só substitui dentro de campos cliente/fornecedor.
// Pra simplicidade, substitui sequências "Nome Sobrenome [Sobrenome2]" entre aspas
// que tenham 2-4 palavras com primeira letra maiúscula seguida de minúsculas.
const personRegex = /"([A-ZÁÉÍÓÚÂÊÔÃÕÇ][a-záéíóúâêôãõç]+(?:\s+(?:da|de|do|das|dos|e)\s+|\s+)[A-ZÁÉÍÓÚÂÊÔÃÕÇ][a-záéíóúâêôãõç]+(?:\s+[A-ZÁÉÍÓÚÂÊÔÃÕÇ][a-záéíóúâêôãõç]+){0,3})"/g;
const persons = new Set();
while ((m = personRegex.exec(txt)) !== null) {
  // Filtra falsos positivos comuns: meses, sentenças
  const v = m[1];
  if (/^(janeiro|fevereiro|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)/i.test(v)) continue;
  if (/Sem |Conta |Banco |Cartão /.test(v)) continue;
  persons.add(v);
}
const personMap = {};
let pi = 1;
for (const p of persons) {
  personMap[p] = `Pessoa ${String(pi).padStart(3, '0')}`;
  pi++;
}
console.log(`Detectadas ${persons.size} pessoas físicas → anonimizando...`);
for (const [orig, anon] of Object.entries(personMap)) {
  const esc = orig.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  txt = txt.replace(new RegExp('"' + esc + '"', 'g'), '"' + anon + '"');
}

// 5. CNPJs (formato XX.XXX.XXX/XXXX-XX ou só números 14 dígitos)
txt = txt.replace(/\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/g, '00.000.000/0000-00');

// 6. Cidades reais (Vitória, Vila Velha, Niterói, etc) — manter ou trocar?
// Vamos trocar pra evitar inferência geográfica
txt = txt.replace(/\bVitória\b/g, 'Cidade A');
txt = txt.replace(/\bVila Velha\b/g, 'Cidade B');
txt = txt.replace(/\bNiterói\b/g, 'Cidade C');
txt = txt.replace(/\bGuarulhos\b/g, 'Cidade D');
txt = txt.replace(/\bJabaquara\b/g, 'Cidade E');
txt = txt.replace(/\bAclimação\b/g, 'Cidade F');
txt = txt.replace(/\bMandaqui\b/g, 'Cidade G');
txt = txt.replace(/\bGopouva\b/g, 'Cidade H');
txt = txt.replace(/\bCampo Belo\b/g, 'Cidade I');

fs.writeFileSync(SRC, txt);
console.log(`OK: data.js anonimizado (${(txt.length / 1024 / 1024).toFixed(2)} MB)`);
