<h1 align="center">Octozine</h1>

<p align="center">
  <em>Octozine：Fork your own GitHub curator.</em>
  <br>
  不是又一份 Trending 榜单 — Fork 一下,拥有你自己的 GitHub 项目雷达。
</p>

<p align="center">
  <a href="./README.md">中文</a> · <a href="./README_EN.md">English</a>
</p>

<p align="center">
  <a href="https://autumn1337.github.io/octozine/">
    <img src="https://raw.githubusercontent.com/Autumn1337/octozine/main/docs/images/banner.png" width="720" alt="Octozine — a folio of GitHub, curated weekly">
  </a>
</p>

<p align="center">
  <a href="https://github.com/Autumn1337/octozine/actions"><img src="https://img.shields.io/badge/tests-passing-brightgreen?style=flat-square" alt="tests"></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" alt="license"></a>
  <a href="https://autumn1337.github.io/octozine/"><img src="https://img.shields.io/badge/demo-live-success?style=flat-square" alt="demo"></a>
</p>

<p align="center">
  <a href="https://autumn1337.github.io/octozine/">Live demo</a>
  ·
  <a href="#5-分钟跑起来">5 分钟跑起来</a>
  ·
  <a href="./docs/setup.md">Setup</a>
  ·
  <a href="./docs/design.md">Design</a>
</p>

---

## 它解决什么问题

GitHub Trending 告诉你大家在看什么。
Octozine 告诉你**哪些值得你看,以及为什么**。

它不是通用 newsletter,也不是人工周刊。
它是一个可以 fork 的**个人 GitHub discovery pipeline**。

每周一,你 fork 的仓库里跑一次 GitHub Action,自动产出一份只属于你的 zine。

---

## 它怎么工作

```text
Your GitHub signals
profile · owned repos · activity · stars · README excerpts
        ↓
Discovery sources
Trending · Search · HN · Events
        ↓
LLM curator
rank · explain · summarize
        ↓
Your weekly zine
GitHub Pages · RSS · Telegram · Email
```

每期从 ~150 个候选里精选 **默认 8 个**项目(可在 `config.yaml` 调 `top_n`)。
每个项目带:

- 中英双语摘要
- 中文一句"为什么推它"
- 命中你 profile 的 theme / language
- 来源信号(Trending + HN 等)

---

## 每个人看到的都不一样

同一批候选项目,不同 profile 会得到完全不同的周刊:

| Profile | 更容易推荐 |
|---|---|
| AI infra engineer | inference engine · eval · vector DB · agent runtime |
| Frontend tool author | build tools · UI libraries · DX · design systems |
| Rust / CLI hacker | terminal UI · systems tools · performance libraries |
| 独立开发者 | 微 SaaS 工具 · 单文件 / minimalist 项目 · 自部署组件 |

Octozine 的重点不是复述热门榜单,
而是**把公共趋势过滤成私人推荐**。

---

## 5 分钟跑起来

需要准备:

- GitHub 账号
- 一个 OpenAI 兼容协议的 LLM API key([DeepSeek](https://platform.deepseek.com) 推荐 — 国内可直连 + 按周自动跑一年成本 < ¥5)
- **强烈推荐**:一个 GitHub Personal Access Token,作为 `GH_TOKEN` secret —— 避免 GitHub API 匿名 60 req/h 速率限制(连续两次 run 就撞墙)

下面步骤都在 GitHub 网页完成,不需要 clone 到本地。

### 1. Fork

点 [Fork this repo](https://github.com/Autumn1337/octozine/fork)。
之后所有操作都在你的 fork 里。

### 2. 改两行配置

打开 `config/config.yaml`,点右上角铅笔编辑:

```yaml
github_username: yourname
llm:
  provider: deepseek
```

把 `yourname` 换成你的 GitHub username,`provider` 换成你拿到 key 的那家。
页面底部 **Commit changes** 直接到 main。

### 3. 添加 secrets

进入你的 fork:`Settings → Secrets and variables → Actions → New repository secret`,加:

- **`LLM_API_KEY`** — 你的 LLM key
- **`GH_TOKEN`** (强烈推荐) — 任意 GitHub Personal Access Token([github.com/settings/tokens](https://github.com/settings/tokens),classic 即可,不勾任何 scope)

### 4. 启用 GitHub Pages

`Settings → Pages` → **Source** 选 **GitHub Actions**。

> ⚠️ 不要选 "Deploy from a branch",否则站点会 404 或样式异常。

### 5. 手动跑一次

`Actions → Octozine Daily → Run workflow`。

3-5 分钟后,你会看到:

- main 分支多一个 commit:`data: issue 2026-WXX [skip ci]`
- 站点 live 在 `https://yourname.github.io/octozine/`
- 之后默认每周一 09:00 UTC 自动运行(改频率见 [docs/setup.md](./docs/setup.md))

挂了见下方 [常见问题](#常见问题)。

---

## 个性化画像

第一次运行时,Octozine 自动生成 `config/profile.yaml` 并 commit 回 main。
这是一个 v2 profile,可手编:

```yaml
version: 2
core_themes:
  - name: LLM tooling and inference engines
    weight: 0.92
    confidence: high
    evidence:
      - source: owned_repo
        repo: yourname/inference-bench
        note: Owned repo about local inference benchmarking.
languages:
  - name: rust
    weight: 0.86
    evidence_count: 14
exclude_themes:
  - name: blockchain / web3
    confidence: medium
    reason: Explicitly excluded or rarely appears in strong signals.
```

完整结构见 [config/profile.yaml.example](./config/profile.yaml.example)。

想明确告诉它你的偏好,可以在 `config/config.yaml` 加 hint:

```yaml
profile:
  regenerate: false
  include: [rust cli, local inference]
  exclude: [crypto, marketing automation]
```

想重建画像 → 把 `regenerate` 改成 `true`,下次运行后会自动翻回 `false`。

---

## LLM Provider

```yaml
llm:
  provider: deepseek
  # model: deepseek-v4-pro    # 可选;config.yaml 里每家都有现成的注释例子
```

**推荐默认**:DeepSeek `deepseek-v4-flash` — 性价比高 + 国内可直连 + 一年成本 < ¥5

**兼容**:OpenAI · Qwen · Moonshot · Zhipu · Groq · Ollama · 任意 OpenAI 兼容 endpoint(`provider: custom`)

完整 model 列表 + 各家成本估算 → [docs/setup.md → Built-in providers](./docs/setup.md#built-in-providers)

---

## 订阅你的周刊

默认发布到 **GitHub Pages**,并自动生成 **RSS feed**:

```text
https://yourname.github.io/octozine/feed.xml
```

把这个 URL 丢进 Reeder / Feedly / Inoreader / NetNewsWire / 任何 RSS 阅读器,
就能在你常用的地方收到每周更新。
**这是默认推荐的订阅方式 —— 零额外配置,跟着 5 分钟流程走完就有了。**

### 进阶玩法:Telegram / Email 推送(可选)

如果你想让每期直接 push 到 Telegram 或邮箱:

- **Telegram bot** — 需要 BotFather 拿 token + 1 个 secret
- **Email (SMTP)** — 推荐 [Resend](https://resend.com)(免费 100/天)或 Gmail App Password

完整步骤见 [docs/setup.md → 推送渠道](./docs/setup.md#optional-push-channels-telegram--email--rss)。

> 推送在 Pages 部署**之后**作为独立 Action step 跑,挂了不影响站点发布。
> 先用默认 RSS,以后想玩再加 Telegram/Email 完全没问题。

---

## 适合谁 / 不适合谁

**适合**:

- 经常刷 GitHub Trending,但觉得噪音太多
- 想维护个人技术周刊,但不想手工筛项目
- 开源作者、技术博主、独立开发者、AI / infra / devtool 工程师
- 想要一个**不依赖 SaaS** 的个人 discovery pipeline

**不适合**:

- 想要实时新闻流(Octozine 是周报,不是 timeline)
- 想要人工编辑质量的深度评论
- 不愿意配置 LLM API key
- GitHub 公开活动极少,无法生成有效 profile

---

## 和现成工具有什么不同

| 类型 | 代表 | 适合什么 | Octozine 的位置 |
|---|---|---|---|
| 公共榜单 | GitHub Trending · OSSInsight · Trendshift | 看全局热度 | 把全局趋势**过滤成个人推荐** |
| 开发者资讯流 | daily.dev · Folo | 持续消费技术内容 | 不做信息流,**只生成周期性 zine** |
| 人工周刊 | GitHubDaily · 各类开源周刊 | 看编辑精选 | **自动运行 + 可 fork + 可个性化** |
| AI radar | Horizon · 类似聚合器 | 多源资讯监控 | **聚焦 GitHub 项目发现** |

Octozine 不试图替代这些工具。
它更像一个**可自部署的个人 GitHub curator**。

---

## 常见问题

**第一次运行失败,日志里有 `no usable GitHub signals`**

`github_username` 可能还是 `yourname`,或这个账号没有可读的 public repos / starred / activity。

**`LLM HTTP 401`**

`LLM_API_KEY` 没设,或 key 不属于当前 `provider` 那家。

**`only 1/3 fetchers survived`**

通常是临时网络或 GitHub API rate limit。
加 `GH_TOKEN` secret 把匿名 60 req/h 提到 5000 req/h。

**Actions 成功,但页面 404 / 没样式**

GitHub Pages 的 Source 没选 **GitHub Actions**。

更多排错见 [docs/setup.md](./docs/setup.md)。

---

## 跟进上游更新

GitHub fork **不会自动同步上游**。
我修 bug / 加新 feature 后,你的 fork 还停留在 fork 时的版本,需要主动 sync。

### 一键 sync

去你 fork 主页 → 上方 **Sync fork** → **Update branch**。
如果你只改过 `config/config.yaml` 的 `github_username` + `provider`,而上游没动 config(纯代码 / 文档更新),GitHub 会自动 merge,一键搞定。

### 有冲突怎么办

最常见的:你改了 `config/config.yaml`,而我恰好也调了里面某个默认值。
GitHub 会标 "Conflicts must be resolved",**Sync fork** 按钮 disable。

最简单解法 —— 本地命令行:

```bash
git clone https://github.com/yourname/octozine && cd octozine
git remote add upstream https://github.com/Autumn1337/octozine
git fetch upstream
git merge upstream/main
# 编辑 config/config.yaml 解决冲突,保留你的 username + provider,合上游的新字段
git add config/config.yaml && git commit
git push
```

### 不想总 sync 也 OK

你 fork 当时的代码会一直工作。
重大改动我会通过 [GitHub Releases](https://github.com/Autumn1337/octozine/releases) 标 tag —— [Watch](https://github.com/Autumn1337/octozine) repo 选 "Releases only" 就能在 critical fix 时收到通知。

---

## 开发

```bash
npm install
npm test
npm run typecheck
```

运行完整 pipeline 需要 `LLM_API_KEY`:

```bash
LLM_API_KEY=sk-... npm run pipeline
```

更多:

- [docs/setup.md](./docs/setup.md)
- [docs/design.md](./docs/design.md)
- [README_EN.md](./README_EN.md)

## License

MIT
