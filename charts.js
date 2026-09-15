/**
 * charts.js — Gráficos simples desenhados em <canvas>, sem bibliotecas
 * externas. Isso garante que os gráficos funcionem 100% offline e sem
 * depender de CDNs que poderiam falhar no GitHub Pages.
 */

const Charts = (() => {
  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  function setupCanvas(canvas) {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const width = rect.width || canvas.parentElement.clientWidth || 320;
    const height = canvas.height && canvas.dataset.fixedHeight ? Number(canvas.dataset.fixedHeight) : rect.height || 220;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    return { ctx, width, height };
  }

  function emptyState(ctx, width, height, message) {
    ctx.fillStyle = cssVar("--text-tertiary") || "#666";
    ctx.font = "14px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(message, width / 2, height / 2);
  }

  /** Gráfico de linha — evolução acumulada ao longo do tempo. */
  function lineChart(canvas, points, { color } = {}) {
    const { ctx, width, height } = setupCanvas(canvas);
    if (!points || points.length < 2) {
      emptyState(ctx, width, height, "Adicione mais aportes para ver a evolução");
      return;
    }
    const padding = { top: 16, right: 12, bottom: 24, left: 12 };
    const plotW = width - padding.left - padding.right;
    const plotH = height - padding.top - padding.bottom;

    const values = points.map((p) => p.value);
    const maxV = Math.max(...values, 1);
    const minV = 0;

    const stepX = plotW / (points.length - 1);
    const lineColor = color || cssVar("--accent") || "#6C5CE7";

    // grade horizontal sutil
    ctx.strokeStyle = cssVar("--border") || "rgba(255,255,255,0.08)";
    ctx.lineWidth = 1;
    for (let i = 0; i <= 3; i++) {
      const y = padding.top + (plotH / 3) * i;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(width - padding.right, y);
      ctx.stroke();
    }

    // área preenchida (gradiente)
    const gradient = ctx.createLinearGradient(0, padding.top, 0, height - padding.bottom);
    gradient.addColorStop(0, hexToRgba(lineColor, 0.28));
    gradient.addColorStop(1, hexToRgba(lineColor, 0.02));

    ctx.beginPath();
    points.forEach((p, i) => {
      const x = padding.left + i * stepX;
      const y = padding.top + plotH - ((p.value - minV) / (maxV - minV || 1)) * plotH;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.lineTo(padding.left + plotW, height - padding.bottom);
    ctx.lineTo(padding.left, height - padding.bottom);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();

    // linha
    ctx.beginPath();
    points.forEach((p, i) => {
      const x = padding.left + i * stepX;
      const y = padding.top + plotH - ((p.value - minV) / (maxV - minV || 1)) * plotH;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 2.5;
    ctx.lineJoin = "round";
    ctx.stroke();

    // ponto final destacado
    const last = points[points.length - 1];
    const lastX = padding.left + (points.length - 1) * stepX;
    const lastY = padding.top + plotH - ((last.value - minV) / (maxV - minV || 1)) * plotH;
    ctx.beginPath();
    ctx.arc(lastX, lastY, 4, 0, Math.PI * 2);
    ctx.fillStyle = lineColor;
    ctx.fill();
  }

  /** Gráfico de rosca (donut) — distribuição por meta. */
  function donutChart(canvas, segments) {
    const { ctx, width, height } = setupCanvas(canvas);
    const total = segments.reduce((s, seg) => s + seg.value, 0);
    if (!total) {
      emptyState(ctx, width, height, "Sem valores acumulados ainda");
      return;
    }
    const cx = width / 2;
    const cy = height / 2;
    const radius = Math.min(width, height) / 2 - 8;
    const inner = radius * 0.62;

    let start = -Math.PI / 2;
    segments.forEach((seg) => {
      const angle = (seg.value / total) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, radius, start, start + angle);
      ctx.closePath();
      ctx.fillStyle = seg.color;
      ctx.fill();
      start += angle;
    });

    // furo central
    ctx.beginPath();
    ctx.arc(cx, cy, inner, 0, Math.PI * 2);
    ctx.fillStyle = cssVar("--bg-card") || "#12161D";
    ctx.fill();
  }

  /** Gráfico de barras horizontais — progresso por meta. */
  function progressBars(canvas, items) {
    const rowHeight = 34;
    canvas.dataset.fixedHeight = String(items.length * rowHeight + 8);
    const { ctx, width, height } = setupCanvas(canvas);
    if (!items.length) {
      emptyState(ctx, width, height, "Cadastre uma meta para ver o progresso");
      return;
    }

    const labelW = 0;
    const barH = 14;
    ctx.font = "12px Inter, sans-serif";
    ctx.textBaseline = "middle";

    items.forEach((item, i) => {
      const y = i * rowHeight + rowHeight / 2;

      // rótulo
      ctx.fillStyle = cssVar("--text-secondary") || "#aaa";
      ctx.textAlign = "left";
      ctx.fillText(`${item.icon} ${item.name}`, labelW, y - 10);

      // trilho
      const trackY = y + 2;
      const trackW = width - labelW;
      ctx.fillStyle = cssVar("--border") || "rgba(255,255,255,0.08)";
      roundRect(ctx, labelW, trackY, trackW, barH, 7);
      ctx.fill();

      // progresso
      const pct = Math.min(1, item.percent / 100);
      ctx.fillStyle = item.color;
      roundRect(ctx, labelW, trackY, Math.max(trackW * pct, pct > 0 ? 14 : 0), barH, 7);
      ctx.fill();

      // percentual
      ctx.fillStyle = cssVar("--text-primary") || "#fff";
      ctx.textAlign = "right";
      ctx.fillText(`${item.percent.toFixed(0)}%`, width, y - 10);
    });
  }

  /** Gráfico de barras verticais — aportes por período (ex: por mês). */
  function barChart(canvas, items, { color } = {}) {
    const { ctx, width, height } = setupCanvas(canvas);
    if (!items.length) {
      emptyState(ctx, width, height, "Nenhum aporte registrado ainda");
      return;
    }
    const padding = { top: 16, right: 8, bottom: 24, left: 8 };
    const plotW = width - padding.left - padding.right;
    const plotH = height - padding.top - padding.bottom;
    const maxV = Math.max(...items.map((i) => i.value), 1);
    const barColor = color || cssVar("--accent-2") || "#14B8A6";
    const gap = 8;
    const barW = Math.max((plotW - gap * (items.length - 1)) / items.length, 4);

    items.forEach((item, i) => {
      const x = padding.left + i * (barW + gap);
      const barHpx = (item.value / maxV) * plotH;
      const y = padding.top + plotH - barHpx;
      ctx.fillStyle = barColor;
      roundRect(ctx, x, y, barW, Math.max(barHpx, 2), 4);
      ctx.fill();

      ctx.fillStyle = cssVar("--text-tertiary") || "#888";
      ctx.font = "10px Inter, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(item.label, x + barW / 2, height - 8);
    });
  }

  function roundRect(ctx, x, y, w, h, r) {
    const radius = Math.min(r, h / 2, w / 2 > 0 ? w / 2 : r);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }

  function hexToRgba(hex, alpha) {
    const h = hex.replace("#", "");
    const bigint = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
    const r = (bigint >> 16) & 255;
    const g = (bigint >> 8) & 255;
    const b = bigint & 255;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  return { lineChart, donutChart, progressBars, barChart };
})();
