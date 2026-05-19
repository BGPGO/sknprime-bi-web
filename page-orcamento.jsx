/* PageOrcamento — Orçado vs Realizado estilo fin40 + Plugado pra frente
 *
 * - Gráficos plotam todos os 12 meses: REAL até o último mês com dado;
 *   PROJETADO (tracejado, mesma cor mais clara) até dezembro usando orçamento.
 * - Sem preserveAspectRatio="none" → não distorce mais.
 * - Adiciona gráfico de saldo acumulado anual mostrando "efeito no fim do ano".
 */

// ===== Linha overlay com plugagem forward =====
// data: [{ m, real, orcado, isRealized }]. Real após último isRealized é projetado (tracejado).
const OvLineChart = ({ data, height = 200, label = "" }) => {
  if (!data || data.length === 0) return null;
  const W = 720, ml = 50, mr = 12, mt = 12, mb = 28;
  const cw = W - ml - mr;
  const ch = height - mt - mb;
  const allVals = data.flatMap(d => [d.real, d.orcado]).filter(v => v != null);
  const minVal = Math.min(0, ...allVals);
  const maxVal = Math.max(0, ...allVals);
  const range = (maxVal - minVal) || 1;
  const pad = range * 0.12;
  const yMin = minVal - pad;
  const yMax = maxVal + pad;
  const x = (i) => ml + (i / Math.max(1, data.length - 1)) * cw;
  const y = (v) => mt + ch - ((v - yMin) / (yMax - yMin)) * ch;
  const yZero = y(0);
  const lastRealIdx = data.reduce((a, d, i) => d.isRealized ? i : a, -1);
  // Real path = só índices realizados (sólido).
  const realData = data.filter((d, i) => i <= lastRealIdx);
  const realPath = realData.map((d, i) => `${i === 0 ? 'M' : 'L'}${x(data.indexOf(d)).toFixed(1)},${y(d.real).toFixed(1)}`).join(' ');
  // Forecast path = do último real ate o final, usando d.real (já vem com orcado pluggado pra frente).
  const fcData = data.filter((d, i) => i >= lastRealIdx);
  const fcPath = fcData.length >= 2
    ? fcData.map((d, i) => `${i === 0 ? 'M' : 'L'}${x(data.indexOf(d)).toFixed(1)},${y(d.real).toFixed(1)}`).join(' ')
    : '';
  const orcPath = data.map((d, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(d.orcado).toFixed(1)}`).join(' ');
  const fmtTick = (v) => {
    const a = Math.abs(v);
    if (a >= 1e6) return (v/1e6).toFixed(1).replace(".",",")+"M";
    if (a >= 1e3) return (v/1e3).toFixed(0)+"k";
    return v.toFixed(0);
  };
  const yTicks = 5;
  const step = (yMax - yMin) / yTicks;
  // Linha vertical separando "real" de "projetado" (depois do último real)
  const splitX = lastRealIdx >= 0 && lastRealIdx < data.length - 1 ? x(lastRealIdx) : null;
  return (
    <div style={{ background: "var(--bg)", borderRadius: 8, padding: 10, border: "1px solid var(--border)" }}>
      {label && <div style={{ fontSize: 11, color: "var(--fg-3)", textTransform: "uppercase", letterSpacing: 0.6, fontWeight: 600, marginBottom: 4 }}>{label}</div>}
      <div style={{ width: "100%", maxWidth: W }}>
        <svg viewBox={`0 0 ${W} ${height}`} style={{ display: "block", width: "100%", height: "auto" }}>
          {Array.from({length:yTicks+1}).map((_,i) => {
            const v = yMin + i*step;
            const yy = y(v);
            return (<g key={i}>
              <line x1={ml} y1={yy} x2={W-mr} y2={yy} stroke="var(--border)" strokeDasharray="3,3" />
              <text x={ml-5} y={yy+3} textAnchor="end" fontSize="10" fill="var(--fg-3)">{fmtTick(v)}</text>
            </g>);
          })}
          {yMin < 0 && yMax > 0 && (
            <line x1={ml} y1={yZero} x2={W-mr} y2={yZero} stroke="var(--fg-3)" strokeDasharray="2,2" strokeWidth={0.7} />
          )}
          {/* Banda do horizonte de projeção */}
          {splitX != null && (
            <rect x={splitX} y={mt} width={W-mr-splitX} height={ch} fill="var(--cyan)" opacity={0.04} />
          )}
          {/* Orçado (tracejado cinza) */}
          <path d={orcPath} fill="none" stroke="var(--fg-3)" strokeWidth={1.5} strokeDasharray="6,4" />
          {/* Forecast (cyan claro tracejado) */}
          {fcPath && <path d={fcPath} fill="none" stroke="var(--cyan)" strokeWidth={2} strokeDasharray="5,4" opacity={0.7} />}
          {/* Real (cyan sólido) */}
          {realPath && <path d={realPath} fill="none" stroke="var(--cyan)" strokeWidth={2.5} />}
          {/* Pontos */}
          {realData.map((d,i) => (
            <circle key={"r"+i} cx={x(data.indexOf(d))} cy={y(d.real)} r={3} fill="var(--cyan)" />
          ))}
          {/* Linha vertical de "agora" */}
          {splitX != null && (
            <g>
              <line x1={splitX} y1={mt} x2={splitX} y2={mt+ch} stroke="var(--cyan)" strokeWidth={1} strokeDasharray="2,3" opacity={0.5} />
              <text x={splitX+3} y={mt+9} fontSize="9" fill="var(--cyan)" opacity={0.85}>projeção →</text>
            </g>
          )}
          {data.map((d,i) => (
            <text key={"l"+i} x={x(i)} y={height-6} textAnchor="middle" fontSize="10" fill="var(--fg-3)">{(d.m||"").slice(0,3)}</text>
          ))}
        </svg>
      </div>
      <div style={{ display: "flex", justifyContent: "center", gap: 14, marginTop: 6, fontSize: 11, color: "var(--fg-3)", flexWrap: "wrap" }}>
        <span><span style={{ display: "inline-block", width: 14, height: 2, background: "var(--cyan)", verticalAlign: "middle", marginRight: 4 }} />Realizado</span>
        <span><span style={{ display: "inline-block", width: 14, height: 0, borderTop: "2px dashed var(--cyan)", verticalAlign: "middle", marginRight: 4, opacity: 0.7 }} />Projeção (orçamento)</span>
        <span><span style={{ display: "inline-block", width: 14, height: 0, borderTop: "1.5px dashed var(--fg-3)", verticalAlign: "middle", marginRight: 4 }} />Orçado mensal</span>
      </div>
    </div>
  );
};

// ===== Bar chart: real (sólido) + projeção (mais transparente) + linha overlay orçado =====
const OvBarChart = ({ data, height = 200, label = "" }) => {
  if (!data || data.length === 0) return null;
  const W = 720, ml = 50, mr = 12, mt = 12, mb = 28;
  const cw = W - ml - mr;
  const ch = height - mt - mb;
  const allVals = data.flatMap(d => [d.real, d.orcado]).filter(v => v != null);
  const minVal = Math.min(0, ...allVals);
  const maxVal = Math.max(0, ...allVals);
  const range = (maxVal - minVal) || 1;
  const pad = range * 0.12;
  const yMin = minVal - pad;
  const yMax = maxVal + pad;
  const slot = cw / data.length;
  const barW = slot * 0.6;
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
  const lastRealIdx = data.reduce((a, d, i) => d.isRealized ? i : a, -1);
  return (
    <div style={{ background: "var(--bg)", borderRadius: 8, padding: 10, border: "1px solid var(--border)" }}>
      {label && <div style={{ fontSize: 11, color: "var(--fg-3)", textTransform: "uppercase", letterSpacing: 0.6, fontWeight: 600, marginBottom: 4 }}>{label}</div>}
      <div style={{ width: "100%", maxWidth: W }}>
        <svg viewBox={`0 0 ${W} ${height}`} style={{ display: "block", width: "100%", height: "auto" }}>
          {Array.from({length:yTicks+1}).map((_,i) => {
            const v = yMin + i*step;
            const yy = y(v);
            return (<g key={i}>
              <line x1={ml} y1={yy} x2={W-mr} y2={yy} stroke="var(--border)" strokeDasharray="3,3" />
              <text x={ml-5} y={yy+3} textAnchor="end" fontSize="10" fill="var(--fg-3)">{fmtTick(v)}</text>
            </g>);
          })}
          {data.map((d,i) => {
            const xCenter = x(i) + barW/2;
            const isPos = (d.real||0) >= 0;
            const yReal = y(d.real||0);
            const realH = Math.abs(yZero - yReal);
            const yOrc = y(d.orcado||0);
            const widthOrc = barW * 1.2;
            const isProj = !d.isRealized;
            return (
              <g key={i}>
                <rect x={x(i)} y={isPos ? yReal : yZero} width={barW} height={Math.max(1, realH)}
                  fill={isPos ? "var(--cyan)" : "var(--red)"} rx={2}
                  opacity={isProj ? 0.35 : 0.85}
                  stroke={isProj ? "var(--cyan)" : "none"}
                  strokeWidth={isProj ? 1 : 0}
                  strokeDasharray={isProj ? "3,2" : ""}
                />
                <line x1={xCenter - widthOrc/2} y1={yOrc} x2={xCenter + widthOrc/2} y2={yOrc}
                  stroke="var(--fg-2)" strokeWidth={2} strokeDasharray="4,3" />
              </g>
            );
          })}
          {lastRealIdx >= 0 && lastRealIdx < data.length - 1 && (
            <line x1={x(lastRealIdx) + barW + (slot-barW)/2} y1={mt}
              x2={x(lastRealIdx) + barW + (slot-barW)/2} y2={mt+ch}
              stroke="var(--cyan)" strokeWidth={1} strokeDasharray="2,3" opacity={0.5} />
          )}
          {data.map((d,i) => (
            <text key={"l"+i} x={x(i) + barW/2} y={height-6} textAnchor="middle" fontSize="10" fill="var(--fg-3)">{(d.m||"").slice(0,3)}</text>
          ))}
        </svg>
      </div>
      <div style={{ display: "flex", justifyContent: "center", gap: 14, marginTop: 6, fontSize: 11, color: "var(--fg-3)", flexWrap: "wrap" }}>
        <span><span style={{ display: "inline-block", width: 14, height: 8, background: "var(--cyan)", verticalAlign: "middle", marginRight: 4, borderRadius: 2 }} />Realizado</span>
        <span><span style={{ display: "inline-block", width: 14, height: 8, border: "1px dashed var(--cyan)", background: "rgba(34,211,238,0.18)", verticalAlign: "middle", marginRight: 4, borderRadius: 2 }} />Projeção (orçamento)</span>
        <span><span style={{ display: "inline-block", width: 14, height: 0, borderTop: "2px dashed var(--fg-2)", verticalAlign: "middle", marginRight: 4 }} />Orçado</span>
      </div>
    </div>
  );
};

// ===== Saldo acumulado: real até abril + projeção até dez =====
const OvCumChart = ({ data, height = 220, label = "" }) => {
  // data: [{ m, real_acum, orc_acum, isRealized }]
  if (!data || data.length === 0) return null;
  const W = 720, ml = 60, mr = 14, mt = 14, mb = 30;
  const cw = W - ml - mr;
  const ch = height - mt - mb;
  const allVals = data.flatMap(d => [d.real_acum, d.orc_acum]).filter(v => v != null);
  const minVal = Math.min(0, ...allVals);
  const maxVal = Math.max(0, ...allVals);
  const range = (maxVal - minVal) || 1;
  const pad = range * 0.12;
  const yMin = minVal - pad;
  const yMax = maxVal + pad;
  const x = (i) => ml + (i / Math.max(1, data.length - 1)) * cw;
  const y = (v) => mt + ch - ((v - yMin) / (yMax - yMin)) * ch;
  const yZero = y(0);
  const lastRealIdx = data.reduce((a, d, i) => d.isRealized ? i : a, -1);
  const splitX = lastRealIdx >= 0 && lastRealIdx < data.length - 1 ? x(lastRealIdx) : null;
  // Real path: 0..lastRealIdx
  const realPath = data.slice(0, lastRealIdx+1).map((d, i) =>
    `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(d.real_acum).toFixed(1)}`).join(' ');
  // Forecast: continua do último real
  const fc = data.slice(lastRealIdx >= 0 ? lastRealIdx : 0);
  const fcPath = fc.length >= 2 ? fc.map((d, i) => {
    const idx = data.indexOf(d);
    return `${i === 0 ? 'M' : 'L'}${x(idx).toFixed(1)},${y(d.real_acum).toFixed(1)}`;
  }).join(' ') : '';
  // Orcado path: linha straight do orcamento puro (12 × orcado_mes acumulado)
  const orcPath = data.map((d,i) => `${i===0?'M':'L'}${x(i).toFixed(1)},${y(d.orc_acum).toFixed(1)}`).join(' ');
  const fmtTick = (v) => {
    const a = Math.abs(v);
    if (a >= 1e6) return (v/1e6).toFixed(1).replace(".",",")+"M";
    if (a >= 1e3) return (v/1e3).toFixed(0)+"k";
    return v.toFixed(0);
  };
  const yTicks = 5;
  const step = (yMax - yMin) / yTicks;
  // Final: valor projetado e valor orçado em dez
  const finalReal = data[data.length-1]?.real_acum;
  const finalOrc = data[data.length-1]?.orc_acum;
  return (
    <div style={{ background: "var(--bg)", borderRadius: 8, padding: 10, border: "1px solid var(--border)" }}>
      {label && <div style={{ fontSize: 11, color: "var(--fg-3)", textTransform: "uppercase", letterSpacing: 0.6, fontWeight: 600, marginBottom: 4 }}>{label}</div>}
      <div style={{ width: "100%", maxWidth: W }}>
        <svg viewBox={`0 0 ${W} ${height}`} style={{ display: "block", width: "100%", height: "auto" }}>
          {Array.from({length:yTicks+1}).map((_,i) => {
            const v = yMin + i*step;
            const yy = y(v);
            return (<g key={i}>
              <line x1={ml} y1={yy} x2={W-mr} y2={yy} stroke="var(--border)" strokeDasharray="3,3" />
              <text x={ml-5} y={yy+3} textAnchor="end" fontSize="10" fill="var(--fg-3)">{fmtTick(v)}</text>
            </g>);
          })}
          {yMin < 0 && yMax > 0 && (
            <line x1={ml} y1={yZero} x2={W-mr} y2={yZero} stroke="var(--fg-3)" strokeWidth={0.7} />
          )}
          {splitX != null && (
            <rect x={splitX} y={mt} width={W-mr-splitX} height={ch} fill="var(--cyan)" opacity={0.04} />
          )}
          <path d={orcPath} fill="none" stroke="var(--fg-3)" strokeWidth={1.5} strokeDasharray="6,4" />
          {fcPath && <path d={fcPath} fill="none" stroke="var(--cyan)" strokeWidth={2} strokeDasharray="5,4" opacity={0.65} />}
          {realPath && <path d={realPath} fill="none" stroke="var(--cyan)" strokeWidth={3} />}
          {data.slice(0, lastRealIdx+1).map((d,i) => (
            <circle key={"r"+i} cx={x(i)} cy={y(d.real_acum)} r={3.5} fill="var(--cyan)" />
          ))}
          {/* Marker no fim do ano (projetado) */}
          {finalReal != null && (
            <g>
              <circle cx={x(data.length-1)} cy={y(finalReal)} r={5} fill="var(--cyan)" opacity={0.85} stroke="var(--bg)" strokeWidth={2} />
              <text x={x(data.length-1)-6} y={y(finalReal)-8} textAnchor="end" fontSize="11" fontWeight="700" fill={finalReal >= 0 ? "var(--green)" : "var(--red)"}>
                {fmtTick(finalReal)}
              </text>
            </g>
          )}
          {finalOrc != null && (
            <text x={x(data.length-1)-6} y={y(finalOrc)+12} textAnchor="end" fontSize="10" fill="var(--fg-3)">{fmtTick(finalOrc)}</text>
          )}
          {splitX != null && (
            <g>
              <line x1={splitX} y1={mt} x2={splitX} y2={mt+ch} stroke="var(--cyan)" strokeWidth={1} strokeDasharray="2,3" opacity={0.5} />
              <text x={splitX+3} y={mt+10} fontSize="9" fill="var(--cyan)" opacity={0.85}>projeção →</text>
            </g>
          )}
          {data.map((d,i) => (
            <text key={"l"+i} x={x(i)} y={height-6} textAnchor="middle" fontSize="10" fill="var(--fg-3)">{(d.m||"").slice(0,3)}</text>
          ))}
        </svg>
      </div>
      <div style={{ display: "flex", justifyContent: "center", gap: 14, marginTop: 6, fontSize: 11, color: "var(--fg-3)", flexWrap: "wrap" }}>
        <span><span style={{ display: "inline-block", width: 14, height: 3, background: "var(--cyan)", verticalAlign: "middle", marginRight: 4 }} />Real acumulado</span>
        <span><span style={{ display: "inline-block", width: 14, height: 0, borderTop: "2px dashed var(--cyan)", verticalAlign: "middle", marginRight: 4, opacity: 0.65 }} />Projeção pra fim do ano</span>
        <span><span style={{ display: "inline-block", width: 14, height: 0, borderTop: "1.5px dashed var(--fg-3)", verticalAlign: "middle", marginRight: 4 }} />Orçado puro (12× orçado/mês)</span>
      </div>
    </div>
  );
};

// ===== Célula com sobreposição: real grande + orçado embaixo + δ% =====
const OvCell = ({ real, orcado, isRealized, neg = false }) => {
  const fmt = (n) => "R$ " + formatBR(n||0, 0);
  const delta = orcado === 0 || !isRealized ? null : ((real - orcado) / orcado) * 100;
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

const PageOrcamento = ({ filters, statusFilter, drilldown, setDrilldown, year, month }) => {
  const B = useMemo(() => window.getBit ? window.getBit(statusFilter, drilldown, year, month, filters) : (window.BIT || {}), [statusFilter, drilldown, year, month, filters]);
  const REF_YEAR = window.REF_YEAR || new Date().getFullYear();
  const MONTHS_FULL = B.MONTHS_FULL || ["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];

  const isContaFilter = drilldown && drilldown.type === 'conta';

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
  const projRec = totalRec + (ORC.receita_mes||0) * monthsRemaining;
  const projCus = totalCus + (ORC.custo_mes  ||0) * monthsRemaining;
  const projDes = totalDes + (ORC.despesa_mes||0) * monthsRemaining;
  const projImp = totalImp + (ORC.imposto_mes||0) * monthsRemaining;
  const projLiq = projRec - projCus - projImp - projDes;

  const fmtBRL = (n) => "R$ " + formatBR(n||0, 0);

  const orcRec = ORC.receita_mes || 0;
  const orcCus = ORC.custo_mes || 0;
  const orcDes = ORC.despesa_mes || 0;
  const orcImp = ORC.imposto_mes || 0;
  const orcLiq = orcRec - orcCus - orcDes - orcImp;

  // Dados pros gráficos (12 meses): real onde tem, orçado plugado pra frente
  const liqChart = DRE.map(m => ({
    m: m.m,
    real: m.count > 0 ? m.liquido : orcLiq,         // plugado pra frente
    orcado: orcLiq,
    isRealized: m.count > 0,
  }));
  const recChart = DRE.map(m => ({
    m: m.m,
    real: m.count > 0 ? m.receita : orcRec,
    orcado: orcRec,
    isRealized: m.count > 0,
  }));
  const desComposChart = DRE.map(m => ({
    m: m.m,
    real: m.count > 0 ? (m.custo + m.despesa + m.imposto) : (orcCus + orcDes + orcImp),
    orcado: orcCus + orcDes + orcImp,
    isRealized: m.count > 0,
  }));
  // Acumulado: vai somando mês a mês — real até último mês com count, depois projeção
  const cumChart = (() => {
    let realAcum = 0, orcAcum = 0;
    return DRE.map((m, i) => {
      if (m.count > 0) realAcum += m.liquido;
      else realAcum += orcLiq;
      orcAcum += orcLiq;
      return { m: m.m, real_acum: realAcum, orc_acum: orcAcum, isRealized: m.count > 0 };
    });
  })();

  const finalProjLiq = cumChart[cumChart.length-1]?.real_acum || 0;
  const finalOrcLiq = cumChart[cumChart.length-1]?.orc_acum || 0;

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

      <div className="kpi-row">
        <KpiTile tone="green" label="Receita orçada (/mês)" value={fmtBRL(orcRec)} hint={`Melhor mês: ${MONTHS_FULL[ORC.melhor_mes_idx||0] || "—"}`} />
        <KpiTile tone="amber" label="Custo médio (/mês)"    value={fmtBRL(orcCus)} hint={`Média de ${ORC.meses_ativos||0} meses`} />
        <KpiTile tone="red"   label="Despesa média (/mês)"  value={fmtBRL(orcDes)} hint={`Média de ${ORC.meses_ativos||0} meses`} />
        <KpiTile tone={orcLiq >= 0 ? "cyan" : "red"} label="Líquido orçado (/mês)" value={fmtBRL(orcLiq)} hint={`Anual: R$ ${formatBR(orcLiq*12, 0)}`} />
      </div>

      {/* === Acumulado anual: efeito no fim do ano === */}
      <div className="card">
        <h2 className="card-title">Saldo acumulado do ano — efeito no fim de dezembro</h2>
        <OvCumChart data={cumChart} label={`Real (${monthsRealized}m) + projeção dos ${monthsRemaining}m restantes vs orçamento puro`} />
        <div className="status-line" style={{ marginTop: 8, display: "flex", gap: 24, flexWrap: "wrap" }}>
          <span>Projeção de fechamento {REF_YEAR}: <b style={{ color: finalProjLiq >= 0 ? "var(--green)" : "var(--red)" }}>R$ {formatBR(finalProjLiq, 0)}</b></span>
          <span>Orçamento puro (12 × {fmtBRL(orcLiq)}): <b style={{ color: finalOrcLiq >= 0 ? "var(--green)" : "var(--red)" }}>R$ {formatBR(finalOrcLiq, 0)}</b></span>
          <span>Diferença: <b style={{ color: (finalProjLiq - finalOrcLiq) >= 0 ? "var(--green)" : "var(--red)" }}>R$ {formatBR(finalProjLiq - finalOrcLiq, 0)}</b></span>
        </div>
      </div>

      {/* === Gráficos overlay === */}
      <div className="row" style={{ gridTemplateColumns: "1fr", gap: 16 }}>
        <div className="card">
          <h2 className="card-title">Líquido mensal — Real até hoje + Projetado até dez</h2>
          <OvLineChart data={liqChart} label={`${contaLabel || "Consolidado"} · ${REF_YEAR}`} />
        </div>
      </div>
      <div className="row" style={{ gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div className="card">
          <h2 className="card-title">Receita — Real + Projetado</h2>
          <OvBarChart data={recChart} label="Receita mensal" />
        </div>
        <div className="card">
          <h2 className="card-title">Saídas (Custo + Despesa + Imposto)</h2>
          <OvBarChart data={desComposChart} label="Total de saídas mensal" />
        </div>
      </div>

      {/* === Tabela compacta === */}
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
                    <td><b>{MONTHS_FULL[i]}</b>{!isR && <span style={{ color: "var(--fg-3)", marginLeft: 6, fontSize: 10 }}>(projetado)</span>}</td>
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
          <b>TOTAL projetado</b> = realizado YTD ({monthsRealized} {monthsRealized === 1 ? "mês" : "meses"}) + orçamento dos {monthsRemaining} {monthsRemaining === 1 ? "mês" : "meses"} restantes.
        </div>
      </div>
    </div>
  );
};

Object.assign(window, { PageOrcamento, OvLineChart, OvBarChart, OvCumChart });
