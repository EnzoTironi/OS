# Sources — China enterprise AI, 2026-08-16

Primary pages were opened. Secondary journalism is marked. Link text is English. The pages themselves are often Chinese.

## State

- State Council Document 2025-11, *Opinions on deepening the AI-plus action*, hosted at [mee.gov.cn](https://www.mee.gov.cn/zcwj/gwywj/202508/t20250827_1126207.shtml). Targets for 2027 / 2030 / 2035. “AI-native enterprises.” Industrial full-element intelligence. New work forms (intelligent agents).
- Eight ministries, MIIT joint document 2025-279, *AI-plus manufacturing special action*, [gov.cn notice](https://www.gov.cn/zhengce/zhengceku/202601/content_7054201.htm) and full text at [nda.gov.cn](https://www.nda.gov.cn/sjj/zwgk/zcfb/0112/20260107214358696030895_pc.html). Dated 2025-12-25, posted 2026-01. 2027 targets: 3–5 general models deep in manufacturing, 1000 industrial agents, 100 industrial datasets, 500 scenes, 1000 benchmark firms. Agent stores, identity, classification. Hallucination called out as a safety problem.

## Models and inference

- DeepSeek, *DeepSeek-V4 preview*, [api-docs.deepseek.com](https://api-docs.deepseek.com/zh-cn/news/news260424). V4-Pro / V4-Flash, 1M context, agent post-training, Flash smaller and cheaper. No official single-stream TPS in this post.
- Alibaba Cloud Model Studio, [deepseek-v4-flash](https://help.aliyun.com/zh/model-studio/deepseek-v4-flash). 284B / 13B MoE. Beijing list price CNY 1 / 2 per million tokens in/out. TPM 1,200,000. Function calling and structured output. Flash positioned for high-concurrency light work.
- Tencent Cloud announce [2416](https://cloud.tencent.com/announce/detail/2416). DeepSeek-V4-Flash GA 2026-08-05 on TokenHub / ADP. Agent scores claimed above V4-Pro preview.
- GPUStack blog, [51CTO](https://blog.51cto.com/gpustack/14828347). Vendor-measured H20 single-stream 600+ TPS for V4-Flash-0731. Not a DeepSeek official number.
- OpenRouter, [deepseek/deepseek-v4-flash](https://openrouter.ai/deepseek/deepseek-v4-flash). Public third-party endpoints mostly tens of TPS. Shows the gap between dedicated inference and the public API.

## ERP / enterprise software vendors

- Yonyou, [Ontology-driven: from assisted to autonomous decisions](https://www.yonyou.com/news/4813), 2026-03-17. Ontology-Driven Agent. Formal shared vocabulary. L2–L5 autonomy ladder. ChinaXiv paper *Construct, Align, and Reason: Large Ontology Models for Enterprise Knowledge Management*, [chinaxiv.org/abs/202601.00187](https://chinaxiv.org/abs/202601.00187).
- Yonyou, [YonClaw enterprise super-agent](https://www.yonyou.com/news/4948), 2026-05-07. Dual task model (open goal vs end-to-end workflow). Dual authorization. Full audit chain. Skills marketplace. Connects BIP, U9 Cloud, and foreign systems.
- Yonyou, [Wang Wenjing: AI first, ecosystem together](https://www.yonyou.com/news/4795.html), 2026-03. “AI will not kill software.” Dual-mode: process-execution software plus intelligent-decision software on one base.
- Kingdee, [Enterprise AI is no longer optional](https://www.kingdee.com/resources/articles/1519374747954812097), 2026-06-23. Lingee as AI OS **on top of** existing ERP. Chat / Work / Build. Inherit org/role permissions. Four finance/supply agents. Explicitly not a replacement for ERP.
- 21st Century Business Herald, [Kingdee and Yonyou clash again after 30 years](https://www.21jingji.com/article/20260612/herald/ba452da2b52a8607fd8eb6698a6f810a.html), 2026-06-12. Secondary. 2025 figures: Yonyou revenue CNY 9.182 billion, AI signed CNY 1.67 billion, R&D CNY 2.427 billion; Kingdee revenue CNY 7.006 billion, first annual profit after cloud. AI-enhanced ERP in China $315.7M, +96.1% (IDC, cited). Agent delivery 6–18 months. SAP China peak: 224 agents / 51 assistants claimed.

## Collaboration / agent entry

- DingTalk Global, [DingTalk finishes CLI rewrite for agents](https://www.dingtalk-global.com/zh/news/activity/dingtalk-cli-ai-agent-support-260319), 2026-03-17. Wukong. CLI rewrite so agents call capabilities instead of clicking GUI. Inherit org permissions. Sandbox. Token cost accounting. Alibaba Token Hub. Skills market. OPT “one person team” packs.
- Tencent Cloud, [WorkBuddy Enterprise product overview](https://cloud.tencent.com/document/product/1831/134329), updated 2026-08-03. Hunyuan plus multi-model. CodeBuddy / WorkBuddy / Managed Agents. Managed Agents: identity, sandbox, full-chain trace, COW fork, TKE scale.
- China Daily, [Tencent agents at WAIC](https://cn.chinadaily.com.cn/a/202607/18/WS6a5b51c5a310d709c2fbe45d.html), 2026-07-18. WeCom agent Dayuan. WorkBuddy claimed highest-DAU office agent in China. Secondary on DAU.
- Guancha, [Doubao, Feishu, Volcano Engine org change](https://www.guancha.cn/economy/2026_07_30_825543.shtml), 2026-07-30. Secondary on ByteDance org change. Feishu product under Doubao. Doubao enterprise edition in Feishu-customer beta.

## Industrial internet / manufacturing

- Huawei Cloud, [Industrial Agent IIT](https://www.huaweicloud.com/product/ei_industrial.html). Scene-model workbench for non-AI engineers. Process optimization, predictive maintenance, visual QC. Cloud-edge. Shandong Energy / Pangu mine model named.
- Xinhua, [COSMOPlat at WAIC 2026](https://www.news.cn/tech/20260718/8335740fe2e2477cbbf261009889922a/c.html), 2026-07-18. COSMOPlat industrial world model. Ontology graph + mechanism models + digital twin. Digital-human UX (CEO / plant manager / energy chief). COSMO-Sphere / iMOM / iEMS. Claimed 4700 mechanism models, 160k firms, 20 lighthouse factories. Vendor numbers via state wire.

## Not opened this pass

Internal stacks at Huawei, BYD, CATL, Baowu, State Grid, PetroChina. Kingdee / Yonyou object models. COSMOPlat prospectus financials beyond press. The ChinaXiv LOM paper body.
