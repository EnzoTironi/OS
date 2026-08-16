# Evidence — what Chinese firms run, and what they say they will run

**Kind:** domain evidence / source artifact  
**Decision state:** observation unless a card says otherwise  
**Date:** 2026-08-16

Vendor accuracy numbers, customer counts, and “99%” claims stay labeled as vendor-claimed. State targets are plans, not installed base.

## The stack that public sources actually describe

Chinese large-enterprise software in 2026 is not one product. It is four layers that different vendors own. Fast models sit on top. They do not replace the lower two.

```text
Agent / digital human / chat / CLI / desktop buddy
        |
Skills, MCP, function call, token budget, sandbox
        |
Ontology / world model / org graph / role permissions
        |
System of record
  BIP / Kingdee / SAP / U9
  MES / MOM / DCS / SCADA
  DingTalk / WeCom / Feishu directory
        |
Plant, bank, tax, carrier
```

Every serious Chinese vendor in this pass independently restates the same cut. The model may plan. Commit still goes through a named capability, inherited permission, and an audit row. That is the product they are selling to SOEs and listed manufacturers, not “DeepSeek is the ERP.”

## Layer 1 — system of record is still ERP plus plant software

Yonyou still ships YonBIP for large firms, YonSuite for growth firms, Chanjet for small firms, U9 Cloud for manufacturing ERP, plus iuap as the platform ([product nav on yonyou.com/news/4813](https://www.yonyou.com/news/4813)). Kingdee still sells cloud ERP and says Lingee is an AI OS **on top of** that ERP, not a replacement ([kingdee.com article, 2026-06-23](https://www.kingdee.com/resources/articles/1519374747954812097)).

21st Century Business Herald, citing company filings and IDC, says Chinese large-enterprise informatization is mature and ERP is a stock fight. Yonyou 2025 revenue ¥91.82亿, almost flat, still loss-making. Kingdee 2025 revenue ¥70.06亿, first annual profit after the cloud shift. Yonyou AI signed ¥16.7亿 in 2025, with revenue recognition pushed to 2026–2027. Agent projects take 6–12 months, over 18 on hard scenes. IDC’s “AI-enhanced ERP” slice in China is $315.7M for 2025, +96.1%, and that slice **excludes** the base ERP fee ([21jingji, 2026-06-12](https://www.21jingji.com/article/20260612/herald/ba452da2b52a8607fd8eb6698a6f810a.html)).

Read that the other way. The installed record system is still BIP / Kingdee / SAP. AI is an attach, expensive to deliver, not yet a P&L engine. SAP’s China peak claim in the same piece is 224 agents and 51 assistants. That is agent count on an old kernel, not a new kernel.

Wang Wenjing’s public line is the incumbent defense in one sentence. AI will not kill software. The preferred shape is dual-mode: process-execution software plus intelligent-decision software on one digital base ([yonyou.com/news/4795](https://www.yonyou.com/news/4795.html)).

## Layer 2 — collaboration products are being turned into agent runtimes

This is where Chinese consumer-internet companies spend the most visible money.

DingTalk’s official Wukong post (2026-03-17) says the GUI was rewritten as CLI so an agent can call “thousands” of capabilities without clicking. Chen Hang’s line: past, people used DingTalk to work; future, AI uses DingTalk to work. Wukong inherits the org’s accounts and permissions, runs in a sandbox, and meters tokens like a budget. Alibaba folded Tongyi and Wukong into Alibaba Token Hub. Taobao / Tmall / 1688 / Alipay / Aliyun B-side capabilities are promised as Skills. OPT packs are pre-wired “one person team” workflows for ecommerce, manufacturing, tax, legal ([DingTalk Global](https://www.dingtalk-global.com/zh/news/activity/dingtalk-cli-ai-agent-support-260319)).

Tencent’s official WorkBuddy Enterprise page (updated 2026-08-03) splits the problem the same way. WorkBuddy is the desktop agent that finishes a task. Managed Agents is the production runtime: unified identity, isolated sandbox, full-chain trace, evaluation, COW fork, scale on TKE. Hunyuan is default. DeepSeek is an allowed model ([cloud.tencent.com](https://cloud.tencent.com/document/product/1831/134329)). WeCom remains the C2B pipe. China Daily’s WAIC piece adds a WeCom-native agent (大圆) that lives in the chat swipe ([chinadaily.com.cn](https://cn.chinadaily.com.cn/a/202607/18/WS6a5b51c5a310d709c2fbe45d.html)).

ByteDance, per 观察者网 (secondary), put Feishu product under Doubao and is beta-testing Doubao enterprise edition inside Feishu customers. Feishu’s value in that telling is the org graph, docs, and permissions, not the chat UI ([guancha.cn](https://www.guancha.cn/economy/2026_07_30_825543.shtml)).

The UX bet across Ali / Tencent / ByteDance is not a better form. It is “one sentence, then a deliverable,” with the old office suite demoted to context and permission source.

## Layer 3 — Chinese ERP vendors reached for ontology, not for a smarter chatbot

Yonyou’s January 2026 Ontology-Driven Agent is the closest public rhyme with this repo’s thesis. Their own words, not ours:

> 所谓“本体（Ontology）”，是通过形式化方式，系统构建企业核心概念、实体关系、业务规则和决策逻辑，为AI提供一套无歧义的共享词汇和理解框架。

They contrast three modes. Ordinary LLM “guesses.” RAG “finds.” The ontology agent “understands the business” and executes. They publish an L2–L5 ladder from diagnosis to limited autonomy to full autonomy. They cite a Yonyou AI Lab ChinaXiv paper on Large Ontology Models ([yonyou.com/news/4813](https://www.yonyou.com/news/4813), [chinaxiv 202601.00187](https://chinaxiv.org/abs/202601.00187)). The “99% accuracy” sentence on that page is vendor marketing. Do not treat it as a measured invariant.

YonClaw (2026-04-28) is the execution skin. Two task models on purpose: open-ended goals **and** strict end-to-end workflows. Dual authorization: only do what was authorized, only when approved. Audit fields they list: who started, which identity, which data, which tools, which actions, whether intercepted, who confirmed. Skills are installable, reusable, governed. The agent is allowed to sit on public cloud, dedicated cloud, on-prem, or an appliance, and to call non-Yonyou systems ([yonyou.com/news/4948](https://www.yonyou.com/news/4948)).

Kingdee Lingee is the more conservative twin. Chat for query. Work for agents that close reimbursement, four-way match, month-end, intercompany recon. Build for making more agents. Permissions inherited from org/role. Customer data not used for training. Actions auditable. MCP/API to third parties. Scenes named are finance and supply exceptions, not a new manufacturing ontology ([kingdee.com](https://www.kingdee.com/resources/articles/1519374747954812097)).

Implication for OS, as hypothesis only. The largest Chinese ERP vendors are telling buyers the same story we tell ourselves. Generation is cheap. The scarce object is a shared, executable business vocabulary plus a refuse path. They are bolting that vocabulary onto BIP / Kingdee objects. We have not shown their object model is deep enough, and we have not shown ours is better. We have shown the market pitch.

## Layer 4 — industry is building world models and mechanism models, not chat ERPs

The State Council opinion (国发〔2025〕11号) tells qualified firms to put AI into strategy, org, and process, and to grow “智能原生” enterprises whose architecture assumes AI. Industrial clause: design, pilot, production, service, operations, plus industrial internet for perception and decision-execution. Work clause: new org forms, `智能代理`, human-machine teams, especially in labor-scarce and high-risk jobs. Penetration target: new terminals and agents over 70% by 2027, over 90% by 2030 ([MEE host of the opinion](https://www.mee.gov.cn/zcwj/gwywj/202508/t20250827_1126207.shtml)).

The eight-ministry manufacturing action (工信部联科〔2025〕279号) is more concrete. By 2027: 3–5 general models used deeply in manufacturing, full-coverage industry models, **1000 high-level industrial agents**, 100 industrial datasets, 500 typical scenes, 1000 benchmark firms. It asks for agent task planning, swarm coordination, fusion of industrial mechanism with agent decision models, agent-to-industrial-system adapters, open agent protocols, agent stores, and a classification / identity / registration regime. It also tells firms to cut hallucination risk with knowledge-base cleanup, corpus correction, and labeling of synthetic content. The application guide in the same document tells a manufacturer to keep MES / DCS / SCADA, add sensors and edge, build mechanism / simulation / experience libraries, then pick models. It does not say “replace the plant system with a chatbot” ([nda.gov.cn full text](https://www.nda.gov.cn/sjj/zwgk/zcfb/0112/20260107214358696030895_pc.html)).

Huawei Cloud’s industrial agent product is a workbench for process optimization, predictive maintenance, and visual QC, aimed at non-AI process engineers, with cloud-edge deploy and a named Shandong Energy / Pangu mine case ([huaweicloud.com](https://www.huaweicloud.com/product/ei_industrial.html)). That is a specialized physical evaluator with a model in the loop. It is not YonBIP.

Haier’s COSMOPlat, via Xinhua at WAIC 2026, published an “industrial world model”: ontology graph, live data, physical mechanism, digital twin, multi-agent. UX is a digital human per role (CEO, plant manager, energy chief) commanding agent clusters. Products: COSMO-Sphere (strategy), COSMO-iMOM (factory), COSMO-iEMS (energy). Claimed stock: 4700 mechanism models, 160k firms enabled, 20 lighthouse factories. A zero-code path (天驭) is said to turn a natural-language production task into simulated, then dispatched, line code ([news.cn](https://www.news.cn/tech/20260718/8335740fe2e2477cbbf261009889922a/c.html)). Those counts are COSMOPlat’s, carried by a state wire. Treat them as claimed installed narrative, not as an audit.

The industrial pattern, if the claims are even half true, is two-speed intelligence. Mechanism models and DCS stay. Agents plan changeover, maintenance, energy, and quality. The “collar” is physics and the existing control loop. The upside is a new plan the process engineer did not type.

## DeepSeek-V4-Flash and the 800 TPS number

What official pages state:

- Flash is the cheap, small-activation V4 (284B total, 13B active on Aliyun’s card). 1M context. Function calling. Thinking and non-thinking. DeepSeek tells agent users to use thinking at `max` for hard work, and says Flash matches Pro on easy agent tasks and lags on hard ones ([DeepSeek news](https://api-docs.deepseek.com/zh-cn/news/news260424)).
- Aliyun Beijing list price is ¥1 / ¥2 per million input/output tokens, cache hit ¥0.2. Account cap 1.2M TPM. That is **aggregate** quota, about 20k tokens/s if fully used, not a promised single-stream decode rate ([Aliyun help](https://help.aliyun.com/zh/model-studio/deepseek-v4-flash)).
- Public OpenRouter rows for the same model sit mostly in the tens of TPS.
- A GPUStack vendor blog reports 600+ TPS single-stream on 8×H20 for Flash-0731, and ~100 TPS on 8×Ascend 910B ([51CTO](https://blog.51cto.com/gpustack/14828347)).

800 TPS on a dedicated box is consistent with that H20 class of measurement. It is **not** what the public DeepSeek or Aliyun pages promise as a default SLA. It is also not expensive at Aliyun list price. Expense shows up as reserved H20 / premium low-latency endpoints / overseas markup, which matches “available in some places, costly.”

For a firm, 800 TPS changes the **Skill and rehearsal** layer. It does not, in any source opened here, become the inventory ledger.

## What this does to UX, in their words, not ours

| Surface they are shipping | Who it is for | What a human still does |
| --- | --- | --- |
| Lingee Chat / YonClaw Q&A | Manager asking the firm | Accept a number, chase an exception |
| Lingee Work / YonClaw workflow | Finance, AP, close | Confirm the refuse and the irreversible |
| Wukong / WorkBuddy / Doubao | Anyone with a sentence | Inspect the deliverable, not the tokens |
| Digital human (COSMO-Sphere / iMOM) | CEO / plant / energy | Set the target, watch the cluster |
| Huawei IIT workbench | Process engineer | Own the mechanism model and the setpoint |
| Skill / agent store | IT and vendors | Install a capability into the collar |

Nobody in this set is asking a CEO to read 10k tokens/s. They are asking the CEO to live in a digital-human or a question box, and asking IT to meter tokens and permissions. The review object is the Skill, the authorization, and the plant setpoint.

## Cross-reference

- `research/ops/reference-landscape/` watched Western ontology products. It did not open Yonyou, Kingdee, DingTalk, or COSMOPlat.
- `docs/thesis.md` “AGI changes the optimization target” and “one model, many surfaces” rhyme with Wang’s dual-mode and DingTalk’s CLI rewrite. Rhyme is not proof.
- Wave A kill on “existing platform as MIT core” still applies. BIP-plus-YonClaw is an incumbent attaching an agent. It is not evidence that we should adopt BIP.
