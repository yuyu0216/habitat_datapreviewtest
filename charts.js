/* =========================================================================
   結局圖表預覽 ── 繪圖邏輯（純原生 JS + SVG，無外部依賴）
   資料來自 data.js（window.PREVIEW_DATA），由 build-data.js 解析 5/25 CSV 而來。
   ========================================================================= */
(function () {
  "use strict";
  const D = window.PREVIEW_DATA;
  const SP = D.meta.species;          // ['red','green',...]
  const HB = D.meta.habitats;         // ['wetland','forest','urban','pond']
  const RS = D.meta.rounds;           // [1,2,3,4,5,6]

  // --- 中繼資料：名稱 / 顏色 / icon ---
  const SP_META = {
    red:    { name: "紅色族群", hex: "#C8553D" },
    green:  { name: "綠色族群", hex: "#6B9E47" },
    yellow: { name: "黃色族群", hex: "#D9A441" },
    brown:  { name: "棕色族群", hex: "#8B6B47" },
    blue:   { name: "藍色族群", hex: "#4A7BA6" },
    purple: { name: "紫色族群", hex: "#8B5A9F" },
  };
  const HB_META = {
    wetland: { name: "濕地農田", short: "濕地農田", emoji: "🌾", hex: "#6B9E7F", cap: 300 },
    forest:  { name: "淺山森林", short: "淺山森林", emoji: "🌳", hex: "#4A7C59", cap: 280 },
    urban:   { name: "都會公園", short: "都會公園", emoji: "🏙️", hex: "#8B92A8", cap: 220 },
    pond:    { name: "埤塘水域", short: "埤塘水域", emoji: "💧", hex: "#5B7A99", cap: 250 },
  };
  // 回合 1 是開局狀態，2~6 是 5 個回合結束後
  const ROUND_LABEL = { 1: "開局", 2: "第1回", 3: "第2回", 4: "第3回", 5: "第4回", 6: "第5回" };
  // 人類開發事件（kind A）的 icon
  const EVENT_ICON = {
    DEV_FARM_R1: "🧪", DEV_SEWAGE_R2: "🚱", DEV_LOG_R3: "🪓",
    DEV_FACTORY_R4: "🏭", DEV_COLLAPSE_R5: "💥",
  };

  /* ---------------- 小工具 ---------------- */
  const SVGNS = "http://www.w3.org/2000/svg";
  function S(tag, attrs, kids) {
    const e = document.createElementNS(SVGNS, tag);
    if (attrs) for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (kids) kids.forEach(c => e.appendChild(c));
    return e;
  }
  function T(x, y, str, attrs) {
    const t = S("text", Object.assign({ x: x, y: y }, attrs || {}));
    t.textContent = str;
    return t;
  }
  function H(tag, attrs, html) {
    const e = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      if (k === "class") e.className = attrs[k];
      else if (k === "style") e.style.cssText = attrs[k];
      else e.setAttribute(k, attrs[k]);
    }
    if (html != null) e.innerHTML = html;
    return e;
  }
  // 把事件描述裡的 {green} 之類換成中文族群名
  function fmtImpact(str) {
    return (str || "").replace(/\{(\w+)\}/g, (m, k) => SP_META[k] ? SP_META[k].name : m);
  }
  // 把上限抓成貼近又漂亮的整數（例如 524→600、1625→1800）
  function niceMax(v) {
    if (v <= 0) return 10;
    const mag = Math.pow(10, Math.floor(Math.log10(v)));
    const n = v / mag; // 1 ~ 10
    const nice = [1, 1.2, 1.5, 1.8, 2, 2.5, 3, 4, 5, 6, 8, 10];
    for (const k of nice) if (n <= k) return k * mag;
    return 10 * mag;
  }

  /* ---------------- 共用座標系 ---------------- */
  // 畫 Y 軸格線＋刻度，回傳 yOf(value) 換算函式
  function drawAxes(svg, W, Hgt, M, max, opts) {
    opts = opts || {};
    const plotH = Hgt - M.t - M.b;
    const ticks = opts.ticks || 4;
    const yOf = v => M.t + plotH * (1 - v / max);
    for (let i = 0; i <= ticks; i++) {
      const val = (max / ticks) * i;
      const y = yOf(val);
      svg.appendChild(S("line", { x1: M.l, y1: y, x2: W - M.r, y2: y, class: "grid-line" }));
      svg.appendChild(T(M.l - 8, y + 4, Math.round(val), { class: "axis-label", "text-anchor": "end" }));
    }
    return yOf;
  }
  // 6 個回合在 x 軸上的中心點
  function xSlots(W, M, n) {
    const plotW = W - M.l - M.r;
    const slot = plotW / n;
    return RS.map((_, i) => M.l + slot * i + slot / 2);
  }

  /* =======================================================================
     A1 ─ 全班生態系全景（物種堆疊長條）
     ======================================================================= */
  function renderA1() {
    const W = 760, Hgt = 380, M = { t: 20, r: 16, b: 42, l: 44 };
    const totals = RS.map(r => SP.reduce((s, sp) => s + D.speciesTotalsByRound[r][sp], 0));
    const max = niceMax(Math.max(...totals));
    const svg = S("svg", { viewBox: `0 0 ${W} ${Hgt}`, class: "chart" });
    const yOf = drawAxes(svg, W, Hgt, M, max);
    const cx = xSlots(W, M, RS.length);
    const barW = 58;

    RS.forEach((r, i) => {
      let acc = 0;
      SP.forEach(sp => {
        const v = D.speciesTotalsByRound[r][sp];
        if (v <= 0) return;
        const yTop = yOf(acc + v), yBot = yOf(acc);
        svg.appendChild(S("rect", {
          x: cx[i] - barW / 2, y: yTop, width: barW, height: Math.max(0, yBot - yTop),
          fill: SP_META[sp].hex, rx: 3, opacity: 0.95,
        }));
        if (yBot - yTop > 16)
          svg.appendChild(T(cx[i], (yTop + yBot) / 2 + 4, v, { class: "bar-val", "text-anchor": "middle" }));
        acc += v;
      });
      svg.appendChild(T(cx[i], yOf(acc) - 8, "共 " + acc, { class: "bar-total", "text-anchor": "middle" }));
      svg.appendChild(T(cx[i], Hgt - 14, ROUND_LABEL[r], { class: "round-label", "text-anchor": "middle" }));
    });
    document.getElementById("a1").appendChild(svg);
    buildLegend("a1-legend", SP.map(sp => ({ label: SP_META[sp].name, color: SP_META[sp].hex })));
  }

  /* =======================================================================
     A2 ─ 六族群命運線（折線）
     ======================================================================= */
  function renderA2() {
    const W = 760, Hgt = 380, M = { t: 20, r: 50, b: 42, l: 44 };
    let max = 0;
    RS.forEach(r => SP.forEach(sp => { max = Math.max(max, D.speciesTotalsByRound[r][sp]); }));
    max = niceMax(max);
    const svg = S("svg", { viewBox: `0 0 ${W} ${Hgt}`, class: "chart" });
    const yOf = drawAxes(svg, W, Hgt, M, max);
    const cx = xSlots(W, M, RS.length);

    SP.forEach(sp => {
      const pts = RS.map((r, i) => [cx[i], yOf(D.speciesTotalsByRound[r][sp])]);
      svg.appendChild(S("polyline", {
        points: pts.map(p => p.join(",")).join(" "),
        fill: "none", stroke: SP_META[sp].hex, "stroke-width": 3.5,
        "stroke-linejoin": "round", "stroke-linecap": "round",
      }));
      pts.forEach(p => svg.appendChild(S("circle", { cx: p[0], cy: p[1], r: 4.5, fill: "#fff", stroke: SP_META[sp].hex, "stroke-width": 2.5 })));
      // 線尾標數字
      const last = pts[pts.length - 1];
      svg.appendChild(T(last[0] + 8, last[1] + 4, D.speciesTotalsByRound[RS[RS.length - 1]][sp], { fill: SP_META[sp].hex, "font-size": 12, "font-weight": 800 }));
    });
    RS.forEach((r, i) => svg.appendChild(T(cx[i], Hgt - 14, ROUND_LABEL[r], { class: "round-label", "text-anchor": "middle" })));
    document.getElementById("a2").appendChild(svg);
    buildLegend("a2-legend", SP.map(sp => ({ label: SP_META[sp].name, color: SP_META[sp].hex })));
  }

  /* =======================================================================
     A3 ─ 四大棲地小卡（每塊地一張物種堆疊長條）
     ======================================================================= */
  function renderA3() {
    // 共用同一個 Y 上限，方便跨棲地比較
    let max = 0;
    RS.forEach(r => HB.forEach(h => { max = Math.max(max, D.habitatTotalsByRound[r][h]); }));
    max = niceMax(max);
    const host = document.getElementById("a3");
    HB.forEach(h => {
      const cell = H("div", { class: "smallmult__cell" });
      cell.appendChild(H("h3", null, `${HB_META[h].emoji} ${HB_META[h].name} <span class="smallmult__cap">（可住 ${HB_META[h].cap}）</span>`));
      const W = 360, Hgt = 220, M = { t: 14, r: 10, b: 30, l: 34 };
      const svg = S("svg", { viewBox: `0 0 ${W} ${Hgt}`, class: "chart" });
      const yOf = drawAxes(svg, W, Hgt, M, max, { ticks: 3 });
      const cx = xSlots(W, M, RS.length);
      const barW = 34;
      RS.forEach((r, i) => {
        let acc = 0;
        SP.forEach(sp => {
          const v = D.habitatSpeciesByRound[r][h][sp];
          if (v <= 0) return;
          const yTop = yOf(acc + v), yBot = yOf(acc);
          svg.appendChild(S("rect", { x: cx[i] - barW / 2, y: yTop, width: barW, height: Math.max(0, yBot - yTop), fill: SP_META[sp].hex, rx: 2, opacity: 0.95 }));
          acc += v;
        });
        svg.appendChild(T(cx[i], Hgt - 10, ROUND_LABEL[r].replace("第", "").replace("回", ""), { class: "round-label", "text-anchor": "middle", "font-size": 11 }));
      });
      cell.appendChild(svg);
      host.appendChild(cell);
    });
    buildLegend("a3-legend", SP.map(sp => ({ label: SP_META[sp].name, color: SP_META[sp].hex })));
  }

  /* =======================================================================
     A4 ─ 棲地擁擠度熱力圖（住了多少 ÷ 上限）
     ======================================================================= */
  function heatColor(ratio) {
    // 0 → 綠、1 → 黃、>1.3 → 紅
    const stops = [
      [0.0, [107, 158, 127]], [0.6, [217, 164, 65]],
      [1.0, [216, 130, 70]], [1.4, [200, 60, 50]],
    ];
    const r = Math.min(ratio, 1.4);
    let a = stops[0], b = stops[stops.length - 1];
    for (let i = 0; i < stops.length - 1; i++) {
      if (r >= stops[i][0] && r <= stops[i + 1][0]) { a = stops[i]; b = stops[i + 1]; break; }
    }
    const t = (r - a[0]) / (b[0] - a[0] || 1);
    const mix = a[1].map((c, i) => Math.round(c + (b[1][i] - c) * t));
    return `rgb(${mix[0]},${mix[1]},${mix[2]})`;
  }
  function renderA4() {
    const table = H("table", { class: "heat" });
    const thead = H("tr");
    thead.appendChild(H("th", null, ""));
    RS.forEach(r => thead.appendChild(H("th", null, ROUND_LABEL[r])));
    table.appendChild(thead);
    HB.forEach(h => {
      const tr = H("tr");
      tr.appendChild(H("td", { class: "heat__row-h" }, `${HB_META[h].emoji} ${HB_META[h].name}`));
      RS.forEach(r => {
        const tot = D.habitatTotalsByRound[r][h];
        const ratio = tot / HB_META[h].cap;
        const td = H("td", { style: `background:${heatColor(ratio)}` },
          `${Math.round(ratio * 100)}%<span class="heat__sub">${tot} 隻</span>`);
        tr.appendChild(td);
      });
      table.appendChild(tr);
    });
    const host = document.getElementById("a4");
    host.appendChild(table);
    // 顏色說明
    const key = H("div", { class: "legend", style: "margin-top:12px;" });
    [["很空鬆", 0.2], ["剛好", 0.8], ["擠", 1.0], ["爆滿超載", 1.4]].forEach(([lab, rt]) => {
      const it = H("div", { class: "legend__item" });
      it.appendChild(H("span", { class: "legend__dot", style: `background:${heatColor(rt)}` }));
      it.appendChild(document.createTextNode(lab));
      key.appendChild(it);
    });
    host.appendChild(key);
  }

  /* =======================================================================
     人類事件時間軸（老師端頂部）
     ======================================================================= */
  function renderEventFlow() {
    const host = document.getElementById("eventflow");
    const flow = H("div", { class: "eventflow" });
    [1, 2, 3, 4, 5].forEach(r => {
      const evs = D.eventsByRound[r] || [];
      const dev = evs.find(e => e.kind === "A") || evs[0] || {};
      const step = H("div", { class: "eventflow__step" });
      step.appendChild(H("div", { class: "eventflow__round" }, `第 ${r} 回`));
      step.appendChild(H("div", { class: "eventflow__icon" }, EVENT_ICON[dev.event_id] || "⚠️"));
      step.appendChild(H("div", { class: "eventflow__name" }, dev.name || "─"));
      step.appendChild(H("div", { class: "eventflow__desc" }, HB_META[dev.habitat] ? HB_META[dev.habitat].name : ""));
      step.appendChild(H("div", { class: "eventflow__arrow" }, "➜"));
      flow.appendChild(step);
    });
    host.appendChild(flow);
  }

  /* =======================================================================
     圖例小工具
     ======================================================================= */
  function buildLegend(id, items) {
    const host = document.getElementById(id);
    host.innerHTML = "";
    items.forEach(it => {
      const node = H("div", { class: "legend__item" });
      node.appendChild(H("span", { class: "legend__dot", style: `background:${it.color}` }));
      node.appendChild(document.createTextNode(it.label));
      host.appendChild(node);
    });
  }

  /* =======================================================================
     玩家端 ── 依選到的玩家重畫 B1~B4
     ======================================================================= */
  function classAvgByRound(r) {
    const codes = Object.keys(D.players);
    const sum = codes.reduce((s, pc) => s + (D.players[pc].byRound[r] ? D.players[pc].byRound[r].total : 0), 0);
    return sum / codes.length;
  }
  function speciesAvgByRound(species, r) {
    const codes = Object.keys(D.players).filter(pc => D.players[pc].species === species);
    const sum = codes.reduce((s, pc) => s + (D.players[pc].byRound[r] ? D.players[pc].byRound[r].total : 0), 0);
    return codes.length ? sum / codes.length : 0;
  }

  // B1 我的成長曲線（面積）
  function renderB1(p) {
    const host = document.getElementById("b1"); host.innerHTML = "";
    const W = 760, Hgt = 320, M = { t: 24, r: 20, b: 42, l: 44 };
    const vals = RS.map(r => p.byRound[r] ? p.byRound[r].total : 0);
    const max = niceMax(Math.max(...vals, 10));
    const svg = S("svg", { viewBox: `0 0 ${W} ${Hgt}`, class: "chart" });
    const yOf = drawAxes(svg, W, Hgt, M, max);
    const cx = xSlots(W, M, RS.length);
    const pts = vals.map((v, i) => [cx[i], yOf(v)]);
    const base = yOf(0);
    const hex = SP_META[p.species].hex;
    // 面積
    const areaPts = `${pts[0][0]},${base} ` + pts.map(p => p.join(",")).join(" ") + ` ${pts[pts.length - 1][0]},${base}`;
    svg.appendChild(S("polygon", { points: areaPts, fill: hex, opacity: 0.16 }));
    svg.appendChild(S("polyline", { points: pts.map(p => p.join(",")).join(" "), fill: "none", stroke: hex, "stroke-width": 4, "stroke-linejoin": "round", "stroke-linecap": "round" }));
    pts.forEach((pt, i) => {
      svg.appendChild(S("circle", { cx: pt[0], cy: pt[1], r: 5.5, fill: "#fff", stroke: hex, "stroke-width": 3 }));
      svg.appendChild(T(pt[0], pt[1] - 12, vals[i], { "text-anchor": "middle", "font-size": 13, "font-weight": 800, fill: hex }));
    });
    RS.forEach((r, i) => svg.appendChild(T(cx[i], Hgt - 14, ROUND_LABEL[r], { class: "round-label", "text-anchor": "middle" })));
    host.appendChild(svg);
    // 重點句
    const first = vals[0], last = vals[vals.length - 1], peak = Math.max(...vals);
    const peakR = RS[vals.indexOf(peak)];
    const ins = document.getElementById("b1-insight");
    ins.className = "insight" + (last < peak ? " insight--warn" : "");
    ins.innerHTML = `🌱 我從 <b>${first}</b> 隻開始，最多到 <b>${peak}</b> 隻（${ROUND_LABEL[peakR]}），結局是 <b>${last}</b> 隻。`
      + (last < peak ? `　最後比高峰少了 <b>${peak - last}</b> 隻。` : "");
  }

  // B2 我的棲地版圖（4 棲地堆疊）
  function renderB2(p) {
    const host = document.getElementById("b2"); host.innerHTML = "";
    const W = 760, Hgt = 320, M = { t: 22, r: 16, b: 42, l: 44 };
    const totals = RS.map(r => p.byRound[r] ? p.byRound[r].total : 0);
    const max = niceMax(Math.max(...totals, 10));
    const svg = S("svg", { viewBox: `0 0 ${W} ${Hgt}`, class: "chart" });
    const yOf = drawAxes(svg, W, Hgt, M, max);
    const cx = xSlots(W, M, RS.length);
    const barW = 56;
    RS.forEach((r, i) => {
      const st = p.byRound[r]; if (!st) return;
      let acc = 0;
      HB.forEach(h => {
        const v = st[h]; if (v <= 0) return;
        const yTop = yOf(acc + v), yBot = yOf(acc);
        svg.appendChild(S("rect", { x: cx[i] - barW / 2, y: yTop, width: barW, height: Math.max(0, yBot - yTop), fill: HB_META[h].hex, rx: 3, opacity: 0.95 }));
        if (yBot - yTop > 15) svg.appendChild(T(cx[i], (yTop + yBot) / 2 + 4, v, { class: "bar-val", "text-anchor": "middle" }));
        acc += v;
      });
      svg.appendChild(T(cx[i], yOf(acc) - 8, acc, { class: "bar-total", "text-anchor": "middle" }));
      svg.appendChild(T(cx[i], Hgt - 14, ROUND_LABEL[r], { class: "round-label", "text-anchor": "middle" }));
    });
    host.appendChild(svg);
    buildLegend("b2-legend", HB.map(h => ({ label: HB_META[h].emoji + " " + HB_META[h].name, color: HB_META[h].hex })));
    // 重點句：開局住幾塊 → 結局住幾塊
    const cntAt = r => HB.filter(h => p.byRound[r] && p.byRound[r][h] > 0).length;
    const ins = document.getElementById("b2-insight");
    ins.className = "insight";
    ins.innerHTML = `🧩 開局我只住在 <b>${cntAt(RS[0])}</b> 塊棲地，結局擴張到 <b>${cntAt(RS[RS.length - 1])}</b> 塊。`;
  }

  // B3 我 vs 同色平均 vs 全班平均
  function renderB3(p) {
    const host = document.getElementById("b3"); host.innerHTML = "";
    const W = 760, Hgt = 320, M = { t: 24, r: 16, b: 42, l: 44 };
    const mine = RS.map(r => p.byRound[r] ? p.byRound[r].total : 0);
    const spAvg = RS.map(r => speciesAvgByRound(p.species, r));
    const clAvg = RS.map(r => classAvgByRound(r));
    const max = niceMax(Math.max(...mine, ...spAvg, ...clAvg, 10));
    const svg = S("svg", { viewBox: `0 0 ${W} ${Hgt}`, class: "chart" });
    const yOf = drawAxes(svg, W, Hgt, M, max);
    const cx = xSlots(W, M, RS.length);
    const hex = SP_META[p.species].hex;
    const lines = [
      { vals: clAvg, color: "#b9b3a6", w: 3, dash: "5 5", name: "全班平均" },
      { vals: spAvg, color: "#8a8170", w: 3, dash: "2 4", name: "同色夥伴平均" },
      { vals: mine, color: hex, w: 4.5, dash: "", name: "我" },
    ];
    lines.forEach(L => {
      const pts = L.vals.map((v, i) => [cx[i], yOf(v)]);
      svg.appendChild(S("polyline", { points: pts.map(p => p.join(",")).join(" "), fill: "none", stroke: L.color, "stroke-width": L.w, "stroke-dasharray": L.dash, "stroke-linejoin": "round", "stroke-linecap": "round" }));
      if (L.name === "我") pts.forEach(pt => svg.appendChild(S("circle", { cx: pt[0], cy: pt[1], r: 5, fill: "#fff", stroke: hex, "stroke-width": 3 })));
    });
    RS.forEach((r, i) => svg.appendChild(T(cx[i], Hgt - 14, ROUND_LABEL[r], { class: "round-label", "text-anchor": "middle" })));
    host.appendChild(svg);
    buildLegend("b3-legend", [
      { label: "我", color: hex },
      { label: "同色夥伴平均", color: "#8a8170" },
      { label: "全班平均", color: "#b9b3a6" },
    ]);
    const lastMine = mine[mine.length - 1], lastCl = clAvg[clAvg.length - 1];
    const note = document.getElementById("b3-note");
    note.textContent = lastMine >= lastCl
      ? `結局我有 ${lastMine} 隻，比全班平均（${Math.round(lastCl)}）多 ── 我這個族群算是壯大的。`
      : `結局我有 ${lastMine} 隻，比全班平均（${Math.round(lastCl)}）少 ── 我這個族群被壓著長。`;
  }

  // B4 我的故事時間軸（事件→我的變化）
  function renderB4(p) {
    const host = document.getElementById("b4"); host.innerHTML = "";
    // report 回合 r 造成 state 回合 r → r+1 的變化
    [1, 2, 3, 4, 5].forEach(r => {
      const before = p.byRound[r] ? p.byRound[r].total : 0;
      const after = p.byRound[r + 1] ? p.byRound[r + 1].total : before;
      const delta = after - before;
      const evs = D.eventsByRound[r] || [];
      const dev = evs.find(e => e.kind === "A") || {};
      const warn = evs.find(e => e.kind === "B");
      const hex = SP_META[p.species].hex;

      const item = H("div", { class: "story__item" });
      const rail = H("div", { class: "story__rail" });
      rail.appendChild(H("div", { class: "story__node", style: `background:${delta >= 0 ? "#6b9e47" : "#c8553d"}` }, EVENT_ICON[dev.event_id] || "⚠️"));
      if (r < 5) rail.appendChild(H("div", { class: "story__line" }));
      item.appendChild(rail);

      const body = H("div", { class: "story__body" });
      body.appendChild(H("div", { class: "story__round" }, `第 ${r} 回 · 結束`));
      body.appendChild(H("div", { class: "story__event" },
        `🧑 人類做了：${dev.name || "─"}`
        + (warn ? `<span class="b-event">（生態警報：${warn.name}）</span>` : "")));
      const dCls = delta >= 0 ? "story__delta--up" : "story__delta--down";
      const dTxt = delta > 0 ? `＋${delta}` : delta < 0 ? `${delta}` : "±0";
      body.appendChild(H("div", { class: "story__delta " + dCls },
        `${delta >= 0 ? "📈" : "📉"} 我的數量：${before} → ${after}（${dTxt} 隻）`));
      if (dev.impact_desc)
        body.appendChild(H("div", { class: "story__say" }, "💬 " + fmtImpact(dev.impact_desc)));
      item.appendChild(body);
      host.appendChild(item);
    });
  }

  function renderPlayer(pc) {
    const p = D.players[pc];
    const chip = document.getElementById("player-chip");
    chip.textContent = SP_META[p.species].name;
    chip.style.background = SP_META[p.species].hex;
    renderB1(p); renderB2(p); renderB3(p); renderB4(p);
  }

  /* =======================================================================
     初始化
     ======================================================================= */
  function activateTab(tab) {
    document.querySelectorAll(".tab").forEach(b => b.classList.toggle("is-active", b.dataset.tab === tab));
    document.getElementById("sec-teacher").classList.toggle("is-active", tab === "teacher");
    document.getElementById("sec-player").classList.toggle("is-active", tab === "player");
  }
  function initPlayerPicker() {
    const sel = document.getElementById("player-select");
    Object.keys(D.players).sort().forEach(pc => {
      const p = D.players[pc];
      const opt = H("option", { value: pc });
      opt.textContent = `${pc}（${SP_META[p.species].name}）`;
      sel.appendChild(opt);
    });
    sel.addEventListener("change", () => renderPlayer(sel.value));
    // 支援 ?p=S08 預選玩家
    const q = new URLSearchParams(location.search).get("p");
    if (q && D.players[q]) sel.value = q;
    renderPlayer(sel.value);
  }
  function initTabs() {
    document.querySelectorAll(".tab").forEach(btn => {
      btn.addEventListener("click", () => activateTab(btn.dataset.tab));
    });
    // 支援 #player 直接開玩家端（方便分享與預覽）
    if (location.hash.replace("#", "") === "player") activateTab("player");
  }

  function init() {
    renderEventFlow();
    renderA1(); renderA2(); renderA3(); renderA4();
    initPlayerPicker();
    initTabs();
  }
  document.addEventListener("DOMContentLoaded", init);
})();
