// 一次性資料彙整腳本：讀 5/25 匯出的 CSV，輸出 data.json 供預覽 HTML 內嵌使用。
// 不屬於系統 runtime，只是分析用。執行：node build-data.js
const fs = require("fs");
const path = require("path");

const SRC = path.resolve(__dirname, "..", "habitat-export-2026-05-25T10-11-16");

// --- 極簡 CSV parser（支援雙引號內逗號/換行/JSON）---
function parseCSV(text) {
  text = text.replace(/^﻿/, ""); // 去掉 BOM
  const rows = [];
  let row = [], field = "", inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQ = false;
      } else field += c;
    } else {
      if (c === '"') inQ = true;
      else if (c === ",") { row.push(field); field = ""; }
      else if (c === "\r") { /* skip */ }
      else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
      else field += c;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  const header = rows.shift();
  return rows.filter(r => r.length > 1).map(r => {
    const o = {};
    header.forEach((h, i) => (o[h] = r[i]));
    return o;
  });
}

function read(name) {
  return parseCSV(fs.readFileSync(path.join(SRC, name), "utf8"));
}

const HABITATS = ["wetland", "forest", "urban", "pond"];
const SPECIES = ["red", "green", "yellow", "brown", "blue", "purple"];

// --- player_state：逐回合各物種各棲地 ---
const stateRows = read("player_state.csv");
const players = {}; // player_code -> {species, byRound:{round:{pond,urban,forest,wetland,total}}}
const rounds = new Set();
for (const r of stateRows) {
  const pc = r.player_code;
  const round = +r.round;
  rounds.add(round);
  let pops;
  try { pops = JSON.parse(r.populations); } catch { pops = {}; }
  const total = HABITATS.reduce((s, h) => s + (+pops[h] || 0), 0);
  if (!players[pc]) players[pc] = { player_code: pc, species: r.species, byRound: {} };
  players[pc].byRound[round] = {
    pond: +pops.pond || 0,
    urban: +pops.urban || 0,
    forest: +pops.forest || 0,
    wetland: +pops.wetland || 0,
    total,
  };
}
const roundList = [...rounds].sort((a, b) => a - b);

// --- 彙整：每回合 × 物種 總量；每回合 × 棲地 總量；每回合 × 棲地 × 物種 ---
const speciesTotalsByRound = {};   // round -> {species: total}
const habitatTotalsByRound = {};   // round -> {habitat: total}
const habitatSpeciesByRound = {};  // round -> {habitat: {species: total}}
for (const round of roundList) {
  speciesTotalsByRound[round] = Object.fromEntries(SPECIES.map(s => [s, 0]));
  habitatTotalsByRound[round] = Object.fromEntries(HABITATS.map(h => [h, 0]));
  habitatSpeciesByRound[round] = Object.fromEntries(
    HABITATS.map(h => [h, Object.fromEntries(SPECIES.map(s => [s, 0]))])
  );
}
for (const pc in players) {
  const p = players[pc];
  for (const round of roundList) {
    const st = p.byRound[round];
    if (!st) continue;
    speciesTotalsByRound[round][p.species] += st.total;
    for (const h of HABITATS) {
      habitatTotalsByRound[round][h] += st[h];
      habitatSpeciesByRound[round][h][p.species] += st[h];
    }
  }
}

// --- reports：抽出每回合的人為/生態事件（去重）---
const reportRows = read("reports.csv");
const eventsByRound = {}; // round -> [{kind,name,habitat,event_id,impact_desc}]
for (const r of reportRows) {
  const round = +r.round;
  let evs;
  try { evs = JSON.parse(r.events || "[]"); } catch { evs = []; }
  if (!eventsByRound[round]) eventsByRound[round] = [];
  for (const e of evs) {
    const key = (e.event_id || "") + "|" + (e.name || "");
    if (eventsByRound[round].some(x => x._key === key)) continue;
    eventsByRound[round].push({
      _key: key,
      kind: e.kind || "",
      name: e.name || "",
      habitat: e.habitat || "",
      event_id: e.event_id || "",
      impact_desc: e.impact_desc || "",
    });
  }
}
// 清掉內部 key
for (const rd in eventsByRound) eventsByRound[rd].forEach(e => delete e._key);

const out = {
  meta: {
    source: "habitat-export-2026-05-25T10-11-16",
    generatedAt: new Date().toISOString(),
    species: SPECIES,
    habitats: HABITATS,
    rounds: roundList,
  },
  players,
  speciesTotalsByRound,
  habitatTotalsByRound,
  habitatSpeciesByRound,
  eventsByRound,
};

fs.writeFileSync(path.join(__dirname, "data.json"), JSON.stringify(out, null, 2), "utf8");
console.log("rounds:", roundList.join(","));
console.log("players:", Object.keys(players).length);
console.log("species totals @round6:", JSON.stringify(speciesTotalsByRound[6]));
console.log("habitat totals @round6:", JSON.stringify(habitatTotalsByRound[6]));
console.log("events rounds:", Object.keys(eventsByRound).join(","));
console.log("wrote data.json");
