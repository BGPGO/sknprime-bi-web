/* PageOrcamento — Orçado vs Realizado estilo fin40
 *
 * Padrão fin40 OrcadoRealizadoTab + MiniLineChart:
 *   - Cada célula da tabela mostra REAL grande + ORÇADO pequeno embaixo (sobreposição visual)
 *   - Gráficos: linha sólida (Real) + linha tracejada (Orçado) no mesmo SVG
 *
 * Regra do orçamento (definida pelo usuário):
 *   Receita orçada = melhor mês de receita do REF_YEAR
 *   Custo orçado   = média dos meses ativos
 *   Despesa orçada = média dos meses ativos
 *   Imposto orçado = média dos meses ativos
 *
 * Filtro de empresa: usa DRE_BY_CONTA pré-computado (split custo/imposto por loja).
 */

// ===== Mini gráfico de linha sobreposta (fin40 MiniLineChart) =====
const OvLineChart = ({ data, height = 180, label = "" }) => {
  // data: [{ m, real, orcado }]
  if (!data || data.length === 0) return null;
  const W = 720, ml = 50, mr = 10, mt = 10, mb = 26;
  const cw = W - ml - mr;
  const ch = height - mt - mb;
  const allVals = data.flatMap(d => [d.real, d.orcado]);
  const minVal = Math.min(0, ...allVals);
  const maxVal = Math.max(0, ...allVals);
  const range = (maxVal - minVal) || 1;
  const pad = range * 0.12;
  const yMin = minVal - pad;
  const yMax = maxVal + pad;
  const x = (i) => ml + (i / (data.length - 1)) * cw;
  const y = (v) => mt + ch - ((v - yMin) / (yMax - yMin)) * ch;
  const yZero = y(0);
  const realPath = data.map((d, i) => `${i===0?'M':'L'}${x(i).toFixed(1)},${y(d.real).toFixed(1)}`).join(' ');
  const orcPath  = data.map((d, i) => `${i===0?'M':'L'}${x(i).toFixed(1)},${y(d.orcado).toFixed(1)}`).join(' ');
  const fmtTick = (v) => {
    const a = Math.abs(v);
    if (a >= 1e6) return (v/1e6).toFixed(1).replace(".",",")+"M";
    if (a >= 1e3) return (v/1e3).toFixed(0)+"k";
    return v.toFixed(0);
  };
  const yTicks = 5;
  const step = (yMax - yMin) / yTicks;
  return (
    <div style={{ background: "var(--bg)", borderRadius: 8, padding: 10, border: "1px solid var(--border)" }}>
      {label && <div style={{ fontSize: 11, color: "var(--fg-3)", textTransform: "uppercase", letterSpacing: 0.6, fontWeight: 600, marginBottom: 4 }}>{label}</div>}
      <svg width="100%" viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none" style={{ display: "block", height }}>
        {Array.from({length:yTicks+1}).map((_,i) => {
          const v = yMin + i*step;
          const yy = y(v);
          return (<g key={i}>
            <line x1={ml} y1={yy} x2={W-mr} y2={yy} stroke="var(--border)" strokeDasharray="3,3" />
            <text x={ml-5} y={yy+3} textAnchor="end" fontSize="9" fill="var(--fg-3)">{fmtTick(v)}</text>
          </g>);
        })}
        {yMin < 0 && yMax > 0 && (
          <line x1={ml} y1={yZero} x2={W-mr} y2={yZero} stroke="var(--fg-3)" strokeDasharray="2,2" strokeWidth={0.7} />
        )}
        <path d={orcPath} fill="none" stroke="var(--fg-3)" strokeWidth={1.5} strokeDasharray="6,4" />
        <path d={realPath} fill="none" stroke="var(--cyan)" strokeWidth={2.5} />
        {data.map((d,i) => (
          <circle key={i} cx={x(i)} cy={y(d.real)} r={3} fill="var(--cyan)" />
        ))}
        {data.map((d,i) => (
          <text key={"l"+i} x={x(i)} y={height-4} textAnchor="middle" fontSize="9" fill="var(--fg-3)">{(d.m||"").slice(0,3)}</text>
        ))}
      </svg>
      <div style={{ display: "flex", justifyContent: "center", gap: 16, marginTop: 4, fontSize: 10, color: "var(--fg-3)" }}>
        <span><span style={{ display: "inline-block", width: 14, height: 2, background: "var(--cyan)", verticalAlign: "middle", marginRight: 4 }} />Realizado</span>
        <span><span style={{ display: "inline-block", width: 14, height: 0, borderTop: "1.5px dashed var(--fg-3)", verticalAlign: "middle", marginRight: 4 }} />Orçado</span>
      </div>
    </div>
  );
};

// ===== Bar chart com sobreposição: 2 barras lado-a-lado por categoria, +
//       linha tracejada do orçado no topo da barra (estilo fin40 stacked) =====
const OvBarChart = ({ data, height = 180, label = "" }) => {
  // data: [{ m, real, orcado }]
  if (!data || data.length === 0) return null;
  const W = 720, ml = 50, mr = 10, mt = 10, mb = 26;
  const cw = W - ml - mr;
  const ch = height - mt - mb;
  const allVals = data.flatMap(d => [d.real, d.orcado]);
  const minVal = Math.min(0, ...allVals);
  const maxVal = Math.max(0, ...allVals);
  const range = (maxVal - minVal) || 1;
  const pad = range * 0.12;
  const yMin = minVal - pad;
  const yMax = maxVal + pad;
  const slot = cw / data.length;
  const barW = slot * 0.55;
  const x = (i) => ml + i*slot + (slot - barW)/2;
  const y = (v) => mt + ch - ((v - yMin) / (yMax - yMin)) * ch;
  const yZero = y(0);
  const fmtTick = (v) => {
    const a = Math.abs(v);
    if (a >= 1e6) return (v/1e6).toFixed(1).replace(".",",")+"M";
    if (a >= 1e3) return (v/1e3).toFixed(0)+"k";
    return v.toFixed(0);
  };
  const yTicks = 5;
  const step = (yMax - yMin) / yTicks;
  return (
    <div style={{ background: "var(--bg)", borderRadius: 8, padding: 10, border: "1px solid var(--border)" }}>
      {label && <div style={{ fontSize: 11, color: "var(--fg-3)", textTransform: "uppercase", letterSpacing: 0.6, fontWeight: 600, marginBottom: 4 }}>{label}</div>}
      <svg width="100%" viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none" style={{ display: "block", height }}>
        {Array.from({length:yTicks+1}).map((_,i) => {
          const v = yMin + i*step;
          const yy = y(v);
          return (<g key={i}>
            <line x1={ml} y1={yy} x2={W-mr} y2={yy} stroke="var(--border)" strokeDasharray="3,3" />
            <text x={ml-5} y={yy+3} textAnchor="end" fontSize="9" fill="var(--fg-3)">{fmtTick(v)}</text>
          </g>);
        })}
        {data.map((d,i) => {
          const xCenter = x(i) + barW/2;
          const isPos = d.real >= 0;
          const yReal = y(d.real);
          const realH = Math.abs(yZero - yReal);
          const yOrc = y(d.orcado);
          const widthOrc = barW * 1.15;
          return (
            <g key={i}>
              {/* Barra real (sólida) */}
              <rect x={x(i)} y={isPos ? yReal : yZero} width={barW} height={Math.max(1, realH)}
                fill={isPos ? "var(--cyan)" : "var(--red)"} rx={2} opacity={0.85} />
              {/* Linha do orçado em cima — overlay (estilo fin40 dashed) */}
              <line x1={xCenter - widthOrc/2} y1={yOrc} x2={xCenter + widthOrc/2} y2={yOrc}
                stroke="var(--fg-2)" strokeWidth={2.2} strokeDasharray="4,3" />
            </g>
          );
        })}
        {data.map((d,i) => (
          <text key={"l"+i} x={x(i) + barW/2} y={height-4} textAnchor="middle" fontSize="9" fill="var(--fg-3)">{(d.m||"").slice(0,3)}</text>
        ))}
      </svg>
      <div style={{ display: "flex", justifyContent: "center", gap: 16, marginTop: 4, fontSize: 10, color: "var(--fg-3)" }}>
        <span><span style={{ display: "inline-block", width: 14, height: 8, background: "var(--cyan)", verticalAlign: "middle", marginRight: 4, borderRadius: 2 }} />Realizado</span>
        <span><span style={{ display: "inline-block", width: 14, height: 0, borderTop: "2px dashed var(--fg-2)", verticalAlign: "middle", marginRight: 4 }} />Orçado</span>
      </div>
    </div>
  );
};

// ===== Célula com sobreposição: real grande + orçado embaixo + δ% =====
const OvCell = ({ real, orcado, isRealized, neg = false }) => {
  const fmt = (n) => "R$ " + formatBR(n||0, 0);
  const delta = orcado === 0 || !isRealized ? null : ((real - orcado) / orcado) * 100;
  // Pra real == 0 (mes futuro), só mostra orçado
  if (!isRealized) {
    return (
      <td className="num" style={{ color: "var(--fg-3)" }}>
        <div style={{ fontSize: 11, fontStyle: "italic" }}>{fmt(orcado)}</div>
        <div style={{ fontSize: 9, opacity: 0.5 }}>orçado</div>
      </td>
    );
  }
  const realColor = neg ? "var(--red)" : (real >= 0 ? "var(--green)" : "var(--red)");
  const dColor = delta == null ? "var(--fg-3)" : (delta >= 0 ? "var(--green)" : "var(--red)");
  // Para custo/despesa (neg=true), variação positiva (gastou mais que orçou) é RUIM (vermelho)
  const dColorAdjusted = neg && delta != null
    ? (delta <= 0 ? "var(--green)" : "var(--red)")
    : dColor;
  return (
    <td className="num">
      <div style={{ fontWeight: 600, color: realColor }}>{fmt(real)}</div>
      <div style={{ fontSize: 10, color: "var(--fg-3)", marginTop: 1 }}>
        orç {fmt(orcado)}
        {delta != null && (
          <span style={{ color: dColorAdjusted, marginLeft: 6, fontWeight: 600 }}>
            {(delta >= 0 ? "+" : "") + delta.toFixed(1).replace(".", ",") + "%"}
          </span>
        )}
      </div>
    </td>
  );
};

const PageOrcamento = ({ statusFilter, drilldown, setDrilldown, year, month }) => {
  const B = window.BIT || {};
  const REF_YEAR = window.REF_YEAR || new Date().getFullYear();
  const MONTHS_FULL = B.MONTHS_FULL || ["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];

  const isContaFilter = drilldown && drilldown.type === 'conta';

  // Quando filtro de empresa ativo, usa DRE_BY_CONTA pré-computado (split completo).
  // Senão, usa MONTH_DRE / ORCAMENTO consolidados.
  const { DRE, ORC, contaLabel } = useMemo(() => {
    if (isContaFilter && B.DRE_BY_CONTA && B.DRE_BY_CONTA[drilldown.value]) {
      const d = B.DRE_BY_CONTA[drilldown.value];
      return { DRE: d.MONTH_DRE, ORC: d.ORCAMENTO, contaLabel: d.label || drilldown.label };
    }
    return { DRE: B.MONTH_DRE || [], ORC: B.ORCAMENTO || {}, contaLabel: null };
  }, [isContaFilter, drilldown, B.MONTH_DRE, B.ORCAMENTO, B.DRE_BY_CONTA]);

  const monthsRealized = DRE.filter(m => m.count > 0).length;
  const monthsRemaining = Math.max(0, 12 - monthsRealized);
  const totalRec = DRE.reduce((s,m)=>s+m.receita, 0);
  const totalCus = DRE.reduce((s,m)=>s+m.custo, 0);
  const totalDes = DRE.reduce((s,m)=>s+m.despesa, 0);
  const totalImp = DRE.reduce((s,m)=>s+m.imposto, 0);
  const totalLiq = totalRec - totalCus - totalImp - totalDes;
  // Total ano = real YTD + orçado meses restantes
  const projRec = totalRec + (ORC.receita_mes||0) * monthsRemaining;
  const projCus = totalCus + (ORC.custo_mes  ||0) * monthsRemaining;
  const projDes = totalDes + (ORC.despesa_mes||0) * monthsRemaining;
  const projImp = totalImp + (ORC.imposto_mes||0) * monthsRemaining;
  const projLiq = projRec - projCus - projImp - projDes;

  const fmtBRL = (n) => "R$ " + formatBR(n||0, 0);
  const ddata = DRE.map(m => ({
    m: m.m,
    real_rec: m.count > 0 ? m.receita : 0,
    real_cus: m.count > 0 ? m.custo : 0,
    real_des: m.count > 0 ? m.despesa : 0,
    real_imp: m.count > 0 ? m.imposto : 0,
    real_liq: m.count > 0 ? m.liquido : 0,
    isRealized: m.count > 0,
  }));
  const orcRec = ORC.receita_mes || 0;
  const orcCus = ORC.custo_mes || 0;
  const orcDes = ORC.despesa_mes || 0;
  const orcImp = ORC.imposto_mes || 0;
  const orcLiq = orcRec - orcCus - orcDes - orcImp;
  const liqChart  = ddata.map(d => ({ m: d.m, real: d.real_liq, orcado: orcLiq }));
  const recChart  = ddata.map(d => ({ m: d.m, real: d.real_rec, orcado: orcRec }));
  const desComposChart = ddata.map(d => ({ m: d.m, real: d.real_cus + d.real_des + d.real_imp, orcado: orcCus + orcDes + orcImp }));

  return (
    <div className="page">
      <div className="page-title">
        <div>
          <h1>Orçamento {REF_YEAR}{contaLabel ? ` · ${contaLabel}` : " · Consolidado"}</h1>
          <div className="status-line">
            Receita orçada = melhor mês ({MONTHS_FULL[ORC.melhor_mes_idx||0] || "—"}, R$ {formatBR(ORC.receita_mes||0, 0)}). Custo / despesa / imposto = média de {ORC.meses_ativos||0} meses ativos.
            {isContaFilter && monthsRealized === 0 && <span style={{ color: "var(--amber)", marginLeft: 8 }}> · Esta empresa não tem caixa realizado em {REF_YEAR}.</span>}
          </div>
        </div>
      </div>

      <DrilldownBadge drilldown={drilldown} onClear={() => setDrilldown(null)} />

      {/* === Cards de orçamento === */}
      <div className="kpi-row">
        <KpiTile tone="green" label="Receita orçada (/mês)" value={fmtBRL(orcRec)} hint={`Melhor mês: ${MONTHS_FULL[ORC.melhor_mes_idx||0] || "—"}`} />
        <KpiTile tone="amber" label="Custo médio (/mês)"    value={fmtBRL(orcCus)} hint={`Média de ${ORC.meses_ativos||0} meses`} />
        <KpiTile tone="red"   label="Despesa média (/mês)"  value={fmtBRL(orcDes)} hint={`Média de ${ORC.meses_ativos||0} meses`} />
        <KpiTile tone={orcLiq >= 0 ? "cyan" : "red"} label="Líquido orçado (/mês)" value={fmtBRL(orcLiq)} hint={`Anual: R$ ${formatBR(orcLiq*12, 0)}`} />
      </div>

      {/* === Gráficos overlay === */}
      <div className="row" style={{ gridTemplateColumns: "1fr", gap: 16 }}>
        <div className="card">
          <h2 className="card-title">Líquido — Real vs Orçado</h2>
          <OvLineChart data={liqChart} label={`${contaLabel || "Consolidado"} · ${REF_YEAR}`} />
        </div>
      </div>
      <div className="row" style={{ gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div className="card">
          <h2 className="card-title">Receita — Real vs Orçado</h2>
          <OvBarChart data={recChart} label="Receita mensal" />
        </div>
        <div className="card">
          <h2 className="card-title">Saídas (Custo + Despesa + Imposto)</h2>
          <OvBarChart data={desComposChart} label="Total de saídas mensal" />
        </div>
      </div>

      {/* === Tabela compacta com sobreposição === */}
      <div className="card">
        <h2 className="card-title">Tabela mensal · Real (orçado / Δ%)</h2>
        <div className="t-scroll" style={{ overflowX: "auto" }}>
          <table className="t" style={{ minWidth: 640 }}>
            <thead>
              <tr>
                <th>Mês</th>
                <th className="num">Receita</th>
                <th className="num">Custo</th>
                <th className="num">Imposto</th>
                <th className="num">Despesa</th>
                <th className="num">Líquido</th>
              </tr>
            </thead>
            <tbody>
              {DRE.map((m, i) => {
                const isR = m.count > 0;
                return (
                  <tr key={i}>
                    <td><b>{MONTHS_FULL[i]}</b>{!isR && <span style={{ color: "var(--fg-3)", marginLeft: 6, fontSize: 10 }}>(sem real)</span>}</td>
                    <OvCell real={m.receita} orcado={orcRec} isRealized={isR} />
                    <OvCell real={m.custo}   orcado={orcCus} isRealized={isR} neg />
                    <OvCell real={m.imposto} orcado={orcImp} isRealized={isR} neg />
                    <OvCell real={m.despesa} orcado={orcDes} isRealized={isR} neg />
                    <OvCell real={m.liquido} orcado={orcLiq} isRealized={isR} />
                  </tr>
                );
              })}
              <tr style={{ background: "rgba(34,211,238,0.06)", fontWeight: 700, borderTop: "2px solid var(--cyan)" }}>
                <td>TOTAL projetado {REF_YEAR}</td>
                <OvCell real={projRec} orcado={orcRec*12} isRealized={true} />
                <OvCell real={projCus} orcado={orcCus*12} isRealized={true} neg />
                <OvCell real={projImp} orcado={orcImp*12} isRealized={true} neg />
                <OvCell real={projDes} orcado={orcDes*12} isRealized={true} neg />
                <OvCell real={projLiq} orcado={orcLiq*12} isRealized={true} />
              </tr>
            </tbody>
          </table>
        </div>
        <div className="status-line" style={{ marginTop: 8 }}>
          <b>TOTAL projetado</b> = realizado YTD ({monthsRealized} {monthsRealized === 1 ? "mês" : "meses"}) + orçamento dos {monthsRemaining} {monthsRemaining === 1 ? "mês" : "meses"} restantes — mesma lógica do Ano 1 do Valuation (alinhado fin40).
        </div>
      </div>
    </div>
  );
};

Object.assign(window, { PageOrcamento, OvLineChart, OvBarChart });
