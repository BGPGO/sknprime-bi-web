/* PageLojas — Painel de Lojas (ranking 24 contas)
 *
 * Tabela com as 24 empresas em linhas, KPIs por coluna:
 *   Receita YTD | Custo | Despesa | Imposto | Líquido | Margem % | Sparkline
 * Ordenável por qualquer coluna. Click na linha → filtra o BI inteiro por essa loja.
 *
 * Usa DRE_BY_CONTA pré-computado (já tem split custo/imposto/despesa por loja×mês).
 */

const PageLojas = ({ statusFilter, drilldown, setDrilldown, year, month }) => {
  const B = window.BIT || {};
  const REF_YEAR = window.REF_YEAR || new Date().getFullYear();
  const DBC = B.DRE_BY_CONTA || {};
  const CONTAS = B.CONTAS || [];

  const [sortKey, setSortKey] = useState("liquido");
  const [sortDir, setSortDir] = useState("desc");

  const rows = useMemo(() => {
    return CONTAS.map(c => {
      const d = DBC[c.slug];
      if (!d) return null;
      const dre = d.MONTH_DRE || [];
      const orc = d.ORCAMENTO || {};
      const receita = dre.reduce((s,m)=>s+m.receita, 0);
      const custo = dre.reduce((s,m)=>s+m.custo, 0);
      const despesa = dre.reduce((s,m)=>s+m.despesa, 0);
      const imposto = dre.reduce((s,m)=>s+m.imposto, 0);
      const liquido = receita - custo - despesa - imposto;
      const margem = receita > 0 ? (liquido / receita) * 100 : 0;
      const monthsActive = dre.filter(m => m.count > 0).length;
      // sparkline: receita por mês ao longo do ano
      const spark = dre.map(m => m.receita);
      // Líquido orçado/mês (regra do user)
      const liqOrc = (orc.receita_mes||0) - (orc.custo_mes||0) - (orc.despesa_mes||0) - (orc.imposto_mes||0);
      // Variação real vs orçado YTD (média realizada vs líquido orçado/mês)
      const realLiqMes = monthsActive > 0 ? liquido / monthsActive : 0;
      const deltaPct = liqOrc !== 0 ? ((realLiqMes - liqOrc) / Math.abs(liqOrc)) * 100 : null;
      return {
        slug: c.slug, label: c.label, cliente_grupo: c.cliente_grupo,
        receita, custo, despesa, imposto, liquido, margem, spark,
        monthsActive, liqOrc, realLiqMes, deltaPct,
      };
    }).filter(Boolean);
  }, [DBC, CONTAS]);

  const sorted = useMemo(() => {
    const arr = rows.slice();
    arr.sort((a, b) => {
      let av = a[sortKey], bv = b[sortKey];
      if (typeof av === "string") {
        return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      av = Number(av || 0); bv = Number(bv || 0);
      return sortDir === "asc" ? av - bv : bv - av;
    });
    return arr;
  }, [rows, sortKey, sortDir]);

  // KPIs do topo: Top 5 e Bottom 5 por líquido
  const topPositive = sorted.filter(r => r.liquido > 0).slice(0, 5);
  const bottomLossList = sorted.filter(r => r.liquido < 0)
    .slice().sort((a,b) => a.liquido - b.liquido).slice(0, 5);
  const totalRec = rows.reduce((s,r) => s + r.receita, 0);
  const totalLiq = rows.reduce((s,r) => s + r.liquido, 0);
  const positiveCount = rows.filter(r => r.liquido > 0).length;
  const inactiveCount = rows.filter(r => r.monthsActive === 0).length;

  const fmtBRL = (n) => "R$ " + formatBR(n||0, 0);
  const fmtK = (n) => {
    const a = Math.abs(n||0);
    if (a >= 1e6) return (n>=0?"":"-") + "R$" + (Math.abs(n)/1e6).toFixed(2).replace(".",",")+"M";
    if (a >= 1e3) return (n>=0?"":"-") + "R$" + (Math.abs(n)/1e3).toFixed(0)+"k";
    return fmtBRL(n);
  };

  const onSort = (k) => {
    if (sortKey === k) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(k); setSortDir("desc"); }
  };
  const sortInd = (k) => sortKey === k ? (sortDir === "asc" ? " ▲" : " ▼") : "";

  // Sparkline mini SVG
  const SparkLine = ({ values, color = "var(--cyan)" }) => {
    if (!values || values.length === 0) return null;
    const W = 80, H = 22;
    const max = Math.max(...values, 1);
    const min = Math.min(...values, 0);
    const range = (max - min) || 1;
    const x = (i) => (i / (values.length-1)) * W;
    const y = (v) => H - ((v - min) / range) * H;
    const path = values.map((v,i) => `${i===0?'M':'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
    return (
      <svg width={W} height={H} style={{ display: "block" }}>
        <path d={path} fill="none" stroke={color} strokeWidth={1.5} />
      </svg>
    );
  };

  const onRowClick = (slug, label) => {
    setDrilldown({ type: 'conta', value: slug, label });
  };

  return (
    <div className="page">
      <div className="page-title">
        <div>
          <h1>Painel de Lojas · {REF_YEAR}</h1>
          <div className="status-line">
            {rows.length} empresas · {positiveCount} positivas · {rows.length - positiveCount - inactiveCount} negativas · {inactiveCount} sem caixa em {REF_YEAR}
          </div>
        </div>
      </div>

      <div className="kpi-row">
        <KpiTile tone="cyan"  label="Receita consolidada" value={fmtBRL(totalRec)} hint={`${rows.length} lojas`} />
        <KpiTile tone={totalLiq >= 0 ? "green" : "red"} label="Líquido consolidado" value={fmtBRL(totalLiq)} hint={`Margem ${(totalRec>0?(totalLiq/totalRec)*100:0).toFixed(1).replace(".",",")}%`} />
        <KpiTile tone="green" label="Lojas no positivo" value={String(positiveCount)} nonMonetary hint={`${rows.length - positiveCount - inactiveCount} no negativo · ${inactiveCount} inativas`} />
        <KpiTile tone="amber" label="Maior prejuízo" value={fmtBRL(bottomLossList[0]?.liquido || 0)} hint={bottomLossList[0]?.label || "—"} />
      </div>

      {/* === Tabela ranking === */}
      <div className="card">
        <h2 className="card-title">Ranking — clique numa empresa pra filtrar todo o BI</h2>
        <div className="t-scroll" style={{ overflowX: "auto" }}>
          <table className="t" style={{ minWidth: 900 }}>
            <thead>
              <tr>
                <th style={{ cursor: "pointer" }} onClick={() => onSort("label")}>Empresa{sortInd("label")}</th>
                <th className="num" style={{ cursor: "pointer" }} onClick={() => onSort("receita")}>Receita YTD{sortInd("receita")}</th>
                <th className="num" style={{ cursor: "pointer" }} onClick={() => onSort("custo")}>Custo{sortInd("custo")}</th>
                <th className="num" style={{ cursor: "pointer" }} onClick={() => onSort("despesa")}>Despesa{sortInd("despesa")}</th>
                <th className="num" style={{ cursor: "pointer" }} onClick={() => onSort("imposto")}>Imposto{sortInd("imposto")}</th>
                <th className="num" style={{ cursor: "pointer" }} onClick={() => onSort("liquido")}>Líquido{sortInd("liquido")}</th>
                <th className="num" style={{ cursor: "pointer" }} onClick={() => onSort("margem")}>Margem %{sortInd("margem")}</th>
                <th className="num" style={{ cursor: "pointer" }} onClick={() => onSort("deltaPct")}>vs Orç{sortInd("deltaPct")}</th>
                <th>Receita 12m</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r, i) => {
                const isInactive = r.monthsActive === 0;
                const liqColor = r.liquido > 0 ? "var(--green)" : (r.liquido < 0 ? "var(--red)" : "var(--fg-3)");
                const margemColor = r.margem > 0 ? "var(--green)" : (r.margem < 0 ? "var(--red)" : "var(--fg-3)");
                const dColor = r.deltaPct == null ? "var(--fg-3)" : (r.deltaPct >= 0 ? "var(--green)" : "var(--red)");
                return (
                  <tr key={r.slug}
                    onClick={() => onRowClick(r.slug, r.label)}
                    style={{ cursor: "pointer", opacity: isInactive ? 0.5 : 1 }}
                    className="lojas-row"
                  >
                    <td><b>{r.label}</b>{isInactive && <span style={{ color: "var(--fg-3)", marginLeft: 6, fontSize: 10 }}>(sem real)</span>}</td>
                    <td className="num">{fmtK(r.receita)}</td>
                    <td className="num">{fmtK(r.custo)}</td>
                    <td className="num">{fmtK(r.despesa)}</td>
                    <td className="num">{fmtK(r.imposto)}</td>
                    <td className="num" style={{ color: liqColor, fontWeight: 600 }}>{fmtK(r.liquido)}</td>
                    <td className="num" style={{ color: margemColor }}>{r.margem.toFixed(1).replace(".",",")}%</td>
                    <td className="num" style={{ color: dColor, fontSize: 11 }}>{r.deltaPct == null ? "—" : (r.deltaPct >= 0 ? "+" : "") + r.deltaPct.toFixed(0) + "%"}</td>
                    <td><SparkLine values={r.spark} color={r.liquido >= 0 ? "var(--green)" : "var(--red)"} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* === Top + Bottom em cards lado-a-lado === */}
      <div className="row" style={{ gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div className="card">
          <h2 className="card-title" style={{ color: "var(--green)" }}>Top 5 — Maior líquido positivo</h2>
          <table className="t">
            <tbody>
              {topPositive.map(r => (
                <tr key={r.slug} onClick={() => onRowClick(r.slug, r.label)} style={{ cursor: "pointer" }}>
                  <td>{r.label}</td>
                  <td className="num green"><b>{fmtBRL(r.liquido)}</b></td>
                  <td className="num">{r.margem.toFixed(1).replace(".",",")}%</td>
                </tr>
              ))}
              {topPositive.length === 0 && <tr><td colSpan="3" style={{ color: "var(--fg-3)", textAlign: "center" }}>Nenhuma empresa positiva em {REF_YEAR}</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="card">
          <h2 className="card-title" style={{ color: "var(--red)" }}>Bottom 5 — Maior prejuízo</h2>
          <table className="t">
            <tbody>
              {bottomLossList.map(r => (
                <tr key={r.slug} onClick={() => onRowClick(r.slug, r.label)} style={{ cursor: "pointer" }}>
                  <td>{r.label}</td>
                  <td className="num red"><b>{fmtBRL(r.liquido)}</b></td>
                  <td className="num">{r.margem.toFixed(1).replace(".",",")}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

Object.assign(window, { PageLojas });
