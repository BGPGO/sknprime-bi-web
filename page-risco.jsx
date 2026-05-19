/* PageRisco — Risco & Concentração (HHI multi-dimensional)
 *
 * 4 indicadores HHI lado-a-lado:
 *   - Receita por loja (concentração: 1 loja predominante = risco)
 *   - Despesa por fornecedor (1 fornecedor crítico = refém)
 *   - Receita por canal (rua / shopping / aeroporto — derivado do nome)
 *   - Receita por marca (Domino's, Optcália, etc)
 *
 * HHI = Σ(share²) × 10000.   <1500 saudável · 1500-2500 moderado · >2500 alto
 *
 * + Curva de Pareto top 10 lojas + top 10 fornecedores.
 */

const PageRisco = ({ filters, statusFilter, drilldown, setDrilldown, year, month }) => {
  const B = useMemo(() => window.getBit ? window.getBit(statusFilter, drilldown, year, month, filters) : (window.BIT || {}), [statusFilter, drilldown, year, month, filters]);
  const REF_YEAR = window.REF_YEAR || new Date().getFullYear();
  const DBC = B.DRE_BY_CONTA || {};
  const CONTAS = B.CONTAS || [];
  const ALL_TX = window.ALL_TX || [];

  // ===== Derivar marca + canal a partir do nome da empresa =====
  const inferMarca = (label) => {
    const u = (label||"").toUpperCase();
    if (u.includes("PIZZARIA")) return "Pizzaria";
    if (u.includes("ÓPTICA") || u.includes("OPTICA")) return "Óptica";
    if (u.includes("DOCES")) return "Doces";
    if (u.includes("PADARIA")) return "Padaria";
    if (u.includes("SORVETES")) return "Sorvetes";
    if (u.includes("MASSAS")) return "Massas";
    if (u.includes("SAUDÁVEL") || u.includes("SAUDAVEL")) return "Saudável";
    if (u.includes("KIOSK")) return "Kiosk";
    if (u.includes("LIVRARIA")) return "Livraria";
    return "Outras";
  };
  const inferCanal = (label) => {
    const u = (label||"").toUpperCase();
    if (u.includes("AEROPORTO")) return "Aeroporto";
    if (u.includes("SHOPPING")) return "Shopping";
    return "Rua / Bairro";
  };

  // ===== Calcular shares =====
  const dataLojas = useMemo(() => {
    return CONTAS.map(c => {
      const d = DBC[c.slug];
      const dre = d?.MONTH_DRE || [];
      const receita = dre.reduce((s,m)=>s+m.receita, 0);
      return {
        slug: c.slug, label: c.label,
        marca: inferMarca(c.label),
        canal: inferCanal(c.label),
        receita,
      };
    }).filter(r => r.receita > 0).sort((a,b) => b.receita - a.receita);
  }, [DBC, CONTAS]);

  // Despesa por fornecedor: ALL_TX [kind, mes, dia, categoria, cliente, valor, realizado, fornecedor, cc, conta_slug]
  const dataFornecedores = useMemo(() => {
    const map = new Map();
    for (const r of ALL_TX) {
      if (r[0] !== 'd') continue;
      if (r[6] !== 1) continue;
      if (!r[1] || Number(r[1].slice(0,4)) !== REF_YEAR) continue;
      const f = r[7] || "Sem fornecedor";
      map.set(f, (map.get(f) || 0) + r[5]);
    }
    return [...map.entries()].map(([f, v]) => ({ name: f, valor: v }))
      .sort((a,b) => b.valor - a.valor)
      .filter(x => x.valor > 0);
  }, [ALL_TX, REF_YEAR]);

  // Agrupar por marca / canal
  const dataPorMarca = useMemo(() => {
    const map = new Map();
    for (const l of dataLojas) {
      const m = map.get(l.marca) || { name: l.marca, valor: 0, count: 0 };
      m.valor += l.receita; m.count += 1;
      map.set(l.marca, m);
    }
    return [...map.values()].sort((a,b) => b.valor - a.valor);
  }, [dataLojas]);

  const dataPorCanal = useMemo(() => {
    const map = new Map();
    for (const l of dataLojas) {
      const m = map.get(l.canal) || { name: l.canal, valor: 0, count: 0 };
      m.valor += l.receita; m.count += 1;
      map.set(l.canal, m);
    }
    return [...map.values()].sort((a,b) => b.valor - a.valor);
  }, [dataLojas]);

  // HHI: Σ(share²) × 10000
  const hhi = (arr, valKey = 'valor') => {
    const total = arr.reduce((s, x) => s + (x[valKey]||0), 0);
    if (total <= 0) return 0;
    return arr.reduce((s, x) => {
      const share = (x[valKey]||0) / total;
      return s + share * share;
    }, 0) * 10000;
  };

  const hhiLoja = useMemo(() => hhi(dataLojas, 'receita'), [dataLojas]);
  const hhiMarca = useMemo(() => hhi(dataPorMarca), [dataPorMarca]);
  const hhiCanal = useMemo(() => hhi(dataPorCanal), [dataPorCanal]);
  const hhiForn = useMemo(() => hhi(dataFornecedores), [dataFornecedores]);

  const fmtBRL = (n) => "R$ " + formatBR(n||0, 0);
  const fmtPct = (n) => (n||0).toFixed(1).replace(".",",")+"%";

  // Gauge HHI
  const HhiCard = ({ label, value, hint, n }) => {
    const v = Math.min(value, 10000);
    const pct = (v / 10000) * 100;
    let tone = "green", status = "Saudável";
    if (v > 2500) { tone = "red"; status = "Alta"; }
    else if (v > 1500) { tone = "amber"; status = "Moderada"; }
    const color = tone === "red" ? "var(--red)" : (tone === "amber" ? "var(--amber)" : "var(--green)");
    return (
      <div className="card" style={{ minWidth: 0 }}>
        <div style={{ fontSize: 11, color: "var(--fg-3)", textTransform: "uppercase", letterSpacing: 0.6, fontWeight: 600 }}>{label}</div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: 8 }}>
          <div style={{ fontSize: 32, fontWeight: 800, color, lineHeight: 1.1 }}>{Math.round(value)}</div>
          <div style={{ fontSize: 12, color, fontWeight: 600 }}>{status}</div>
        </div>
        <div style={{ background: "var(--border)", borderRadius: 4, height: 6, marginTop: 10, overflow: "hidden" }}>
          <div style={{ width: pct + "%", height: "100%", background: color }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "var(--fg-3)", marginTop: 3 }}>
          <span>0</span><span>1500</span><span>2500</span><span>10k</span>
        </div>
        {hint && <div style={{ fontSize: 11, color: "var(--fg-2)", marginTop: 6 }}>{hint}</div>}
        {n != null && <div style={{ fontSize: 10, color: "var(--fg-3)", marginTop: 2 }}>{n} {n === 1 ? "item" : "itens"}</div>}
      </div>
    );
  };

  // Pareto chart: barras + linha cumulativa %
  const ParetoChart = ({ data, valKey = "valor", topN = 10, height = 200 }) => {
    if (!data || data.length === 0) return null;
    const top = data.slice(0, topN);
    const total = data.reduce((s, x) => s + (x[valKey]||0), 0);
    const W = 720, ml = 50, mr = 40, mt = 12, mb = 50;
    const cw = W - ml - mr;
    const ch = height - mt - mb;
    const max = Math.max(...top.map(x => x[valKey]||0));
    const slot = cw / top.length;
    const barW = slot * 0.6;
    const x = (i) => ml + i*slot + (slot - barW)/2;
    const yBar = (v) => mt + ch - (v / max) * ch;
    const yLine = (p) => mt + ch - (p / 100) * ch;
    let cum = 0;
    const cumData = top.map(d => { cum += (d[valKey]||0); return { ...d, cumPct: total > 0 ? (cum/total)*100 : 0 }; });
    const linePath = cumData.map((d,i) => `${i===0?'M':'L'}${(x(i)+barW/2).toFixed(1)},${yLine(d.cumPct).toFixed(1)}`).join(' ');
    return (
      <div style={{ width: "100%", maxWidth: W }}>
      <svg viewBox={`0 0 ${W} ${height}`} style={{ display: "block", width: "100%", height: "auto" }}>
        {[0, 25, 50, 75, 100].map(p => (
          <g key={p}>
            <line x1={ml} y1={yLine(p)} x2={W-mr} y2={yLine(p)} stroke="var(--border)" strokeDasharray="3,3" />
            <text x={W-mr+4} y={yLine(p)+3} fontSize="9" fill="var(--fg-3)">{p}%</text>
          </g>
        ))}
        {cumData.map((d,i) => (
          <rect key={i} x={x(i)} y={yBar(d[valKey]||0)} width={barW}
            height={Math.max(1, (mt+ch) - yBar(d[valKey]||0))}
            fill="var(--cyan)" opacity={0.7} rx={2} />
        ))}
        <path d={linePath} fill="none" stroke="var(--amber)" strokeWidth={2} />
        {cumData.map((d,i) => (
          <circle key={"d"+i} cx={x(i)+barW/2} cy={yLine(d.cumPct)} r={3} fill="var(--amber)" />
        ))}
        {cumData.map((d,i) => {
          const lbl = (d.name || "").length > 14 ? (d.name||"").slice(0,12)+"…" : d.name;
          return (
            <text key={"lb"+i} x={x(i)+barW/2} y={height-30}
              transform={`rotate(-30 ${x(i)+barW/2} ${height-30})`}
              textAnchor="end" fontSize="9" fill="var(--fg-2)">{lbl}</text>
          );
        })}
        <text x={ml-5} y={mt+ch+3} textAnchor="end" fontSize="9" fill="var(--fg-3)">0</text>
      </svg>
      </div>
    );
  };

  return (
    <div className="page">
      <div className="page-title">
        <div>
          <h1>Risco & Concentração · {REF_YEAR}</h1>
          <div className="status-line">
            HHI = índice Herfindahl-Hirschman. &lt;1500 saudável · 1500-2500 moderado · &gt;2500 alto risco de concentração
          </div>
        </div>
      </div>

      <div className="row" style={{ gridTemplateColumns: "repeat(2, 1fr)", gap: 16 }}>
        <HhiCard label="Receita por loja"   value={hhiLoja}  hint={`Top 1: ${dataLojas[0]?.label||"—"} (${fmtPct((dataLojas[0]?.receita||0) / Math.max(1, dataLojas.reduce((s,x)=>s+x.receita,0)) * 100)} do total)`} n={dataLojas.length} />
        <HhiCard label="Receita por marca"  value={hhiMarca} hint={`Top 1: ${dataPorMarca[0]?.name||"—"} (${dataPorMarca[0]?.count||0} lojas)`} n={dataPorMarca.length} />
        <HhiCard label="Receita por canal"  value={hhiCanal} hint={`${dataPorCanal.map(c=>c.name+" ("+c.count+")").join(" · ")}`} n={dataPorCanal.length} />
        <HhiCard label="Despesa por fornecedor" value={hhiForn} hint={`Top 1: ${dataFornecedores[0]?.name||"—"} (${fmtPct((dataFornecedores[0]?.valor||0) / Math.max(1, dataFornecedores.reduce((s,x)=>s+x.valor,0)) * 100)} da despesa)`} n={dataFornecedores.length} />
      </div>

      {/* Pareto Lojas */}
      <div className="card">
        <h2 className="card-title">Pareto — Top 10 Lojas (% acumulado da receita)</h2>
        <ParetoChart data={dataLojas.map(l => ({ name: l.label, valor: l.receita }))} topN={10} />
        <div className="status-line" style={{ marginTop: 6 }}>
          {(() => {
            const total = dataLojas.reduce((s,l)=>s+l.receita, 0);
            const top5 = dataLojas.slice(0,5).reduce((s,l)=>s+l.receita, 0);
            const top10 = dataLojas.slice(0,10).reduce((s,l)=>s+l.receita, 0);
            return `Top 5 = ${fmtPct(total>0?(top5/total)*100:0)} da receita · Top 10 = ${fmtPct(total>0?(top10/total)*100:0)}`;
          })()}
        </div>
      </div>

      {/* Pareto Fornecedores */}
      <div className="card">
        <h2 className="card-title">Pareto — Top 10 Fornecedores (% acumulado da despesa)</h2>
        <ParetoChart data={dataFornecedores} topN={10} />
        <div className="status-line" style={{ marginTop: 6 }}>
          {(() => {
            const total = dataFornecedores.reduce((s,l)=>s+l.valor, 0);
            const top5 = dataFornecedores.slice(0,5).reduce((s,l)=>s+l.valor, 0);
            const top10 = dataFornecedores.slice(0,10).reduce((s,l)=>s+l.valor, 0);
            return `Top 5 = ${fmtPct(total>0?(top5/total)*100:0)} · Top 10 = ${fmtPct(total>0?(top10/total)*100:0)}`;
          })()}
        </div>
      </div>

      {/* Distribuição por marca + canal */}
      <div className="row" style={{ gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div className="card">
          <h2 className="card-title">Receita por marca</h2>
          <table className="t">
            <thead><tr><th>Marca</th><th className="num">Lojas</th><th className="num">Receita</th><th className="num">Share</th></tr></thead>
            <tbody>
              {(() => {
                const total = dataPorMarca.reduce((s,x)=>s+x.valor, 0);
                return dataPorMarca.map(m => (
                  <tr key={m.name}>
                    <td>{m.name}</td>
                    <td className="num">{m.count}</td>
                    <td className="num">{fmtBRL(m.valor)}</td>
                    <td className="num cyan"><b>{fmtPct(total>0?(m.valor/total)*100:0)}</b></td>
                  </tr>
                ));
              })()}
            </tbody>
          </table>
        </div>
        <div className="card">
          <h2 className="card-title">Receita por canal</h2>
          <table className="t">
            <thead><tr><th>Canal</th><th className="num">Lojas</th><th className="num">Receita</th><th className="num">Share</th></tr></thead>
            <tbody>
              {(() => {
                const total = dataPorCanal.reduce((s,x)=>s+x.valor, 0);
                return dataPorCanal.map(m => (
                  <tr key={m.name}>
                    <td>{m.name}</td>
                    <td className="num">{m.count}</td>
                    <td className="num">{fmtBRL(m.valor)}</td>
                    <td className="num cyan"><b>{fmtPct(total>0?(m.valor/total)*100:0)}</b></td>
                  </tr>
                ));
              })()}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

Object.assign(window, { PageRisco });
