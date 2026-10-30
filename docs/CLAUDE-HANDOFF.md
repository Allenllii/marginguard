# MarginGuard 完整交接给 Claude Code

用户希望把本项目的目标、要求、背景、结果期待和后续工作完整交给 Claude Code，并继续推进。开始前先执行 `git status`、`git rev-parse HEAD`、核对远端 main，读取本文、`SPEC.md`、`ARCHITECTURE.md`、`DEVELOPMENT.md`、`FINAL-BENCHMARK.md`、`DEPLOYMENT.md`、`SOURCE-CONSOLIDATION.md` 和 `RELEASE.md`。文档中的历史记录不可当成当前已验证状态。

## 目标、截止和结果期待

比赛是 Nebius x NVIDIA Global AI Hackathon，主要争取 **Best Use of Tavily，$3,000 赞助奖**；也必须满足 NVIDIA/Nebius 的实际技术使用要求。Technical Implementation、Product Design、Potential Impact、Quality of the Idea 四项等权，各 25 分。用户要求独立全项目审核争取 **90/100**，此前审核为 **82/100**。这些是内部目标和历史评估，不是官方分数、获奖概率或承诺。

正式截止为 **2026-10-30 13:00 America/Toronto（17:00 UTC）**。内部 10 月 29 日 22:00 Toronto 目标已错过，不等于比赛延期。开始时核对当前时间和[官方规则](https://nebiusglobalaihackathon.devpost.com/rules)，不能回填完成记录。需要符合规则的英文说明、开源代码、真实技术使用、免费评审访问、YouTube 视频和 Devpost 最终参赛材料。按规则维护免费评审访问至 2026-12-15，冻结并记录提交源码、部署、视频与数据版本，避免自动更新已提交作品。

## 产品主线

为美国小型电商经营者分析订单 CSV 的毛利异常：显示精确源行和美分计算，区分商家假设，检索适用政策，给出具体、可证伪的下一步检查，不声称已经证明根因或实现真实节省。

主评审路径是折扣政策例外：原本“检查折扣叠加设置”的建议，在适用 manual/POS/draft-order 或 app/script 证据下改为检查原始人工覆盖或应用脚本。未知来源、地区不匹配、政策版本变化、证据不适用/冲突时必须 HOLD 或 abstain。Tavily 必须改变行动或适用性，不只是显示链接。

金额与资格结论由确定性代码负责；模型只能提供有来源的辅助草稿，不能升级 HOLD 或修改金额。模拟需显式确认且标为 synthetic/simulation。没有真实店铺连接，不应执行退款、折扣变更或 checkout。

## 源码和状态

公开仓库：<https://github.com/Allenllii/marginguard>。本次归并从 `d2b9ce76f5288b3ac77d8e436f259ea1bc2de96e` 开始，已包含原本未发布的政策人工审阅 dossier 增强，以及 `docs/ci/verify.yml` 离线 CI 源码模板（未启用）。准确当前源码身份以 clone 后 HEAD 为准。旧本地 `be2f9f6c4e3d93c0f49a4473d1967aea81d43a2a` 的七文件代码已隔离导入，不能将原候选计数直接当新 main 的运行证明。

公开站点：<https://marginguard-evidence.liwenzhao0306.chatgpt.site/>，交接记录为 version6，强制 fixture，无托管 provider 凭据。曾真实完成本地 Tavily Search → Extract → NVIDIA → 用户显式确认 → `-600 cents` 合成模拟；这不证明托管 live、真实商户资格、真实 checkout 或收益。

先前 main 本地记录为 316 单元/API、Node/Worker 各 72 浏览器场景；原 dossier 本地候选记录为 323 单元/API、65 框架测试、Node/Worker 各 76 浏览器场景。必须核对本次整合的实际重新运行结果。旧 README 264/57、RELEASE v5/209/43 等属于不同历史快照，不能混加。

独立审核的主要缺口包括模型只确认 lexer、Tavily 依赖固定 URL/精确 hash、缺真实商户验证。dossier 只给人工审阅段落、指纹及范围；未知版本仍 HOLD，不能声称自动政策泛化。本次重新运行结果为 323 单元/API、65 框架、Node/Worker 各 76 浏览器、13 强制离线路由全部通过，详见 SOURCE-CONSOLIDATION。GitHub Actions 尚未启用，现有 OAuth 授权缺少 `workflow` scope；不得将这些本地测试称为 CI 通过。最终 benchmark **NOT RUN**。Devpost **仍为草稿，未正式提交**。

## 开发协作要求

低耦合、高内聚，多 agent 按明确文件边界并行。每项任务记录负责人、基线、目标、允许文件、验收与 reviewer；一个文件只能有一个活动写入者。共享类型、锁文件、API 和整合串行协调。Node 与 Worker 共用业务实现；UI 不另写财务和资格算法。

每个可审查步骤 commit。用户后来允许 **PR 实际通过检查后直接 merge**，优先于旧 DEVELOPMENT 中不自动合并的早期偏好；仍需核对 diff、远端 head、完整测试和 reviewer。不要盲目 `git add .`、force push、reset/clean 或覆盖旧目录。旧本地文件和提交保留在用户电脑，不把旧候选整体合并到 main。

正常顺序：完成产品与真实接入部署 → 独立审核 → 修复/复审 → 冻结候选 → 科学 benchmark → 最后视频和参赛材料。用户后来允许视频/benchmark 暂缓，但仍要求正式截止前完成符合要求的 YouTube 视频及 Devpost 提交。按真实剩余时间安排关键路径，未完成门槛要诚实报告。

建议先核对源码/时间并复现离线检查；按模块拆分剩余产品与真实接入问题；由未参与实现的人按四项各 25 分独立审查；修复高优先级缺陷；准备具体可审阅的部署、视频、benchmark 和提交材料。不得虚构 live、CI、实验成绩或已提交状态。

## 本机复现

Node.js 24.19+；从公开 lockfile 安装依赖，先禁用 lifecycle scripts。离线普通检查：

```powershell
npm ci --ignore-scripts --registry=https://registry.npmjs.org
npm run check
npm run build:offline-demo
```

浏览器另启 `npm run start:qa`，运行 `npm run test:ui`；按现有配置分别验证 Node/Worker。`npm run benchmark:test` 只是离线框架测试。保存实际命令、版本、计数与失败。

`dev`/`start` 和部分 `verify:*`、`evaluate:live` 会加载环境或触发真实 provider，不是普通离线检查。不要为交接读取或复制 `.env`/`.env.local`。本 fresh clone 不含用户凭据；公开 `.env.example` 只是模板。不得为方便验证而自动配置密钥或购买服务。

## 最终 benchmark 的科学要求

完整遵守 FINAL-BENCHMARK 和 SPEC section 9。24 独立候选案例仍需一致性检查、冻结与真人复核。开发 fixture 不可冒充 held-out。A 为确定性保守参考；B/C 用相同模型、任务、schema、参数和解析规则，只改变冻结来源包。每案例每模型臂两次独立重复，不能互相传递答案/失败反馈。

协议上限为 96 completion 和最多 24 search，共 120 HTTP attempts；这是框架计划，不是此次花费授权。独立样本是 24 个案例，不能因重复写成 48。预注册成对与案例聚类分析，保留错误、无效、缺失、预算耗尽、停止、未知成本与完整分母，不做隐藏 retry/repair/选优或清空账本。

调用前冻结具体 plan/runner/source 哈希，取得明确费用、token、HTTP/provider 上限和凭据使用授权；不得替用户生成批准或开启执行 gate。先持久化 reservation 再 dispatch。两位独立真人盲审，分歧由第三人裁决，锁定结果后揭盲；不保证 treatment blinding。私有 gold、seed、arm mapping、原始检索和详细 review 不给模型或公开。

## 数据和授权边界

用户本次授权整理、验证、公开项目开发源码、测试、文档并 fresh clone。该授权不扩展到新真实证据、客户数据、账号配置或最终参赛动作。

**7 个真实成功的脱敏证据文件仍等待用户单独确认公开。** 它们和请求 ID 等元数据不得擅自传给 Claude、其他模型、GitHub 或其他服务。此前已公开历史证据可按公开来源引用，但不推定新材料也获批。

不读取/复制/上传密码、API key、令牌、cookie、认证头、环境配置、真实订单/客户资料或私有 benchmark gold；不无差别扫描旧任务根目录，不输出完整环境或原始日志，截图避开敏感信息。不得未经授权发布新真实证据、视频、最终 Devpost 参赛提交、购买、创建/配置密钥或改变云权限。

工具拒绝、登录或审批阻塞时，记录动作、目标、原因、已完成项和 denied/pending/uncertain；不要绕过，继续不依赖该动作的工作。请先回复已读到的目标、版本、边界与下一步任务分工，再推进。
