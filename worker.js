/**
 * ETF 成分股查看器 — Cloudflare Worker
 *
 * 部署方式：
 *   1. 在 CF Dashboard → Workers & Pages → 创建 Worker
 *   2. 把本文件内容粘贴进去 → 保存并部署
 *   3. 绑定自定义域名（或者直接用 *.workers.dev 域名访问）
 *
 * 功能：
 *   - 提供静态页面（index.html / style.css / app.js / data/latest.js）
 *   - 代理上交所 API（/api/query?code=513310）
 */

// ====== 内联静态文件 ======

const STATIC_FILES = {
  "/": {
    contentType: "text/html; charset=utf-8",
    body: `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>ETF 成分股查看器</title>
<link rel="stylesheet" href="style.css">
</head>
<body>

<div class="app" id="app">
  
  <!-- Header -->
  <header class="header" id="appHeader">
    <div class="header-top">
      <h1 class="etf-code" id="etfCode">--</h1>
      <span class="etf-name" id="etfName">--</span>
      <span class="fetch-date" id="fetchDate">📅 <span>--</span></span>
    </div>
  </header>

  <!-- Stats Cards -->
  <section class="stats" id="statsSection">
    <div class="stat-card">
      <span class="stat-icon">📊</span>
      <span class="stat-value" id="statTotal">--</span>
      <span class="stat-label">成分股总数</span>
    </div>
    <div class="stat-card">
      <span class="stat-icon">🏛️</span>
      <span class="stat-value" id="statSse">--</span>
      <span class="stat-label">上交所</span>
    </div>
    <div class="stat-card">
      <span class="stat-icon">🏢</span>
      <span class="stat-value" id="statSzse">--</span>
      <span class="stat-label">深交所</span>
    </div>
    <div class="stat-card">
      <span class="stat-icon">🌍</span>
      <span class="stat-value" id="statOversea">--</span>
      <span class="stat-label">境外</span>
    </div>
  </section>

  <!-- Top Holdings -->
  <section class="top-holdings" id="topSection">
    <h2 class="section-title">🏆 前 5 大权重</h2>
    <div class="top-list" id="topList"></div>
  </section>

  <!-- Full Table -->
  <section class="table-section">
    <h2 class="section-title">📋 全部成分股</h2>
    <div class="table-controls">
      <span class="table-hint">点击列头排序</span>
      <input type="text" class="search-box" id="searchBox" placeholder="🔍 搜索代码或名称..." oninput="filterTable()">
      <button class="reload-btn" onclick="reloadLatest()">🔄 刷新</button>
    </div>
    <div class="table-wrapper">
      <table class="data-table" id="dataTable">
        <thead>
          <tr>
            <th data-sort="INSTRUMENT_ID">代码 <span class="sort-arrow"></span></th>
            <th data-sort="INSTRUMENT_NAME">名称 <span class="sort-arrow"></span></th>
            <th data-sort="QUANTITY" class="num">数量 <span class="sort-arrow"></span></th>
            <th class="num">占比</th>
            <th data-sort="SUBSTITUTION_CASH_AMOUNT" class="num">替代金额(元) <span class="sort-arrow"></span></th>
            <th data-sort="_MARKET_CN">市场 <span class="sort-arrow"></span></th>
          </tr>
        </thead>
        <tbody id="tableBody"></tbody>
      </table>
    </div>
  </section>

  <!-- Footer -->
  <footer class="footer">
    <div class="footer-actions">
      <label class="file-btn">
        📂 载入历史数据
        <input type="file" accept=".json" onchange="loadFromFile(event)" hidden>
      </label>
      <button class="export-btn" onclick="exportData()">📥 导出 CSV</button>
    </div>
    <p class="footer-note">数据来源：上交所 query.sse.com.cn</p>
  </footer>
</div>

<!-- Latest data auto-loaded via script (static snapshot) -->
<script src="data/latest.js"></script>
<script src="app.js"></script>
<script>initFromGlobals();</script>
</body>
</html>`
  },
  "/style.css": {
    contentType: "text/css; charset=utf-8",
    body: `/* === Reset & Base === */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root {
  --bg: #0f172a;
  --surface: #1e293b;
  --surface2: #334155;
  --border: #475569;
  --text: #f1f5f9;
  --text2: #94a3b8;
  --accent: #f59e0b;
  --accent2: #fbbf24;
  --green: #22c55e;
  --blue: #3b82f6;
  --radius: 12px;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans SC", sans-serif;
  background: var(--bg);
  color: var(--text);
  line-height: 1.6;
  min-height: 100vh;
}

.app {
  max-width: 1100px;
  margin: 0 auto;
  padding: 24px 20px 40px;
}

/* === Header === */
.header {
  background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 28px 32px;
  margin-bottom: 20px;
}

.header-top {
  display: flex;
  align-items: baseline;
  gap: 12px;
  flex-wrap: wrap;
}

.etf-code {
  font-size: 32px;
  font-weight: 800;
  color: var(--accent);
  letter-spacing: 1px;
}

.etf-name {
  font-size: 18px;
  color: var(--text2);
  font-weight: 500;
}

.fetch-date {
  margin-left: auto;
  font-size: 14px;
  color: var(--text2);
  background: var(--surface2);
  padding: 4px 12px;
  border-radius: 20px;
}

/* === Stats === */
.stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 12px;
  margin-bottom: 24px;
}

.stat-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 18px;
  text-align: center;
  transition: transform 0.15s, box-shadow 0.15s;
}

.stat-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(0,0,0,0.3);
}

.stat-icon { font-size: 28px; display: block; margin-bottom: 6px; }
.stat-value { font-size: 28px; font-weight: 700; display: block; }
.stat-label { font-size: 13px; color: var(--text2); margin-top: 2px; }

/* === Section Title === */
.section-title {
  font-size: 18px;
  font-weight: 600;
  margin-bottom: 12px;
  color: var(--text);
}

/* === Top Holdings === */
.top-holdings {
  margin-bottom: 28px;
}

.top-list {
  display: grid;
  gap: 8px;
}

.top-item {
  display: flex;
  align-items: center;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 12px 18px;
  gap: 14px;
}

.top-rank {
  font-size: 16px;
  font-weight: 800;
  color: var(--accent);
  min-width: 28px;
}

.top-info { flex: 1; }
.top-name { font-weight: 600; font-size: 15px; }
.top-code { font-size: 13px; color: var(--text2); }

.top-qty {
  text-align: right;
  font-size: 14px;
  color: var(--accent2);
  font-weight: 600;
  white-space: nowrap;
}

.top-market {
  font-size: 13px;
  padding: 2px 10px;
  border-radius: 12px;
  background: var(--surface2);
  white-space: nowrap;
}

.top-pct {
  text-align: right;
  font-size: 15px;
  font-weight: 700;
  color: var(--accent);
  min-width: 64px;
  white-space: nowrap;
}

/* === Table Controls === */
.table-controls {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
  gap: 12px;
  flex-wrap: wrap;
}

.table-hint {
  font-size: 13px;
  color: var(--text2);
}

.search-box {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 8px 14px;
  color: var(--text);
  font-size: 14px;
  width: 240px;
  outline: none;
  transition: border-color 0.2s;
}

.search-box:focus { border-color: var(--accent); }
.search-box::placeholder { color: var(--text2); }

/* === Table === */
.table-wrapper {
  overflow-x: auto;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
}

.data-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
  min-width: 640px;
}

.data-table th {
  background: var(--surface2);
  padding: 10px 14px;
  text-align: left;
  font-weight: 600;
  cursor: pointer;
  user-select: none;
  white-space: nowrap;
  position: sticky;
  top: 0;
}

.data-table th:hover { background: #475569; }
.data-table th.num { text-align: right; }

.sort-arrow { font-size: 11px; margin-left: 4px; }
th.sorted-asc .sort-arrow::after { content: "▲"; }
th.sorted-desc .sort-arrow::after { content: "▼"; }
th:not(.sorted-asc):not(.sorted-desc) .sort-arrow::after { content: "↕"; opacity: 0.3; }

.data-table td {
  padding: 9px 14px;
  border-top: 1px solid var(--border);
  white-space: nowrap;
}

.data-table td.num { text-align: right; font-variant-numeric: tabular-nums; }

.data-table tbody tr:hover {
  background: rgba(245, 158, 11, 0.06);
}

.data-table tbody tr:first-child td { border-top: none; }

.market-tag {
  display: inline-block;
  padding: 1px 10px;
  border-radius: 10px;
  font-size: 12px;
  font-weight: 500;
}

.market-tag.sse { background: rgba(59,130,246,0.2); color: #60a5fa; }
.market-tag.szse { background: rgba(34,197,94,0.2); color: #4ade80; }
.market-tag.oversea { background: rgba(245,158,11,0.2); color: #fbbf24; }

/* === Footer === */
.footer {
  margin-top: 32px;
  padding: 20px 0;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
}

.footer-actions {
  display: flex;
  gap: 10px;
}

.file-btn {
  display: inline-block;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 8px 18px;
  cursor: pointer;
  font-size: 14px;
  transition: background 0.15s;
}

.file-btn:hover { background: var(--surface2); }

.reload-btn {
  background: var(--accent);
  color: #0f172a;
  border: none;
  border-radius: 8px;
  padding: 8px 18px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 600;
  transition: opacity 0.15s;
}

.reload-btn:hover { opacity: 0.85; }

.export-btn {
  background: transparent;
  color: var(--accent2);
  border: 1px solid var(--accent2);
  border-radius: 8px;
  padding: 8px 18px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 600;
  transition: all 0.15s;
}

.export-btn:hover {
  background: rgba(251, 191, 36, 0.12);
}

.footer-note {
  font-size: 12px;
  color: var(--text2);
}

/* === Empty State === */
.empty-state {
  text-align: center;
  padding: 60px 20px;
  color: var(--text2);
}

.empty-state p { margin-top: 8px; font-size: 15px; }

/* === Responsive === */
@media (max-width: 640px) {
  .app { padding: 16px 12px; }
  .header { padding: 20px; }
  .etf-code { font-size: 24px; }
  .etf-name { font-size: 15px; width: 100%; }
  .fetch-date { margin-left: 0; }
  .stats { grid-template-columns: repeat(2, 1fr); }
  .search-box { width: 100%; }
}`
  },
  "/data/latest.js": {
    contentType: "application/javascript; charset=utf-8",
    body: `const ETF_DATA = {
  "fundCode": "513310",
  "etfName": "中韩半导体ETF",
  "fetchedAt": "2026-06-12",
  "count": 30,
  "components": [
    {"REDEMPTION_DISCOUNT_RATE":"0%","INSTRUMENT_NAME":"紫光国微","ETF_VERSION":"XML","UNDERLYION_SECURITY_ID":"102","QUANTITY":"481","SUBSTITUTION_FLAG":"1","SUBSTITUTION_CASH_AMOUNT":"        34353.020","ETF_CLASS":"33","CREATION_PREMIUM_RATE":"10%","INSTRUMENT_ID":"002049","_MARKET_CN":"深交所","_FLAG_CN":"允许现金替代"},
    {"REDEMPTION_DISCOUNT_RATE":"0%","INSTRUMENT_NAME":"北方华创","ETF_VERSION":"XML","UNDERLYION_SECURITY_ID":"102","QUANTITY":"306","SUBSTITUTION_FLAG":"1","SUBSTITUTION_CASH_AMOUNT":"       195075.000","ETF_CLASS":"33","CREATION_PREMIUM_RATE":"10%","INSTRUMENT_ID":"002371","_MARKET_CN":"深交所","_FLAG_CN":"允许现金替代"},
    {"REDEMPTION_DISCOUNT_RATE":"0%","INSTRUMENT_NAME":"华大九天","ETF_VERSION":"XML","UNDERLYION_SECURITY_ID":"102","QUANTITY":"154","SUBSTITUTION_FLAG":"1","SUBSTITUTION_CASH_AMOUNT":"        14853.300","ETF_CLASS":"33","CREATION_PREMIUM_RATE":"10%","INSTRUMENT_ID":"301269","_MARKET_CN":"深交所","_FLAG_CN":"允许现金替代"},
    {"REDEMPTION_DISCOUNT_RATE":"0%","INSTRUMENT_NAME":"长电科技","ETF_VERSION":"XML","UNDERLYION_SECURITY_ID":"101","QUANTITY":"1013","SUBSTITUTION_FLAG":"1","SUBSTITUTION_CASH_AMOUNT":"        72885.350","ETF_CLASS":"33","CREATION_PREMIUM_RATE":"10%","INSTRUMENT_ID":"600584","_MARKET_CN":"上交所","_FLAG_CN":"允许现金替代"},
    {"REDEMPTION_DISCOUNT_RATE":"0%","INSTRUMENT_NAME":"豪威集团","ETF_VERSION":"XML","UNDERLYION_SECURITY_ID":"101","QUANTITY":"600","SUBSTITUTION_FLAG":"1","SUBSTITUTION_CASH_AMOUNT":"        51102.000","ETF_CLASS":"33","CREATION_PREMIUM_RATE":"10%","INSTRUMENT_ID":"603501","_MARKET_CN":"上交所","_FLAG_CN":"允许现金替代"},
    {"REDEMPTION_DISCOUNT_RATE":"0%","INSTRUMENT_NAME":"瑞芯微","ETF_VERSION":"XML","UNDERLYION_SECURITY_ID":"101","QUANTITY":"149","SUBSTITUTION_FLAG":"1","SUBSTITUTION_CASH_AMOUNT":"        23851.920","ETF_CLASS":"33","CREATION_PREMIUM_RATE":"10%","INSTRUMENT_ID":"603893","_MARKET_CN":"上交所","_FLAG_CN":"允许现金替代"},
    {"REDEMPTION_DISCOUNT_RATE":"0%","INSTRUMENT_NAME":"兆易创新","ETF_VERSION":"XML","UNDERLYION_SECURITY_ID":"101","QUANTITY":"473","SUBSTITUTION_FLAG":"1","SUBSTITUTION_CASH_AMOUNT":"       228695.500","ETF_CLASS":"33","CREATION_PREMIUM_RATE":"10%","INSTRUMENT_ID":"603986","_MARKET_CN":"上交所","_FLAG_CN":"允许现金替代"},
    {"REDEMPTION_DISCOUNT_RATE":"0%","INSTRUMENT_NAME":"澜起科技","ETF_VERSION":"XML","UNDERLYION_SECURITY_ID":"101","QUANTITY":"810","SUBSTITUTION_FLAG":"1","SUBSTITUTION_CASH_AMOUNT":"       185247.000","ETF_CLASS":"33","CREATION_PREMIUM_RATE":"10%","INSTRUMENT_ID":"688008","_MARKET_CN":"上交所","_FLAG_CN":"允许现金替代"},
    {"REDEMPTION_DISCOUNT_RATE":"0%","INSTRUMENT_NAME":"中微公司","ETF_VERSION":"XML","UNDERLYION_SECURITY_ID":"101","QUANTITY":"462","SUBSTITUTION_FLAG":"1","SUBSTITUTION_CASH_AMOUNT":"       140041.440","ETF_CLASS":"33","CREATION_PREMIUM_RATE":"10%","INSTRUMENT_ID":"688012","_MARKET_CN":"上交所","_FLAG_CN":"允许现金替代"},
    {"REDEMPTION_DISCOUNT_RATE":"0%","INSTRUMENT_NAME":"海光信息","ETF_VERSION":"XML","UNDERLYION_SECURITY_ID":"101","QUANTITY":"658","SUBSTITUTION_FLAG":"1","SUBSTITUTION_CASH_AMOUNT":"       190714.720","ETF_CLASS":"33","CREATION_PREMIUM_RATE":"10%","INSTRUMENT_ID":"688041","_MARKET_CN":"上交所","_FLAG_CN":"允许现金替代"},
    {"REDEMPTION_DISCOUNT_RATE":"0%","INSTRUMENT_NAME":"龙芯中科","ETF_VERSION":"XML","UNDERLYION_SECURITY_ID":"101","QUANTITY":"142","SUBSTITUTION_FLAG":"1","SUBSTITUTION_CASH_AMOUNT":"        19267.980","ETF_CLASS":"33","CREATION_PREMIUM_RATE":"10%","INSTRUMENT_ID":"688047","_MARKET_CN":"上交所","_FLAG_CN":"允许现金替代"},
    {"REDEMPTION_DISCOUNT_RATE":"0%","INSTRUMENT_NAME":"沪硅产业","ETF_VERSION":"XML","UNDERLYION_SECURITY_ID":"101","QUANTITY":"1356","SUBSTITUTION_FLAG":"1","SUBSTITUTION_CASH_AMOUNT":"        44070.000","ETF_CLASS":"33","CREATION_PREMIUM_RATE":"10%","INSTRUMENT_ID":"688126","_MARKET_CN":"上交所","_FLAG_CN":"允许现金替代"},
    {"REDEMPTION_DISCOUNT_RATE":"0%","INSTRUMENT_NAME":"寒武纪","ETF_VERSION":"XML","UNDERLYION_SECURITY_ID":"101","QUANTITY":"222","SUBSTITUTION_FLAG":"1","SUBSTITUTION_CASH_AMOUNT":"       270729.000","ETF_CLASS":"33","CREATION_PREMIUM_RATE":"10%","INSTRUMENT_ID":"688256","_MARKET_CN":"上交所","_FLAG_CN":"允许现金替代"},
    {"REDEMPTION_DISCOUNT_RATE":"0%","INSTRUMENT_NAME":"华润微","ETF_VERSION":"XML","UNDERLYION_SECURITY_ID":"101","QUANTITY":"376","SUBSTITUTION_FLAG":"1","SUBSTITUTION_CASH_AMOUNT":"        23699.280","ETF_CLASS":"33","CREATION_PREMIUM_RATE":"10%","INSTRUMENT_ID":"688396","_MARKET_CN":"上交所","_FLAG_CN":"允许现金替代"},
    {"REDEMPTION_DISCOUNT_RATE":"0%","INSTRUMENT_NAME":"中芯国际","ETF_VERSION":"XML","UNDERLYION_SECURITY_ID":"101","QUANTITY":"1415","SUBSTITUTION_FLAG":"1","SUBSTITUTION_CASH_AMOUNT":"       180271.000","ETF_CLASS":"33","CREATION_PREMIUM_RATE":"10%","INSTRUMENT_ID":"688981","_MARKET_CN":"上交所","_FLAG_CN":"允许现金替代"},
    {"REDEMPTION_DISCOUNT_RATE":"0%","INSTRUMENT_NAME":"SK hynix","ETF_VERSION":"XML","UNDERLYION_SECURITY_ID":"9999","QUANTITY":"122","SUBSTITUTION_FLAG":"1","SUBSTITUTION_CASH_AMOUNT":"      1142917.020","ETF_CLASS":"33","CREATION_PREMIUM_RATE":"10%","INSTRUMENT_ID":"A000660","_MARKET_CN":"境外","_FLAG_CN":"允许现金替代"},
    {"REDEMPTION_DISCOUNT_RATE":"0%","INSTRUMENT_NAME":"DB HiTek Co.,LTD","ETF_VERSION":"XML","UNDERLYION_SECURITY_ID":"9999","QUANTITY":"153","SUBSTITUTION_FLAG":"1","SUBSTITUTION_CASH_AMOUNT":"       105879.520","ETF_CLASS":"33","CREATION_PREMIUM_RATE":"10%","INSTRUMENT_ID":"A000990","_MARKET_CN":"境外","_FLAG_CN":"允许现金替代"},
    {"REDEMPTION_DISCOUNT_RATE":"0%","INSTRUMENT_NAME":"SamsungElectronics","ETF_VERSION":"XML","UNDERLYION_SECURITY_ID":"9999","QUANTITY":"703","SUBSTITUTION_FLAG":"1","SUBSTITUTION_CASH_AMOUNT":"       937249.740","ETF_CLASS":"33","CREATION_PREMIUM_RATE":"10%","INSTRUMENT_ID":"A005930","_MARKET_CN":"境外","_FLAG_CN":"允许现金替代"},
    {"REDEMPTION_DISCOUNT_RATE":"0%","INSTRUMENT_NAME":"JUSUNG ENGINEERING Co.,Ltd.","ETF_VERSION":"XML","UNDERLYION_SECURITY_ID":"9999","QUANTITY":"160","SUBSTITUTION_FLAG":"1","SUBSTITUTION_CASH_AMOUNT":"       175146.030","ETF_CLASS":"33","CREATION_PREMIUM_RATE":"10%","INSTRUMENT_ID":"A036930","_MARKET_CN":"境外","_FLAG_CN":"允许现金替代"},
    {"REDEMPTION_DISCOUNT_RATE":"0%","INSTRUMENT_NAME":"EO Technics Co., Ltd.","ETF_VERSION":"XML","UNDERLYION_SECURITY_ID":"9999","QUANTITY":"42","SUBSTITUTION_FLAG":"1","SUBSTITUTION_CASH_AMOUNT":"        94386.230","ETF_CLASS":"33","CREATION_PREMIUM_RATE":"10%","INSTRUMENT_ID":"A039030","_MARKET_CN":"境外","_FLAG_CN":"允许现金替代"},
    {"REDEMPTION_DISCOUNT_RATE":"0%","INSTRUMENT_NAME":"HANMISemiconductorCO.,Ltd.","ETF_VERSION":"XML","UNDERLYION_SECURITY_ID":"9999","QUANTITY":"94","SUBSTITUTION_FLAG":"1","SUBSTITUTION_CASH_AMOUNT":"       121969.060","ETF_CLASS":"33","CREATION_PREMIUM_RATE":"10%","INSTRUMENT_ID":"A042700","_MARKET_CN":"境外","_FLAG_CN":"允许现金替代"},
    {"REDEMPTION_DISCOUNT_RATE":"0%","INSTRUMENT_NAME":"LEENO Industrial Inc","ETF_VERSION":"XML","UNDERLYION_SECURITY_ID":"9999","QUANTITY":"200","SUBSTITUTION_FLAG":"1","SUBSTITUTION_CASH_AMOUNT":"        88999.870","ETF_CLASS":"33","CREATION_PREMIUM_RATE":"10%","INSTRUMENT_ID":"A058470","_MARKET_CN":"境外","_FLAG_CN":"允许现金替代"},
    {"REDEMPTION_DISCOUNT_RATE":"0%","INSTRUMENT_NAME":"TOKAI CARBON KOREA CO., LTD","ETF_VERSION":"XML","UNDERLYION_SECURITY_ID":"9999","QUANTITY":"29","SUBSTITUTION_FLAG":"1","SUBSTITUTION_CASH_AMOUNT":"        35883.090","ETF_CLASS":"33","CREATION_PREMIUM_RATE":"10%","INSTRUMENT_ID":"A064760","_MARKET_CN":"境外","_FLAG_CN":"允许现金替代"},
    {"REDEMPTION_DISCOUNT_RATE":"0%","INSTRUMENT_NAME":"Hana Micron Inc.","ETF_VERSION":"XML","UNDERLYION_SECURITY_ID":"9999","QUANTITY":"245","SUBSTITUTION_FLAG":"1","SUBSTITUTION_CASH_AMOUNT":"        52382.170","ETF_CLASS":"33","CREATION_PREMIUM_RATE":"10%","INSTRUMENT_ID":"A067310","_MARKET_CN":"境外","_FLAG_CN":"允许现金替代"},
    {"REDEMPTION_DISCOUNT_RATE":"0%","INSTRUMENT_NAME":"GemVax & KAEL Co.,Ltd.","ETF_VERSION":"XML","UNDERLYION_SECURITY_ID":"9999","QUANTITY":"168","SUBSTITUTION_FLAG":"1","SUBSTITUTION_CASH_AMOUNT":"         9670.840","ETF_CLASS":"33","CREATION_PREMIUM_RATE":"10%","INSTRUMENT_ID":"A082270","_MARKET_CN":"境外","_FLAG_CN":"允许现金替代"},
    {"REDEMPTION_DISCOUNT_RATE":"0%","INSTRUMENT_NAME":"Eugene Technology Co., Ltd.","ETF_VERSION":"XML","UNDERLYION_SECURITY_ID":"9999","QUANTITY":"70","SUBSTITUTION_FLAG":"1","SUBSTITUTION_CASH_AMOUNT":"        55651.670","ETF_CLASS":"33","CREATION_PREMIUM_RATE":"10%","INSTRUMENT_ID":"A084370","_MARKET_CN":"境外","_FLAG_CN":"允许现金替代"},
    {"REDEMPTION_DISCOUNT_RATE":"0%","INSTRUMENT_NAME":"Techwing, Inc.","ETF_VERSION":"XML","UNDERLYION_SECURITY_ID":"9999","QUANTITY":"134","SUBSTITUTION_FLAG":"1","SUBSTITUTION_CASH_AMOUNT":"        36506.890","ETF_CLASS":"33","CREATION_PREMIUM_RATE":"10%","INSTRUMENT_ID":"A089030","_MARKET_CN":"境外","_FLAG_CN":"允许现金替代"},
    {"REDEMPTION_DISCOUNT_RATE":"0%","INSTRUMENT_NAME":"ISC Co., LTD.","ETF_VERSION":"XML","UNDERLYION_SECURITY_ID":"9999","QUANTITY":"53","SUBSTITUTION_FLAG":"1","SUBSTITUTION_CASH_AMOUNT":"        45019.400","ETF_CLASS":"33","CREATION_PREMIUM_RATE":"10%","INSTRUMENT_ID":"A095340","_MARKET_CN":"境外","_FLAG_CN":"允许现金替代"},
    {"REDEMPTION_DISCOUNT_RATE":"0%","INSTRUMENT_NAME":"WONIK IPS Co.,Ltd.","ETF_VERSION":"XML","UNDERLYION_SECURITY_ID":"9999","QUANTITY":"166","SUBSTITUTION_FLAG":"1","SUBSTITUTION_CASH_AMOUNT":"       104365.270","ETF_CLASS":"33","CREATION_PREMIUM_RATE":"10%","INSTRUMENT_ID":"A240810","_MARKET_CN":"境外","_FLAG_CN":"允许现金替代"},
    {"REDEMPTION_DISCOUNT_RATE":"0%","INSTRUMENT_NAME":"HPSP Co., Ltd.","ETF_VERSION":"XML","UNDERLYION_SECURITY_ID":"9999","QUANTITY":"329","SUBSTITUTION_FLAG":"1","SUBSTITUTION_CASH_AMOUNT":"        80684.000","ETF_CLASS":"33","CREATION_PREMIUM_RATE":"10%","INSTRUMENT_ID":"A403870","_MARKET_CN":"境外","_FLAG_CN":"允许现金替代"}
  ]
};`
  },
  "/app.js": {
    contentType: "application/javascript; charset=utf-8",
    body: `/* ========== app.js ========== */

let allData = [];
let fullPackage = null;
let sortKey = "SUBSTITUTION_CASH_AMOUNT";
let sortAsc = false;

/* ---------- 初始化: 从 latest.js 加载 ---------- */
function initFromGlobals() {
  if (typeof ETF_DATA !== "undefined" && ETF_DATA && ETF_DATA.components) {
    fullPackage = ETF_DATA;
    allData = ETF_DATA.components;
    renderAll();
  } else {
    showEmpty("暂无数据，请先运行 <code>python fetch_etf.py</code>");
  }
}

/* ---------- 主渲染入口 ---------- */
function renderAll() {
  if (!fullPackage || !allData.length) return;
  renderHeader(fullPackage);
  renderStats(allData);
  renderTopHoldings(allData);
  renderTable(allData);
}

/* ---------- Header ---------- */
function renderHeader(pkg) {
  document.getElementById("etfCode").textContent = pkg.fundCode;
  document.getElementById("etfName").textContent = pkg.etfName || "ETF";
  document.getElementById("fetchDate").innerHTML = "📅 " + escapeHtml(pkg.fetchedAt);
}

/* ---------- Stats ---------- */
function renderStats(data) {
  const sse = data.filter(d => d._MARKET_CN === "上交所").length;
  const szse = data.filter(d => d._MARKET_CN === "深交所").length;
  const oversea = data.filter(d => d._MARKET_CN === "境外").length;

  document.getElementById("statTotal").textContent = data.length;
  document.getElementById("statSse").textContent = sse;
  document.getElementById("statSzse").textContent = szse;
  document.getElementById("statOversea").textContent = oversea;
}

/* ---------- Top 5 Holdings ---------- */
function renderTopHoldings(data) {
  const totalAmt = data.reduce((s, d) => s + parseNum(d.SUBSTITUTION_CASH_AMOUNT), 0);
  const sorted = [...data].sort((a, b) => parseNum(b.SUBSTITUTION_CASH_AMOUNT) - parseNum(a.SUBSTITUTION_CASH_AMOUNT));
  const top5 = sorted.slice(0, 5);

  const list = document.getElementById("topList");
  list.innerHTML = top5.map((item, i) => {
    const rankEmoji = ["🥇","🥈","🥉","4️⃣","5️⃣"][i] || \`\${i+1}.\`;
    const pct = totalAmt > 0 ? (parseNum(item.SUBSTITUTION_CASH_AMOUNT) / totalAmt * 100) : 0;
    return \`
      <div class="top-item">
        <span class="top-rank">\${rankEmoji}</span>
        <div class="top-info">
          <div class="top-name">\${escapeHtml(item.INSTRUMENT_NAME)}</div>
          <div class="top-code">\${escapeHtml(item.INSTRUMENT_ID)}</div>
        </div>
        <span class="top-market">\${escapeHtml(item._MARKET_CN)}</span>
        <span class="top-qty">\${fmtNum(item.QUANTITY)} 股</span>
        <span class="top-pct">\${pct.toFixed(2)}%</span>
      </div>\`;
  }).join("");
}

/* ---------- Table ---------- */
function renderTable(data, sortKey_, sortAsc_) {
  sortKey = sortKey_ || sortKey;
  sortAsc = sortAsc_ !== undefined ? sortAsc_ : sortAsc;

  const totalAmt = data.reduce((s, d) => s + parseNum(d.SUBSTITUTION_CASH_AMOUNT), 0);

  const sorted = [...data].sort((a, b) => {
    let va = a[sortKey], vb = b[sortKey];
    if (sortKey === "QUANTITY" || sortKey === "SUBSTITUTION_CASH_AMOUNT") {
      va = parseNum(va);
      vb = parseNum(vb);
    } else {
      va = (va || "").toString();
      vb = (vb || "").toString();
    }
    return sortAsc ? (va > vb ? 1 : -1) : (va < vb ? 1 : -1);
  });

  const tbody = document.getElementById("tableBody");
  tbody.innerHTML = sorted.map(item => {
    const mktClass = item._MARKET_CN === "上交所" ? "sse"
      : item._MARKET_CN === "深交所" ? "szse" : "oversea";
    const pct = totalAmt > 0 ? (parseNum(item.SUBSTITUTION_CASH_AMOUNT) / totalAmt * 100) : 0;
    return \`<tr>
      <td>\${escapeHtml(item.INSTRUMENT_ID)}</td>
      <td><strong>\${escapeHtml(item.INSTRUMENT_NAME)}</strong></td>
      <td class="num">\${fmtNum(item.QUANTITY)}</td>
      <td class="num">\${pct.toFixed(2)}%</td>
      <td class="num">\${fmtMoney(item.SUBSTITUTION_CASH_AMOUNT)}</td>
      <td><span class="market-tag \${mktClass}">\${escapeHtml(item._MARKET_CN)}</span></td>
    </tr>\`;
  }).join("");

  // 更新排序箭头
  document.querySelectorAll(".data-table th").forEach(th => {
    const key = th.dataset.sort;
    th.classList.remove("sorted-asc", "sorted-desc");
    if (key === sortKey) {
      th.classList.add(sortAsc ? "sorted-asc" : "sorted-desc");
    }
  });
}

/* ---------- 点击列头排序 ---------- */
document.addEventListener("click", function(e) {
  const th = e.target.closest("th[data-sort]");
  if (!th) return;
  const key = th.dataset.sort;
  if (key === sortKey) sortAsc = !sortAsc;
  else { sortKey = key; sortAsc = true; }
  const query = document.getElementById("searchBox").value;
  const filtered = filterData(allData, query);
  renderTable(filtered, sortKey, sortAsc);
});

/* ---------- 搜索过滤 ---------- */
function filterTable() {
  const query = document.getElementById("searchBox").value;
  const filtered = filterData(allData, query);
  renderTable(filtered, sortKey, sortAsc);
}

function filterData(data, query) {
  if (!query) return data;
  const q = query.trim().toLowerCase();
  return data.filter(d =>
    (d.INSTRUMENT_ID || "").toLowerCase().includes(q) ||
    (d.INSTRUMENT_NAME || "").toLowerCase().includes(q)
  );
}

/* ---------- 文件选择器 ---------- */
function loadFromFile(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const pkg = JSON.parse(e.target.result);
      if (!pkg.components || !pkg.components.length) throw new Error("empty");
      fullPackage = pkg;
      allData = pkg.components;
      document.getElementById("searchBox").value = "";
      renderAll();
    } catch (err) {
      alert("❌ 文件格式不对，请选择由 fetch_etf.py 生成的 JSON 文件");
    }
  };
  reader.readAsText(file);
  event.target.value = "";
}

/* ---------- 刷新最新数据（调服务器 API 真实抓取） ---------- */
async function reloadLatest() {
  const code = fullPackage ? fullPackage.fundCode : "513310";
  if (!code) return alert("❌ 没有基金代码");

  const btn = document.querySelector(".reload-btn");
  if (btn) { btn.disabled = true; btn.textContent = "⏳ 刷新中..."; }

  try {
    const resp = await fetch(\`/api/query?code=\${code}\`);
    const data = await resp.json();
    if (!data.ok) throw new Error(data.error);

    const MARKET_MAP = {"101": "上交所", "102": "深交所", "9999": "境外"};
    const FLAG_MAP = {"0": "不允许替代", "1": "允许现金替代", "2": "必须现金替代"};

    // 补齐中文标注字段
    const rows = (data.rows || []).map(r => ({
      ...r,
      _MARKET_CN: MARKET_MAP[r.UNDERLYION_SECURITY_ID] || "其他",
      _FLAG_CN: FLAG_MAP[r.SUBSTITUTION_FLAG] || r.SUBSTITUTION_FLAG || ""
    }));

    fullPackage = {
      fundCode: code,
      etfName: fullPackage ? fullPackage.etfName : "",
      fetchedAt: new Date().toISOString().slice(0, 10),
      components: rows
    };
    allData = rows;
    document.getElementById("searchBox").value = "";
    renderAll();
  } catch (e) {
    alert("❌ 刷新失败: " + e.message);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = "🔄 刷新"; }
  }
}

/* ---------- 空状态 ---------- */
function showEmpty(msg) {
  document.getElementById("app").innerHTML = \`
    <div class="empty-state">
      <div style="font-size:48px;margin-bottom:12px;">📭</div>
      <p>\${msg}</p>
    </div>\`;
}

/* ---------- 导出 CSV ---------- */
function exportData() {
  if (!allData || !allData.length) return alert("❌ 没有可导出的数据");

  const pkg = fullPackage || {};
  const fundCode = pkg.fundCode || "ETF";
  const etfName = pkg.etfName || "";
  const fetchedAt = pkg.fetchedAt || "";

  // 列头
  const headers = ["代码", "名称", "数量", "占比", "替代金额(元)", "市场", "替代标志"];
  // 字段映射
  const fields = ["INSTRUMENT_ID", "INSTRUMENT_NAME", "QUANTITY", "_PCT",
                   "SUBSTITUTION_CASH_AMOUNT", "_MARKET_CN", "_FLAG_CN"];

  const esc = v => {
    const s = (v || "").toString().trim();
    return /[,"\\n]/.test(s) ? \`"\${s.replace(/"/g, '""')}"\` : s;
  };

  // 元数据头（加 # 号可被Excel/Sheets忽略）
  const meta = [
    \`# ETF: \${fundCode} \${etfName}  |  \${fetchedAt}\`,
    \`# 成分股数: \${allData.length}\`,
    ""
  ];

  // 计算总替代金额，用于占比
  const totalAmt = allData.reduce((s, d) => s + parseNum(d.SUBSTITUTION_CASH_AMOUNT), 0);

  const rows = allData.map(row => {
    const pct = totalAmt > 0 ? (parseNum(row.SUBSTITUTION_CASH_AMOUNT) / totalAmt * 100).toFixed(2) + "%" : "0.00%";
    return fields.map(f => {
      if (f === "_PCT") return esc(pct);
      return esc(row[f]);
    }).join(",");
  });

  const csv = meta.join("\\n") + headers.join(",") + "\\n" + rows.join("\\n");

  // 下载
  const bom = "\\uFEFF";
  const blob = new Blob([bom + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = \`\${fundCode}_\${fetchedAt || "data"}.csv\`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/* ---------- 工具函数 ---------- */
function parseNum(v) {
  if (!v) return 0;
  const s = v.toString().replace(/,/g, "").trim();
  return parseFloat(s) || 0;
}

function fmtNum(v) {
  if (!v) return "0";
  const n = parseNum(v);
  return n.toLocaleString("zh-CN");
}

function fmtMoney(v) {
  if (!v) return "-";
  const s = v.toString().trim();
  if (!s) return "-";
  return parseFloat(s).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function escapeHtml(s) {
  if (!s) return "";
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}`
  }
};

// ====== 路由处理 ======

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname;

    // 路由：API 代理
    if (path === "/api/query") {
      return handleApiQuery(url);
    }

    // 路由：静态文件
    const file = STATIC_FILES[path] || STATIC_FILES["/"];
    return new Response(file.body, {
      headers: {
        "Content-Type": file.contentType,
        "Cache-Control": "public, max-age=3600"
      }
    });
  }
};

// ====== API 处理 ======

async function handleApiQuery(url) {
  const fundCode = url.searchParams.get("code") || "513310";

  const params = new URLSearchParams({
    sqlId: "COMMON_SSE_CP_JJLB_ETFJJGK_GGSGSHQD_COMPONENT_C",
    FUNDID2: fundCode,
    jsonCallBack: "cb",
    isPagination: "false",
    "pageHelp.pageSize": "500",
  });
  const apiUrl = \`https://query.sse.com.cn/commonQuery.do?\${params}\`;

  try {
    const resp = await fetch(apiUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Referer: "https://etf.sse.com.cn/",
      },
    });

    const text = await resp.text();
    let jsonStr = text;
    if (text.startsWith("cb(") && text.endsWith(")")) {
      jsonStr = text.slice(3, -1);
    }
    const data = JSON.parse(jsonStr);
    const rows = data.result || [];

    return new Response(
      JSON.stringify({ ok: true, rows, count: rows.length }),
      {
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "no-cache",
        },
      },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ ok: false, error: err.message }),
      {
        status: 502,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Access-Control-Allow-Origin": "*",
        },
      },
    );
  }
}
