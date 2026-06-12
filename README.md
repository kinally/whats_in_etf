# ETF 成分股查看器 — Cloudflare Worker 版

> 🏠 **无需 Python 后端**，部署到 Cloudflare Workers 上运行。
> 适合在公司电脑、平板、手机上直接访问使用。

## 🗺️ 架构

```
你电脑 (本地)   ──粘贴/上传──→   Cloudflare Worker
                                    │
                                    ├─ 静态页面 (内联在 worker.js 中)
                                    └─ /api/query  ─→ 上交所 API (实时数据)
```

## 📋 前置条件

| 项目 | 说明 |
|------|------|
| Cloudflare 账号 | 没有的话去 [dash.cloudflare.com](https://dash.cloudflare.com) 免费注册 |

---

## 🚀 部署步骤

### 方式一：Cloudflare Dashboard（最简单）

1. 浏览器打开 https://dash.cloudflare.com/ → 登录
2. 左侧菜单选 **Workers & Pages**
3. 点 **创建应用程序** → **创建 Worker**
4. 给你的 Worker 取个名字（比如 `sse-etf-viewer`）
5. 把本项目的 `worker.js` **全部内容**复制粘贴到编辑器
6. 点 **保存并部署**
7. 部署完成后，你会得到一个 `https://sse-etf-viewer.xxx.workers.dev` 域名
8. 打开即可使用

### 方式二：Wrangler CLI

```bash
# 在本项目目录下
npm install wrangler --save-dev

# 登录 Cloudflare
npx wrangler login

# 部署
npx wrangler deploy
```

---

## ✅ 验证功能

| 功能 | 怎么测试 | 预期结果 |
|------|---------|---------|
| 初始数据 | 打开页面 | 显示成分股列表 |
| 🔍 搜索 | 在搜索框输入股票代码 | 表格实时过滤 |
| 🏆 前五大权重 | 看页面顶部 | 按替代金额排序显示前 5 |
| 🔄 实时刷新 | 点 **刷新** 按钮 | 等待片刻，数据更新（右上角日期变化） |
| 📥 导出 CSV | 点 **导出 CSV** | 浏览器下载一个 CSV 文件，可用 Excel 打开 |

---

## 📁 文件结构

```
sse_etf_monitor_cf/
├── worker.js                 # 🌐 唯一入口（内联所有静态文件 + API 代理）
├── index.html                # 📄 源文件（已内联到 worker.js）
├── style.css                 # 🎨 样式源文件（已内联到 worker.js）
├── app.js                    # ⚡ 前端逻辑源文件（已内联到 worker.js）
├── data/
│   └── latest.js             # 📦 初始成分股快照（已内联到 worker.js）
└── README.md                 # 📖 本说明文件
```

> 💡 **部署只需要 `worker.js`**。其余源文件保留在项目中便于本地修改和版本管理。
> 修改功能后，记得同步更新 `worker.js` 中的内联内容。

---

## 🔧 后续维护

### 更新初始快照

修改 `worker.js` 中 `STATIC_FILES["/data/latest.js"]` 里的 JSON 数据，然后重新部署。

### 修改基金代码

默认监控 `513310`（中韩半导体ETF）。如需更改：
1. 修改 `worker.js` 中 `handleApiQuery` 函数里的默认值
2. 修改 `data/latest.js` 里的 `fundCode` 字段
3. 重新部署

### 本地预览

```bash
# 安装 Wrangler
npm install wrangler --save-dev

# 本地预览（需要 Node.js）
npx wrangler dev
```

---

## ❓ 常见问题

**Q: 点刷新后等很久才出数据？**
A: CF 免费版有冷启动，第一次请求需要 1–3 秒加载 Worker 运行环境。之后再用就快了。

**Q: 页面空白 / 没有数据？**
A: 按 F12 → Console 检查报错。

**Q: 可以在手机上访问吗？**
A: 可以！部署成功后给你的 `*.workers.dev` 链接在任何浏览器都能打开。
