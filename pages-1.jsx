/* BIT/BGP Finance — Pages 1: Overview, Indicators, Receita, Despesa */
const { useState, useEffect } = React;

// Hook responsivo: detecta viewport mobile (<= 600px). Usado para ajustar SVGs com
// preserveAspectRatio="none" cujas coords sao plotadas em px absolutos.
const useIsMobile = (breakpoint = 600) => {
  const [isMobile, setIsMobile] = useState(
    typeof window !== "undefined" ? window.innerWidth <= breakpoint : false
  );
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= breakpoint);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [breakpoint]);
  return isMobile;
};

const RangePills = ({ value, onChange }) => {
  const opts = ["7D", "30D", "90D", "YTD", "12M"];
  return (
    <div className="range-pills">
      {opts.map(o => (
        <button key={o} className={value === o ? "active" : ""} onClick={() => onChange(o)}>{o}</button>
      ))}
    </div>
  );
};

// Section heading — kept as a thin alias so all card titles share the standardized style
const SectionHeading = ({ strong, soft }) => (
  <h2 className="card-title">{[strong, soft].filter(Boolean).join(" ")}</h2>
);

// Side-by-side monthly bars (Receita green / Despesa red) with floating value chips
const OverviewBars = ({ data, height = 220, year = "2026", onBarClick, activeIdx }) => {
  const B = window.BIT;
  const max = Math.max(...data.map(d => Math.max(d.receita, d.despesa)), 1);
  const niceMax = Math.max(Math.ceil(max / 200000) * 200000, 200000);
  const ticks = [];
  for (let v = 0; v <= niceMax; v += 200000) ticks.push(v);
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1, 3);
  const hasActive = activeIdx != null && activeIdx >= 0;

  return (
    <div className="ov-bars">
      <div className="ov-bars-plot" style={{ height }}>
        <div className="ov-bars-axis">
          {ticks.map((t, i) => (
            <div key={i} className="ov-bars-tick" style={{ bottom: `${(t / niceMax) * 100}%` }}>
              <span>R${(t / 1000).toFixed(0)} K</span>
            </div>
          ))}
        </div>
        <div className="ov-bars-cols">
          {data.map((d, i) => {
            const rH = (d.receita / niceMax) * 100;
            const dH = (d.despesa / niceMax) * 100;
            const cls = "ov-bar-col" + (onBarClick ? " clickable" : "") +
              (hasActive && i === activeIdx ? " active" : "") +
              (hasActive && i !== activeIdx ? " dimmed" : "");
            return (
              <div key={i} className={cls}
                onClick={onBarClick ? () => onBarClick(d, i) : undefined}
                style={onBarClick ? { cursor: "pointer" } : undefined}
              >
                <div className="ov-bar-stack">
                  <div className="ov-bar green" style={{ height: `${rH}%` }} title={`Receita: ${B.fmt(d.receita)}`}>
                    <span className="ov-bar-chip">R${Math.round(d.receita / 1000)} K</span>
                  </div>
                  <div className="ov-bar red" style={{ height: `${dH}%` }} title={`Despesa: ${B.fmt(d.despesa)}`}>
                    <span className="ov-bar-chip">R${Math.round(d.despesa / 1000)} K</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="ov-bars-x">
        {data.map((d, i) => <span key={i}>{cap(d.m)}</span>)}
      </div>
      <div className="ov-bars-year"><span>{year}</span></div>
    </div>
  );
};

// Diverging line chart — line + zero baseline + value labels above/below points
const IndicatorLine = ({ values, labels, height = 240, color = "var(--cyan)", format }) => {
  // No mobile reduzimos o viewBox horizontal (1100 -> 600) e a altura (240 -> 180).
  // Como preserveAspectRatio="none" estica o conteudo pra preencher a largura do container,
  // um viewBox mais estreito faz os pontos plotados em px absolutos ficarem espacados
  // de forma proporcional ao espaco disponivel no mobile (~326px), evitando o achatamento.
  const isMobile = useIsMobile();
  const w = isMobile ? 600 : 1100;
  const h = isMobile ? 180 : height;
  const padX = isMobile ? 28 : 50;
  const padTop = isMobile ? 28 : 36;
  const padBottom = isMobile ? 28 : 36;
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  const range = max - min || 1;

  const stepX = (w - padX * 2) / (values.length - 1);
  const xOf = (i) => padX + i * stepX;
  const yOf = (v) => padTop + (1 - (v - min) / range) * (h - padTop - padBottom);

  const pts = values.map((v, i) => [xOf(i), yOf(v)]);
  const curve = (p) => {
    let d = `M ${p[0][0]} ${p[0][1]}`;
    for (let i = 1; i < p.length; i++) {
      const [x0, y0] = p[i - 1];
      const [x1, y1] = p[i];
      const cx = (x0 + x1) / 2;
      d += ` C ${cx} ${y0}, ${cx} ${y1}, ${x1} ${y1}`;
    }
    return d;
  };
  const path = curve(pts);
  const zeroY = yOf(0);
  const fmt = format || ((v) => window.BIT.fmt(v));

  // Em mobile, mostramos label de valor Y apenas nos pontos extremos
  // (primeiro, ultimo, max, min) pra evitar amassamento sobre a curva.
  const labelIdxSet = (() => {
    if (!isMobile || values.length <= 4) return null;
    let maxI = 0, minI = 0;
    for (let i = 1; i < values.length; i++) {
      if (values[i] > values[maxI]) maxI = i;
      if (values[i] < values[minI]) minI = i;
    }
    return new Set([0, values.length - 1, maxI, minI]);
  })();

  return (
    <svg className="ind-line" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ width: "100%", height: h }}>
      <defs>
        <linearGradient id="ind-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.30"/>
          <stop offset="100%" stopColor={color} stopOpacity="0"/>
        </linearGradient>
      </defs>
      <line x1={padX} y1={zeroY} x2={w - padX} y2={zeroY} stroke="var(--border)" strokeDasharray="6 5" strokeWidth="1"/>
      <path d={`${path} L ${pts[pts.length - 1][0]} ${zeroY} L ${pts[0][0]} ${zeroY} Z`} fill="url(#ind-grad)" />
      <path d={path} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round"/>
      {pts.map((p, i) => {
        const v = values[i];
        const above = v >= 0;
        const showLabel = labelIdxSet ? labelIdxSet.has(i) : true;
        return (
          <g key={i}>
            <circle cx={p[0]} cy={p[1]} r={isMobile ? 3.5 : 4.5} fill={color} stroke="var(--surface)" strokeWidth="2.5"/>
            {showLabel && (
              <text x={p[0]} y={above ? p[1] - 12 : p[1] + 22} textAnchor="middle" fill={v >= 0 ? "var(--text)" : "var(--red)"} fontFamily="var(--font-mono)" fontSize={isMobile ? "10" : "11.5"} fontWeight="600">
                {fmt(v)}
              </text>
            )}
          </g>
        );
      })}
      {labels.map((l, i) => (
        i % 2 === 0 ? (
          <text key={i} x={xOf(i)} y={h - 10} textAnchor="middle" fill="var(--mute)" fontSize="11" fontFamily="var(--font-ui)">{l}</text>
        ) : null
      ))}
    </svg>
  );
};

/* ===== PageCapa — Tela de capa/dashboard com métricas gerais e variação MoM ===== */
const PageCapa = ({ statusFilter, drilldown, setDrilldown, year, month, filters }) => {
  // Dados do mês atual (ou YTD se month=0)
  const B = useMemo(() => window.getBit(statusFilter, drilldown, year, month, filters), [statusFilter, drilldown, year, month, filters]);

  // Calcula DRE por seção para o período selecionado
  const dreData = useMemo(() => {
    const allTx = window.ALL_TX || [];
    const sf = statusFilter || 'realizado';
    const y = year || window.REF_YEAR;
    const m = month || 0; // 0 = ano inteiro

    // Filtra transações para o mês/ano atual
    const filterForMonth = (txList, yr, mo) => {
      let out = window.filterTx(txList, sf, null, 'caixa', filters);
      out = out.filter(r => {
        if (!r[1]) return false;
        const rYear = parseInt(r[1].slice(0, 4), 10);
        if (rYear !== yr) return false;
        if (mo > 0) {
          const rMonth = parseInt(r[1].slice(5, 7), 10);
          if (rMonth !== mo) return false;
        }
        return true;
      });
      return out;
    };

    const currentTx = filterForMonth(allTx, y, m);

    // Calcula DRE por seção: index [11] = secao (receita/custo/despesa/investimento/financiamento)
    const calcDre = (txList) => {
      const dre = { receita: 0, custo: 0, despesa: 0, investimento: 0, financiamento: 0 };
      for (const r of txList) {
        const secao = r[11] || (r[0] === 'r' ? 'receita' : 'despesa');
        const valor = r[5] || 0;
        if (r[0] === 'r') dre[secao] = (dre[secao] || 0) + valor;
        else dre[secao] = (dre[secao] || 0) - valor;
      }
      return dre;
    };

    const current = calcDre(currentTx);

    // Período anterior para MoM
    let prevDre = null;
    if (m > 0) {
      // Mês anterior
      const prevMonth = m === 1 ? 12 : m - 1;
      const prevYear = m === 1 ? y - 1 : y;
      const prevTx = filterForMonth(allTx, prevYear, prevMonth);
      if (prevTx.length > 0) prevDre = calcDre(prevTx);
    } else {
      // YTD: compara com mesmo período do ano anterior
      const prevTx = filterForMonth(allTx, y - 1, 0);
      if (prevTx.length > 0) prevDre = calcDre(prevTx);
    }

    const receitaLiquida = current.receita;
    const custosOperacionais = Math.abs(current.custo);
    const custosEDespesasGerais = custosOperacionais + Math.abs(current.despesa);
    const despesasOperacionais = Math.abs(current.despesa);
    const margemContribuicao = current.receita + current.custo;
    const resultadoOperacional = current.receita + current.custo + current.despesa;
    const resultadoGeral = current.receita + current.custo + current.despesa + (current.investimento || 0) + (current.financiamento || 0);

    const calcMoM = (currentVal, prevCalc) => {
      if (!prevCalc || prevCalc === 0) return null;
      return ((currentVal - prevCalc) / Math.abs(prevCalc)) * 100;
    };

    let momReceita = null, momCustosGerais = null, momCustos = null, momDespesas = null, momMargem = null, momResultado = null;
    if (prevDre) {
      const pReceita = prevDre.receita;
      const pCustos = Math.abs(prevDre.custo);
      const pCustosGerais = pCustos + Math.abs(prevDre.despesa);
      const pDespesas = Math.abs(prevDre.despesa);
      const pMargem = prevDre.receita + prevDre.custo;
      const pResultado = prevDre.receita + prevDre.custo + prevDre.despesa;

      momReceita = calcMoM(receitaLiquida, pReceita);
      momCustosGerais = calcMoM(custosEDespesasGerais, pCustosGerais);
      momCustos = calcMoM(custosOperacionais, pCustos);
      momDespesas = calcMoM(despesasOperacionais, pDespesas);
    }

    // Margem de Contribuição % e Resultado Operacional % = sobre receita (não MoM)
    const margemContribuicaoPct = receitaLiquida > 0 ? (margemContribuicao / receitaLiquida) * 100 : null;
    const resultadoOperacionalPct = receitaLiquida > 0 ? (resultadoOperacional / receitaLiquida) * 100 : null;

    return {
      receitaLiquida, custosEDespesasGerais, custosOperacionais,
      despesasOperacionais, margemContribuicao, resultadoOperacional, resultadoGeral,
      margemContribuicaoPct, resultadoOperacionalPct,
      momReceita, momCustosGerais, momCustos, momDespesas,
    };
  }, [statusFilter, drilldown, year, month, filters]);

  const fmt = (v) => B.fmt(v);
  const fmtPct = (v) => {
    if (v == null) return "—";
    const sign = v > 0 ? "+" : "";
    return sign + v.toFixed(2).replace(".", ",") + "%";
  };
  const momColor = (v) => {
    if (v == null) return "var(--mute)";
    // Para custos/despesas: aumento é ruim (vermelho), redução é bom (verde)
    return v >= 0 ? "var(--green)" : "var(--red)";
  };
  const momColorInverse = (v) => {
    if (v == null) return "var(--mute)";
    // Para custos: aumento é ruim (vermelho), redução é bom (verde)
    return v <= 0 ? "var(--green)" : "var(--red)";
  };

  const MONTHS_SHORT = ['', 'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  const periodoLabel = month > 0 ? MONTHS_SHORT[month] + " " + year : "Ano " + year;

  const MetricRow = ({ label, value, mom, inverse }) => {
    const color = inverse ? momColorInverse(mom) : momColor(mom);
    return (
      <div className="capa-metric-row">
        <div className="capa-metric-label">{label}</div>
        <div className="capa-metric-values">
          <div className="capa-metric-bar" />
          <span className="capa-metric-value">{fmt(value)}</span>
          <div className="capa-metric-bar-sep" />
          <span className="capa-metric-mom" style={{ color }}>{fmtPct(mom)}</span>
        </div>
      </div>
    );
  };

  return (
    <div className="page-capa">
      <div className="capa-left">
        <div className="capa-hero">
          <h2 className="capa-subtitle">Dashboard</h2>
          <h1 className="capa-title">BI FINANCEIRO</h1>
          <p className="capa-desc">Tenha em suas mãos o melhor dashboard de análise financeira do mercado</p>
        </div>
        <div className="capa-resultado">
          <div className="capa-resultado-title">Resultados</div>
          <div className="capa-resultado-label">RESULTADO GERAL</div>
          <div className="capa-resultado-values">
            <div className="capa-metric-bar" />
            <span className="capa-resultado-value">{fmt(dreData.resultadoGeral)}</span>
          </div>
          <div className="capa-resultado-periodo">{periodoLabel}</div>
        </div>
      </div>
      <div className="capa-right">
        <h3 className="capa-metricas-title">Métricas Gerais</h3>
        <MetricRow label="RECEITA LÍQUIDA" value={dreData.receitaLiquida} mom={dreData.momReceita} />
        <MetricRow label="CUSTOS E DESPESAS GERAIS" value={dreData.custosEDespesasGerais} mom={dreData.momCustosGerais} inverse />
        <MetricRow label="CUSTOS OPERACIONAIS" value={dreData.custosOperacionais} mom={dreData.momCustos} inverse />
        <MetricRow label="DESPESAS OPERACIONAIS" value={dreData.despesasOperacionais} mom={dreData.momDespesas} inverse />
        <MetricRow label="MARGEM DE CONTRIBUIÇÃO" value={dreData.margemContribuicao} mom={dreData.margemContribuicaoPct} />
        <MetricRow label="RESULTADO OPERACIONAL" value={dreData.resultadoOperacional} mom={dreData.resultadoOperacionalPct} />
      </div>
    </div>
  );
};

const PageOverview = ({ filters, setFilters, onOpenFilters, statusFilter, drilldown, setDrilldown, year, month }) => {
  const B = useMemo(() => window.getBit(statusFilter, drilldown, year, month, filters), [statusFilter, drilldown, year, month, filters]);
  // dreCalc: reage ao mês selecionado (KPIs da esquerda)
  const dreCalc = useDreCalc(statusFilter, drilldown, year, month, filters);
  // dreAnual: SEMPRE ano inteiro, sem filtro de mês (charts de barras e linhas)
  const dreAnual = useDreCalc(statusFilter, null, year, 0, filters);
  const [indicator, setIndicator] = useState("Valor líquido");
  const refYear = (B.META && B.META.ref_year) || new Date().getFullYear();
  const activeMonthIdx = (month >= 1 && month <= 12) ? month - 1
    : (drilldown && drilldown.type === "mes") ? parseInt(drilldown.value.slice(5, 7), 10) - 1
    : -1;
  const handleBarMes = (d, i) => {
    const mm = String(i + 1).padStart(2, "0");
    const ym = `${refYear}-${mm}`;
    const lbl = `${d.m.charAt(0).toUpperCase() + d.m.slice(1, 3)}/${refYear}`;
    setDrilldown({ type: "mes", value: ym, label: lbl });
  };

  // Impostos: soma categorias fiscais (reage ao mês selecionado)
  const impostos = useMemo(() => {
    const allTx = window.ALL_TX || [];
    const sf = statusFilter || 'realizado';
    const yr = year || refYear;
    const m = month || 0;
    let dd = drilldown;
    if (!dd && m >= 1 && m <= 12) {
      const mm = String(m).padStart(2, '0');
      dd = { type: 'mes', value: yr + '-' + mm };
    }
    const txFiltered = window.filterTx ? window.filterTx(allTx, sf, dd, 'caixa', filters) : [];
    const taxCats = new Set(['Impostos sobre receita / Das']);
    let total = 0;
    for (const row of txFiltered) {
      if (!row[1] || Number(row[1].slice(0, 4)) !== yr) continue;
      if (row[0] === 'd' && taxCats.has(row[3])) total += row[5];
    }
    return total;
  }, [statusFilter, drilldown, year, month, filters, refYear]);

  // Dados das barras e linhas: sempre do dreAnual (12 meses completos)
  const dreMes = dreAnual.bySecaoMes || [];
  const MONTHS_FULL = B.MONTHS_FULL || [];

  // Barras DRE: receita por seção vs custos+despesas por seção
  const barsData = useMemo(() => {
    return dreMes.map((m, i) => ({
      m: MONTHS_FULL[i] || '',
      receita: m.receita,
      despesa: Math.abs(m.custo) + Math.abs(m.despesa),
    }));
  }, [dreMes, MONTHS_FULL]);

  // Séries DRE mensal para gráfico de indicadores (sempre 12 meses)
  const liqSeries = dreMes.map(m => m.receita + m.custo + m.despesa);
  const margemContribSeries = dreMes.map(m => m.receita + m.custo);
  const resOpSeries = liqSeries;
  const indicatorSeries = {
    "Valor líquido":          { values: liqSeries, color: "var(--cyan)", fmt: (v) => B.fmt(v) },
    "Margem de contribuição": { values: margemContribSeries, color: "var(--amber)", fmt: (v) => B.fmt(v) },
    "Resultado operacional":  { values: resOpSeries, color: "var(--green)", fmt: (v) => B.fmt(v) },
  };
  const current = indicatorSeries[indicator];
  const monthLabels = MONTHS_FULL.map(m => `${(m || '').charAt(0).toUpperCase() + (m || '').slice(1, 3)} ${refYear}`);

  return (
    <div className="page">
      <DrilldownBadge drilldown={drilldown} onClear={() => setDrilldown(null)} />

      <div className="row" style={{ gridTemplateColumns: "minmax(260px, 3fr) minmax(0, 9fr)" }}>
        {/* LEFT: Indicadores Principais + Resultado Geral */}
        <div style={{ display: "grid", gap: 16, alignContent: "start" }}>
          <div className="card">
            <SectionHeading strong="INDICADORES" soft="PRINCIPAIS" />
            <div className="kpi-stack">
              <div className="kpi-stack-item receita">
                <div className="kpi-stack-value">{B.fmt(dreCalc.receita)}</div>
                <div className="kpi-stack-label">Valor líquido</div>
              </div>
              <div className="kpi-stack-item despesa">
                <div className="kpi-stack-value">{B.fmt(dreCalc.custosEDespesas)}</div>
                <div className="kpi-stack-label">Despesa</div>
              </div>
              <div className="kpi-stack-item despesa">
                <div className="kpi-stack-value">{B.fmt(impostos)}</div>
                <div className="kpi-stack-label">Impostos</div>
              </div>
              <div className={`kpi-stack-item ${dreCalc.margem >= 0 ? "receita" : "despesa"}`}>
                <div className="kpi-stack-value">{B.fmt(dreCalc.margem)}</div>
                <div className="kpi-stack-label">Margem de Contribuicao</div>
              </div>
              <div className="kpi-stack-item receita">
                <div className="kpi-stack-value">{dreCalc.margemPct.toFixed(2).replace(".", ",")}%</div>
                <div className="kpi-stack-label">Margem de contribuicao %</div>
              </div>
              <div className={`kpi-stack-item ${dreCalc.resultadoOp >= 0 ? "receita" : "despesa"}`}>
                <div className="kpi-stack-value">{B.fmt(dreCalc.resultadoOp)}</div>
                <div className="kpi-stack-label">Resultado operacional</div>
              </div>
            </div>
          </div>

          <div className={`card resultado-card ${dreCalc.resultadoOp < 0 ? "negative" : ""}`}>
            <SectionHeading strong="RESULTADO" soft="GERAL" />
            <div className="kpi-stack-value resultado-val">{B.fmt(dreCalc.resultadoOp)}</div>
            <div className="kpi-stack-label">Resultado operacional</div>
            <div className="kpi-stack-pct">{dreCalc.resultadoOpPct.toFixed(2).replace(".", ",")}%</div>
            <div className="kpi-stack-label">Margem operacional</div>
          </div>
        </div>

        {/* RIGHT: Entradas e Saídas + Valor Líquido */}
        <div style={{ display: "grid", gap: 16, minWidth: 0 }}>
          <div className="card">
            <div className="card-title-row" style={{ marginBottom: 10 }}>
              <SectionHeading strong="ENTRADAS" soft="E SAÍDAS" />
            </div>
            <div className="legend-pills">
              <span className="legend-pill green">
                <span className="dot" />
                <span className="lbl">Soma de receita</span>
              </span>
              <span className="legend-pill red">
                <span className="dot" />
                <span className="lbl">despesa new</span>
              </span>
            </div>
            <OverviewBars data={barsData} height={260} year={String(refYear)} onBarClick={handleBarMes} activeIdx={activeMonthIdx} />
          </div>

          <div className="card">
            <div className="card-title-row" style={{ marginBottom: 12 }}>
              <SectionHeading strong="VALOR" soft="LÍQUIDO" />
              <div className="ind-pills">
                {Object.keys(indicatorSeries).map(k => (
                  <button key={k} className={`ind-pill ${indicator === k ? "active" : ""}`} onClick={() => setIndicator(k)}>{k}</button>
                ))}
              </div>
            </div>
            <div className="legend-pills">
              <span className="legend-pill cyan"><span className="dot" /><span className="lbl">Valor líquido</span></span>
              <span className="legend-pill" style={{ color: "var(--green)" }}><span className="dot" style={{ background: "var(--green)" }} /><span className="lbl">Resultado operacional</span></span>
              <span className="legend-pill" style={{ color: "var(--amber)" }}><span className="dot" style={{ background: "var(--amber)" }} /><span className="lbl">Margem de contribuição</span></span>
            </div>
            <IndicatorLine values={current.values} labels={monthLabels} height={240} color={current.color} format={current.fmt} />
          </div>
        </div>
      </div>
    </div>
  );
};

const PageIndicators = ({ filters, statusFilter, drilldown, setDrilldown, year, month }) => {
  const B = useMemo(() => window.getBit(statusFilter, drilldown, year, month, filters), [statusFilter, drilldown, year, month, filters]);
  const dre = useDreCalc(statusFilter, drilldown, year, month, filters);
  const totalReceita = dre.receita;
  const totalDespesa = dre.custosEDespesas;
  const valorLiq = dre.resultadoOp;
  const margemLiq = dre.resultadoOpPct;
  const refYear = (B.META && B.META.ref_year) || new Date().getFullYear();
  // sem segregacao de impostos no Omie sem mapeamento de categorias, deixamos 0 e mostramos "—" se nao houver dado
  const margemSeries = B.MONTH_DATA.map(m => m.receita > 0 ? ((m.receita - m.despesa) / m.receita) * 100 : 0);

  const handleBarMes = (d, i) => {
    const mm = String(i + 1).padStart(2, "0");
    const ym = `${refYear}-${mm}`;
    const lbl = `${(d.m || "").charAt(0).toUpperCase() + (d.m || "").slice(1, 3)}/${refYear}`;
    setDrilldown({ type: "mes", value: ym, label: lbl });
  };
  const activeMonthIdx = (drilldown && drilldown.type === "mes")
    ? parseInt(drilldown.value.slice(5, 7), 10) - 1 : -1;

  return (
    <div className="page">
      <div className="page-title">
        <div>
          <h1>Indicadores</h1>
          <div className="status-line">Receita, despesa, valor líquido e margem · {statusFilter === "realizado" ? "realizado" : statusFilter === "tudo" ? "tudo" : "pendente"}</div>
        </div>
        <div className="actions">
        </div>
      </div>

      <DrilldownBadge drilldown={drilldown} onClear={() => setDrilldown(null)} />

      <div className="metric-strip">
        <div className="metric">
          <div className="m-label">Receita total</div>
          <div className="m-value">{B.fmt(totalReceita)}</div>
          <div className="m-pct">100%</div>
          <div className="m-bar"><div style={{ width: `100%` }} /></div>
        </div>
        <div className="metric">
          <div className="m-label">Despesa total</div>
          <div className="m-value">{B.fmt(totalDespesa)}</div>
          <div className="m-pct">{totalReceita > 0 ? `${((totalDespesa / totalReceita) * 100).toFixed(2).replace(".",",")}%` : "—"}</div>
          <div className="m-bar red"><div style={{ width: `${totalReceita > 0 ? Math.min(100, (totalDespesa / totalReceita) * 100) : 0}%` }} /></div>
        </div>
        <div className="metric">
          <div className="m-label">Valor líquido</div>
          <div className="m-value" style={{ color: valorLiq >= 0 ? "var(--green)" : "var(--red)" }}>{B.fmt(valorLiq)}</div>
          <div className="m-pct">{margemLiq.toFixed(2).replace(".",",")}%</div>
          <div className="m-bar cyan"><div style={{ width: `${Math.min(100, Math.max(0, margemLiq))}%` }} /></div>
        </div>
        <div className="metric">
          <div className="m-label">Margem líquida</div>
          <div className="m-value">{margemLiq.toFixed(2).replace(".",",")}%</div>
          <div className="m-pct">média do período</div>
          <div className="m-bar"><div style={{ width: `${Math.min(100, Math.max(0, margemLiq))}%` }} /></div>
        </div>
      </div>

      <div className="row row-1-1">
        <div className="card">
          <h2 className="card-title">Margem líquida por mês</h2>
          <TrendChart
            values={margemSeries}
            labels={B.MONTHS}
            color="var(--cyan)"
            height={220}
            gradientId="ml-cyan"
          />
        </div>
        <div className="card">
          <h2 className="card-title">Receita vs Despesa por mês</h2>
          <MonthlyBars data={B.MONTH_DATA} height={240} onBarClick={handleBarMes} activeIdx={activeMonthIdx} />
        </div>
      </div>
    </div>
  );
};

const PageReceita = ({ filters, setFilters, onOpenFilters, statusFilter, drilldown, setDrilldown, year, month }) => {
  const B = useMemo(() => window.getBit(statusFilter, drilldown, year, month, filters), [statusFilter, drilldown, year, month, filters]);
  const dre = useDreCalc(statusFilter, drilldown, year, month, filters);
  const totalReceita = dre.receita;
  const mediaMes = totalReceita / 12;
  const numClientes = B.RECEITA_CLIENTES.length;
  const numLancRec = (B.EXTRATO_RECEITAS || B.EXTRATO.filter(e => e[4] > 0)).length;
  const ticket = numLancRec > 0 ? totalReceita / numLancRec : 0;
  const [range, setRange] = useState("12M");
  const refYear = (B.META && B.META.ref_year) || new Date().getFullYear();

  // Drilldown handlers
  const handleBarMes = (v, i) => {
    const mm = String(i + 1).padStart(2, "0");
    const ym = `${refYear}-${mm}`;
    const mn = B.MONTHS_FULL[i] || "";
    setDrilldown({ type: "mes", value: ym, label: `${mn.charAt(0).toUpperCase() + mn.slice(1, 3)}/${refYear}` });
  };
  const handleCategoria = (it) => setDrilldown({ type: "categoria", value: it.name, label: it.name });
  const handleCliente = (it) => setDrilldown({ type: "cliente", value: it.name, label: it.name });

  const activeMonthIdx = (drilldown && drilldown.type === "mes")
    ? parseInt(drilldown.value.slice(5, 7), 10) - 1 : -1;
  const activeCategoria = (drilldown && drilldown.type === "categoria") ? drilldown.value : null;
  const activeCliente = (drilldown && drilldown.type === "cliente") ? drilldown.value : null;

  const extratoReceitas = B.EXTRATO_RECEITAS || B.EXTRATO.filter(e => e[4] > 0);
  const extratoFiltrado = window.applyDrilldown(extratoReceitas, drilldown);
  const totalFiltrado = drilldown
    ? extratoFiltrado.reduce((s, e) => s + e[4], 0)
    : totalReceita;

  return (
    <div className="page">
      <div className="page-title">
        <div>
          <h1>Receita</h1>
          <div className="status-line">Composição por categoria, cliente e mês</div>
        </div>
        <div className="actions">
        </div>
      </div>

      <DrilldownBadge drilldown={drilldown} onClear={() => setDrilldown(null)} />

      <div className="row row-4">
        <KpiTile label="Receita operacional" value={B.fmt(totalReceita)} sparkValues={B.MONTH_DATA.map(m => m.receita)} sparkColor="var(--green)" tone="green" noPrefix />
        <KpiTile label="Média por mês" value={B.fmt(mediaMes)} sparkValues={B.MONTH_DATA.map(m => m.receita)} sparkColor="var(--cyan)" tone="cyan" noPrefix />
        <KpiTile label="Clientes" value={String(numClientes)} sparkValues={B.MONTH_DATA.map(m => m.receita > 0 ? 1 : 0)} sparkColor="var(--cyan)" tone="cyan" nonMonetary />
        <KpiTile label="Ticket médio" value={B.fmt(ticket)} sparkValues={B.MONTH_DATA.map(m => m.receita / 30)} sparkColor="var(--green)" tone="green" noPrefix />
      </div>

      <div className="card">
        <h2 className="card-title">Receita por mês</h2>
        <SingleBars values={B.MONTH_DATA.map(m => m.receita)} labels={B.MONTHS_FULL} color="green" height={240}
          onBarClick={handleBarMes} activeIdx={activeMonthIdx} />
      </div>

      <div className="row" style={{ gridTemplateColumns: "minmax(0, 4fr) minmax(0, 5fr) minmax(0, 4fr)" }}>
        <div className="card">
          <h2 className="card-title">Receita por categoria</h2>
          <BarList items={B.RECEITA_CATEGORIAS} color="green" onItemClick={handleCategoria} activeName={activeCategoria} />
        </div>

        <div className="card">
          <div className="card-title-row">
            <h2 className="card-title">Extrato de receitas {drilldown ? `· ${drilldown.label}` : ""}</h2>
          </div>
          <div className="t-scroll">
            <table className="t">
              <thead>
                <tr><th>Data</th><th>Categoria</th><th>Cliente</th><th className="num">Receita</th></tr>
              </thead>
              <tbody>
                {extratoFiltrado.slice(0, 30).map((e, i) => (
                  <tr key={i}>
                    <td style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>{e[0]}</td>
                    <td>{e[2]}</td>
                    <td>{e[3]}</td>
                    <td className="num green">{B.fmt(Math.abs(e[4]))}</td>
                  </tr>
                ))}
                {extratoFiltrado.length === 0 && (
                  <tr><td colSpan="4" style={{ color: "var(--mute)", textAlign: "center", padding: 18 }}>Sem receitas no filtro selecionado</td></tr>
                )}
                <tr className="total">
                  <td colSpan="3">Total{drilldown ? " (filtrado)" : ""}</td>
                  <td className="num green">{B.fmt(totalFiltrado)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <h2 className="card-title">Receita por cliente</h2>
          <BarList items={B.RECEITA_CLIENTES} color="green" onItemClick={handleCliente} activeName={activeCliente} />
        </div>
      </div>
    </div>
  );
};

const PageDespesa = ({ filters, setFilters, onOpenFilters, statusFilter, drilldown, setDrilldown, year, month }) => {
  const B = useMemo(() => window.getBit(statusFilter, drilldown, year, month, filters), [statusFilter, drilldown, year, month, filters]);
  const dre = useDreCalc(statusFilter, drilldown, year, month, filters);
  const totalDespesa = dre.custosEDespesas;
  const mediaMes = totalDespesa / 12;
  const numFornec = B.DESPESA_FORNECEDORES.length;
  const numLancDesp = (B.EXTRATO_DESPESAS || B.EXTRATO.filter(e => e[4] < 0)).length;
  const ticketDesp = numLancDesp > 0 ? totalDespesa / numLancDesp : 0;
  const [range, setRange] = useState("12M");
  const refYear = (B.META && B.META.ref_year) || new Date().getFullYear();

  const handleBarMes = (v, i) => {
    const mm = String(i + 1).padStart(2, "0");
    const ym = `${refYear}-${mm}`;
    const mn = B.MONTHS_FULL[i] || "";
    setDrilldown({ type: "mes", value: ym, label: `${mn.charAt(0).toUpperCase() + mn.slice(1, 3)}/${refYear}` });
  };
  const handleCategoria = (it) => setDrilldown({ type: "categoria", value: it.name, label: it.name });
  const handleFornecedor = (it) => setDrilldown({ type: "fornecedor", value: it.name, label: it.name });

  const activeMonthIdx = (drilldown && drilldown.type === "mes")
    ? parseInt(drilldown.value.slice(5, 7), 10) - 1 : -1;
  const activeCategoria = (drilldown && drilldown.type === "categoria") ? drilldown.value : null;
  const activeFornecedor = (drilldown && drilldown.type === "fornecedor") ? drilldown.value : null;

  // Extrato filtrado de despesas (usa EXTRATO_DESPESAS pre-separado, fallback inline)
  const extratoDespesas = B.EXTRATO_DESPESAS || B.EXTRATO.filter(e => e[4] < 0);
  const extratoFiltrado = window.applyDrilldown(extratoDespesas, drilldown);
  const totalFiltrado = drilldown
    ? Math.abs(extratoFiltrado.reduce((s, e) => s + e[4], 0))
    : totalDespesa;

  return (
    <div className="page">
      <div className="page-title">
        <div>
          <h1>Despesa</h1>
          <div className="status-line">Composição por categoria, fornecedor e mês</div>
        </div>
        <div className="actions">
        </div>
      </div>

      <DrilldownBadge drilldown={drilldown} onClear={() => setDrilldown(null)} />

      <div className="row row-4">
        <KpiTile label="Despesas totais" value={B.fmt(totalDespesa)} sparkValues={B.MONTH_DATA.map(m => m.despesa)} sparkColor="var(--red)" tone="red" noPrefix />
        <KpiTile label="Média por mês" value={B.fmt(mediaMes)} sparkValues={B.MONTH_DATA.map(m => m.despesa)} sparkColor="var(--red)" tone="red" noPrefix />
        <KpiTile label="Fornecedores" value={String(numFornec)} sparkValues={B.MONTH_DATA.map(m => m.despesa > 0 ? 1 : 0)} sparkColor="var(--cyan)" tone="cyan" nonMonetary />
        <KpiTile label="Ticket médio" value={B.fmt(ticketDesp)} sparkValues={B.MONTH_DATA.map(m => m.despesa / 30)} sparkColor="var(--red)" tone="red" noPrefix />
      </div>

      <div className="card">
        <h2 className="card-title">Despesa por mês</h2>
        <SingleBars values={B.MONTH_DATA.map(m => m.despesa)} labels={B.MONTHS_FULL} color="red" height={240}
          onBarClick={handleBarMes} activeIdx={activeMonthIdx} />
      </div>

      <div className="row" style={{ gridTemplateColumns: "minmax(0, 4fr) minmax(0, 5fr) minmax(0, 4fr)" }}>
        <div className="card">
          <h2 className="card-title">Despesas por categoria</h2>
          <BarList items={B.DESPESA_CATEGORIAS} color="red" onItemClick={handleCategoria} activeName={activeCategoria} />
        </div>

        <div className="card">
          <div className="card-title-row">
            <h2 className="card-title">Extrato de despesas {drilldown ? `· ${drilldown.label}` : ""}</h2>
          </div>
          <div className="t-scroll">
            <table className="t">
              <thead>
                <tr><th>Data</th><th>Categoria</th><th>Fornecedor</th><th className="num">Despesa</th></tr>
              </thead>
              <tbody>
                {extratoFiltrado.slice(0, 30).map((e, i) => (
                  <tr key={i}>
                    <td style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>{e[0]}</td>
                    <td>{e[2]}</td>
                    <td>{e[3]}</td>
                    <td className="num red">{B.fmt(Math.abs(e[4]))}</td>
                  </tr>
                ))}
                {extratoFiltrado.length === 0 && (
                  <tr><td colSpan="4" style={{ color: "var(--mute)", textAlign: "center", padding: 18 }}>Sem despesas no filtro selecionado</td></tr>
                )}
                <tr className="total">
                  <td colSpan="3">Total{drilldown ? " (filtrado)" : ""}</td>
                  <td className="num red">{B.fmt(totalFiltrado)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <h2 className="card-title">Despesas por fornecedor</h2>
          <BarList items={B.DESPESA_FORNECEDORES} color="red" onItemClick={handleFornecedor} activeName={activeFornecedor} />
        </div>
      </div>
    </div>
  );
};

Object.assign(window, { PageOverview, PageIndicators, PageReceita, PageDespesa, RangePills });
