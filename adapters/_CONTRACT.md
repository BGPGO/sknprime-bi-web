# Adapter Contract — fontes de dados pluráveis

> Cada cliente tem uma ou mais fontes de dados. O BI é fonte-agnóstico:
> consome apenas o **formato canonical** que cada adapter produz.

## Como funciona

1. `bi.config.js > fontes` declara quais adapters usar:
   ```js
   fontes: {
     adapters: ["omie"],         // ou ["conta-azul"], ["bling"], ["manual-xlsx"], ou múltiplos
     omie: { app_key_env: "OMIE_APP_KEY", ... },
     drive: { base_path: "G:/..." },
   }
   ```

2. `build-data.cjs` itera os adapters configurados, chama `pull()` de cada um,
   e merge-eia o output canonical em `data/`.

3. O resto do BI (build-data.cjs cálculos + frontend) consome `data/*.json` no
   formato canonical, agnóstico de fonte.

## Contrato canonical (output que cada adapter DEVE produzir)

Cada adapter expõe `module.exports = { id, label, pull, validate }`:

```js
module.exports = {
  id: "omie",                     // identificador único
  label: "Omie ERP",               // legível pra UI/log
  required_env: ["OMIE_APP_KEY", "OMIE_APP_SECRET"],

  // valida config + env disponíveis. Retorna { ok, errors }
  validate(config) { ... },

  // executa o pull. Escreve JSONs em data/. Retorna { fetched, summary }
  async pull(config, dataDir) { ... },
};
```

### JSONs canonicals esperados em `data/`

```
data/
├─ empresa.json              # { nome_fantasia, codigo, cnpj, cidade, uf }
├─ categorias.json           # [{ codigo, descricao, tipo: 'receita'|'despesa' }]
├─ departamentos.json        # [{ codigo, descricao }]
├─ clientes.json             # [{ codigo, nome_fantasia, razao_social, cnpj, ... }]
├─ contas_correntes.json     # [{ id, nome, banco, codigo_banco, saldo_inicial }]
├─ movimentos.json           # ARRAY canonical (UMA fonte de verdade do BI)
└─ _summary.json             # metadados do pull (timestamp, fonte, contagens)
```

### Schema de `movimentos.json` (canonical)

Cada movimento é uma transação financeira normalizada:

```ts
{
  id: string,                  // único dentro da fonte (ex: nCodTitulo do Omie)
  fonte: string,               // adapter id ('omie', 'conta-azul', etc)
  natureza: 'R' | 'P',         // Receita ou Pagar
  status: 'PAGO' | 'A VENCER' | 'ATRASADO' | 'VENCE HOJE' | 'CANCELADO',
  realizado: boolean,          // status === 'PAGO' || 'RECEBIDO'

  data_emissao: string,        // ISO 8601 'YYYY-MM-DD'
  data_vencimento: string,     // ISO 8601
  data_pagamento: string|null, // ISO 8601 ou null se não realizado

  valor_total: number,         // bruto positivo (ex: 1500.00)
  valor_pago: number,          // 0 se não realizado, valor_total se pago integral
  valor_aberto: number,        // valor a vencer (se não realizado) ou 0

  categoria: string,           // resolvido (não código)
  centro_custo: string,        // departamento, centro de custo
  cliente: string,             // razão social ou nome (resolvido)
  conta_corrente: string,      // banco/conta
  codigo_banco: string,        // ex: '033' (Santander), '748' (Sicredi), '756' (Sicoob)

  observacao: string,          // descrição livre
  tags: string[],              // tags do ERP (se houver)
}
```

**Importante:**
- Valores SEMPRE positivos (sinal vem de `natureza`).
- Datas sempre ISO 8601 — frontend converte pra dd/mm/yyyy.
- Categorias resolvidas (texto), não códigos.
- Cliente sempre resolvido (não ID do cadastro).

## Adapters disponíveis

| Adapter | Status | Lê de | Adequado pra |
|---|---|---|---|
| `omie` | ✅ Pronto | API Omie REST | clientes Omie |
| `conta-azul` | 🟡 Skeleton | API Conta Azul | clientes Conta Azul |
| `bling` | ⚪ TODO | API Bling v3 | clientes Bling |
| `tiny` | ⚪ TODO | API Tiny v2 | clientes Tiny |
| `manual-xlsx` | 🟡 Skeleton | XLSX no Drive | clientes sem ERP integrável |
| `f360` | ⚪ TODO | F360 (Bottega) | controladoria F360 |
| `ssw` | ⚪ TODO | Playwright SSW | logística SSW |

## Como criar adapter novo

1. Copia `adapters/_template.cjs` pra `adapters/<nome>.cjs`
2. Implementa `validate()` e `pull()` retornando JSONs no schema canonical
3. Adiciona ao `adapters/index.cjs` (registry)
4. Atualiza `bi.config.example.js` com schema do novo adapter
5. Documenta nesse `_CONTRACT.md`

## Multi-fonte

Cliente pode ter múltiplas fontes:

```js
fontes: {
  adapters: ["omie", "manual-xlsx"],   // pull dos dois, merge
  omie: { ... },
  manual_xlsx: {
    files: ["receitas-extras.xlsx"]    // só pra coisas fora do ERP
  },
}
```

`build-data.cjs` faz merge de `movimentos.json` de cada adapter, deduplica por
`(fonte, id)`, e processa.
