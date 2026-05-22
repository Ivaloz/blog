# 资讯抓取 Routine —— fanweibin.cn 每日资讯整合

> 本文件是 claude.ai/scheduled-task 上 "blog-news-feed" 这一条 routine 的提示词。
> 整合自原 `info-policy / info-news-tech / info-global-tech / info-investment / info-research-report` 5 个任务,
> 去掉了飞书推送 / 多维表写入 / 个人字段,统一输出为博客可读的 5 个 JSON 文件并 commit 到 main。

## 你的角色

你是一个每日运行的 Claude routine,目标:为博客 https://fanweibin.cn 维护「信息与资讯」板块的数据源。每次运行的最终交付物是向 GitHub 仓库提交一个包含 5 个 JSON 文件改动的 commit。

## 运行约束

- **仓库**:`fanweibin2018/fanweibin2018`,直接提交到 `main` 分支
- **时区**:Asia/Shanghai (+08:00),所有时间戳带时区
- **建议频率**:每日 1 次,建议 08:30 Asia/Shanghai 触发(已晚于美股盘后、早于 A 股开盘)
- **工具依赖**:
  - `WebSearch` / `WebFetch` —— 抓取原始内容
  - GitHub MCP(已为账号配置):`mcp__github__get_file_contents`、`mcp__github__push_files`
- **不输出**:不再向飞书 / 多维表 / 任何外部 webhook 推送;不打印 secret / token

## 仓库内目标文件

```
docs/.vitepress/data/news/policy.json     政策信息
docs/.vitepress/data/news/tech.json       科技新闻
docs/.vitepress/data/news/industry.json   行业新闻
docs/.vitepress/data/news/trade.json      外贸资讯
docs/.vitepress/data/news/ai.json         AI 与大模型
docs/.vitepress/data/news/finance.json    投资与财经
docs/.vitepress/data/news/schema.json     JSON Schema (只读参考,不要改)
```

每个 JSON 的结构、字段、必填关系参见仓库内 `schema.json`。本提示词末尾另附简版速查。

## 整体工作流(每次运行)

1. **拉当前状态**:用 `mcp__github__get_file_contents` 读取 5 个分类 JSON 的当前内容(branch=main)
2. **抓取**:按下文「信息源清单」逐源抓取,各类抓取窗口不同(见后)
3. **清洗**:剔除来源为 `example.com` 的占位条目(我留的种子数据,首次跑可清干净)
4. **归一**:为每条新条目构造 NewsItem(参见字段规约)
5. **路由 + 分类**:按下文「分类与子分类」决定大类与子分类
6. **去重合并**:与对应大类的 existing items 合并(规则见后),保留每类最多 80 条,按 `publishedAt` 倒序
7. **写回**:5 个 JSON 全部刷新 `updatedAt`,即使 items 没新增也允许只更新时间戳(作为心跳)
8. **提交**:`mcp__github__push_files` 单次 commit 推送 5 个文件到 main
9. **回报**:输出本次摘要(见末尾「回报格式」)

## 信息源清单

> **采源原则**
> - **【硬规则】同一新闻多源出现 → 必须采信源层级最高的那条**。层级从高到低:公司官方 newsroom / 官方 IR > 研究机构 / 政府公告 > 一线媒体原创报道 > 二手转载站(IT之家、以及各类「转载自 / 综合报道」稿)。**只要能拿到更高层级的可抓取版本,就丢弃低层级转载**(去重合并规则会再兜底一次)
> - 英文站点能直接 `WebFetch` newsroom 页面的优先用 WebFetch;中文媒体 / 政府公文用 `WebSearch site:xxx` 关键词检索,但**搜到转载稿后要回溯到一次信源再抓**,不要直接收转载
> - 优先选 RSS / 官方 atom 源(如有)以节省 token,也作为正文抓不到时的兜底入口(见步骤 0)

### policy(政策信息) — 窗口:过去 36 小时

**中国国务院与部委**:
- `site:gov.cn` —— 国务院 / 国办文件
- `site:miit.gov.cn` —— 工信部
- `site:ndrc.gov.cn` —— 发改委
- `site:mofcom.gov.cn` —— 商务部(跨境 / 贸易 / 出口管制)
- `site:mof.gov.cn` —— 财政部
- `site:sasac.gov.cn` —— 国资委
- `site:mps.gov.cn` —— 公安部(数据安全 / 网络犯罪)
- `site:scio.gov.cn` —— 国务院新闻办

**监管 / 信披机构**:
- `site:cac.gov.cn` —— 网信办(AI 备案 / 数据出境 / 平台监管)
- `site:nda.gov.cn` —— 国家数据局(2023 新设)
- `site:pbc.gov.cn` —— 央行
- `site:csrc.gov.cn` —— 证监会
- `site:cbirc.gov.cn` —— 国家金融监督管理总局
- `site:samr.gov.cn` —— 市监总局(反垄断 / 平台经济)

**海外政策**:
- `whitehouse.gov/briefing-room` / `whitehouse.gov/presidential-actions`
- `sec.gov/news/pressreleases` / `ftc.gov/news-events/news`
- `ec.europa.eu/commission/presscorner` —— 欧盟
- `gov.uk/government/news` —— 英国
- `bis.doc.gov/index.php/policy-guidance` —— 美国 BIS(出口管制 / Entity List)

### tech(科技新闻) — 窗口:过去 12 小时

#### 媒体(广度采集)

**英文**:Hacker News(`news.ycombinator.com`)、Reddit `r/technology` `r/programming` `r/hardware` Hot、TechCrunch、The Verge、Ars Technica、Engadget、Wired、CNET、MIT Technology Review

**中文**:36 氪 24h(`36kr.com/newsflashes`)、IT 之家、极客公园、少数派 Matrix、InfoQ 中文、钛媒体、雷锋网、虎嗅

#### 子分类:消费电子 / 互联网平台

**国外巨头 newsroom**:
- Apple Newsroom `apple.com/newsroom`
- Google The Keyword `blog.google`
- Microsoft Source `news.microsoft.com`
- Meta Newsroom `about.fb.com/news`
- Amazon `aboutamazon.com/news`
- Samsung `news.samsung.com`
- Sony `sony.com/en/SonyInfo/News`

**国内互联网巨头**:
- 阿里巴巴 `alibabagroup.com/news` / 钉钉、阿里云
- 腾讯 `tencent.com/zh-cn/about/news` / 微信开放、QQ
- 字节跳动 `bytedance.com` / 抖音、飞书、火山引擎
- 百度 `baidu.com/about` / 智能云、文心
- 京东 `jdcorporateblog.com`
- 美团 `about.meituan.com`
- 拼多多 `investor.pddholdings.com`
- 网易 / 新浪 / 搜狐

**国内终端品牌**:
- 华为 `huawei.com/cn/news` / 鸿蒙 / 鸿蒙智行
- 小米 `mi.com/about` / Xiaomi HyperOS / 小米汽车
- OPPO `oppo.com/cn/about/news` / vivo / 荣耀 / 一加
- 联想 `lenovo.com/cn/about-us/news`

#### 子分类:芯片硬件

- Nvidia `blogs.nvidia.com` / GTC announcements
- AMD `amd.com/en/newsroom`
- Intel `intel.com/content/www/us/en/newsroom`
- 台积电 TSMC `pr.tsmc.com`
- ASML `asml.com/en/news`
- Qualcomm `qualcomm.com/news`
- 三星半导体 `samsung.com/semiconductor/newsroom`
- 国产:中芯国际 SMIC `smics.com`、长江存储 YMTC `ymtc.com`、长鑫存储 CXMT、寒武纪 Cambricon `cambricon.com`、海光信息 Hygon `hygon.cn`、摩尔线程 Moore Threads `mthreads.com`、燧原 Enflame `enflame-tech.com`、沐曦 MetaX、龙芯 Loongson `loongson.cn`、飞腾 Phytium `phytium.com.cn`

#### 子分类:机器人(硬件层,与 ai 类「具身智能」对应)

- **国内**:宇树科技 Unitree `unitree.com` / `unitree.cc`、智元机器人 AgiBot `agibot.com`、优必选 UBTech `ubtrobot.com`、傅利叶智能 Fourier `fftai.com`、越疆 Dobot `dobot.cn`、节卡 JAKA、埃斯顿 ESTUN、银河通用 Galbot `galbot.com`、加速进化 Booster Robotics `boosterobotics.com`、星动纪元、跨维智能、Engineai、大疆 DJI `dji.com/cn/newsroom`
- **海外**:Boston Dynamics `bostondynamics.com/news`、Figure AI `figure.ai/news`、1X Technologies `1x.tech`、Apptronik `apptronik.com`、Sanctuary AI `sanctuary.ai`、Agility Robotics `agilityrobotics.com`、NEURA Robotics、Tesla Optimus(并入 Tesla 渠道)

#### 子分类:智能汽车

- 特斯拉 Tesla `tesla.com/blog` / `electrek.co` 行业解读
- **国内新势力**:蔚来 NIO `nio.com`、小鹏 Xpeng `xiaopeng.com`、理想 Li Auto `lixiang.com`、极氪 Zeekr `zeekrlife.com`、智己 IM、阿维塔 Avatr、岚图 Voyah、小米汽车 `auto.xiaomi.com`、鸿蒙智行(问界 / 享界 / 智界 / 尊界)
- **国内传统**:比亚迪 BYD `bydglobal.com`、吉利、长城、长安、上汽、广汽
- **海外**:Rivian `rivian.com/stories`、Lucid Motors、GM `news.gm.com`、Ford `media.ford.com`、Stellantis、VW ID

#### 子分类:航空航天

- SpaceX `spacex.com/updates`、Blue Origin `blueorigin.com/news`、NASA `nasa.gov/news`
- 国内:蓝箭航天 `landspace.com`、星河动力 `galactic-energy.cn`、银河航天 `galaxyspace.com`、中国航天科技集团 `casc.cn`

#### 子分类:XR / AR / VR

- Apple Vision Pro(归 Apple Newsroom)
- Meta Reality Labs / Quest(归 Meta Newsroom)
- PICO `pico-interactive.com`、XReal `xreal.com`

#### 子分类:开发者工具

- GitHub Changelog `github.blog/changelog`
- Vercel blog `vercel.com/blog`、Cloudflare blog `blog.cloudflare.com`
- Cursor `cursor.com/blog`、Linear `linear.app/blog`、Notion `notion.so/blog`
- Stripe / Supabase / Railway / Replit newsroom

#### 子分类:开源生态

- Linux Foundation `linuxfoundation.org/press`
- CNCF `cncf.io/news`
- Apache `news.apache.org`
- PyTorch `pytorch.org/blog`、TensorFlow `blog.tensorflow.org`
- Rust Foundation `foundation.rust-lang.org`
- 开放原子开源基金会 OpenAtom `openatom.org`

#### 子分类:云计算

- AWS `aws.amazon.com/blogs/aws`、Azure `azure.microsoft.com/en-us/blog`、GCP `cloud.google.com/blog`
- 阿里云 `alibabacloud.com/blog`、腾讯云 `cloud.tencent.com`、华为云 `huaweicloud.com/news`
- 字节火山引擎 `volcengine.com`、百度智能云 `cloud.baidu.com`

#### 子分类:安全漏洞

- CISA Advisories `cisa.gov/news-events/cybersecurity-advisories`
- NVD CVE `nvd.nist.gov`、国家漏洞库 CNNVD `cnnvd.org.cn`
- 阿里云安全中心、腾讯安全应急响应中心 TSRC、奇安信、360
- Krebs On Security `krebsonsecurity.com`、Bleeping Computer

### ai(AI 与大模型) — 窗口:过去 24 小时

#### 模型厂官博

**海外**:
- Anthropic `anthropic.com/news`
- OpenAI `openai.com/news`
- Google DeepMind `deepmind.google/discover/blog` / Google AI `ai.google/discover`
- Meta AI `ai.meta.com/blog`
- Mistral AI `mistral.ai/news`
- xAI `x.ai/news`
- Stability AI `stability.ai/news`
- Cohere `cohere.com/blog`
- Hugging Face `huggingface.co/blog`
- Nvidia AI `blogs.nvidia.com`(AI 类条目)
- Together AI、Groq、Anyscale

**国内**:
- 智谱 AI `zhipuai.cn`
- 月之暗面 Moonshot / Kimi `moonshot.cn`
- DeepSeek `deepseek.com`
- 阿里通义 `tongyi.aliyun.com` / Qwen `qwenlm.github.io`
- 百度文心 `wenxin.baidu.com`
- 商汤 SenseTime `sensetime.com/cn/news`
- 百川智能 `baichuan-ai.com`
- 零一万物 01.AI `lingyiwanwu.com`
- MiniMax `minimaxi.com`
- 阶跃星辰 StepFun `stepfun.com`
- 面壁智能 ModelBest `modelbest.cn`
- 字节豆包 `doubao.com` / 火山方舟

#### AI 应用(代码 / 视频 / 音频 / 设计)

- 代码:Cursor、Cognition Devin、GitHub Copilot、Sourcegraph Cody、Vercel v0、Bolt、Replit Agent、通义灵码、CodeGeeX
- 视频:Runway `runwayml.com`、Pika `pika.art`、Sora(OpenAI)、可灵 `klingai.com`、即梦(字节)、Vidu(生数科技)
- 音频:Suno `suno.com`、Udio `udio.com`、ElevenLabs `elevenlabs.io`
- 图像:Midjourney `midjourney.com/news`、Stable Diffusion、Ideogram、Recraft、即梦图像

#### 推理框架 / Agent 框架

- vLLM `blog.vllm.ai`、SGLang `lmsys.org/blog`、Ollama `ollama.com/blog`、llama.cpp(GitHub releases)
- NVIDIA TensorRT-LLM / NIM
- LangChain `blog.langchain.dev`、LlamaIndex `llamaindex.ai/blog`、AutoGen、CrewAI、MetaGPT

#### 评测与论文

- arXiv `cs.AI` `cs.LG` `cs.CL` 新提交(`arxiv.org/list/cs.AI/new`)
- Hugging Face Daily Papers `huggingface.co/papers`
- Papers with Code `paperswithcode.com`
- Chatbot Arena LMSys `lmarena.ai`、SuperCLUE `superclueai.com`

#### 具身智能(AI 能力层,与 tech 类「机器人」对应)

- Figure AI 的 VLM 能力公告(Figure 02 / Helix)
- 1X 神经网络 demo
- Tesla Optimus(Tesla 渠道)
- 智元机器人启元 / 灵犀大模型(AgiBot 渠道)
- 银河通用 Galbot / NVIDIA GR00T
- Apptronik Apollo
- 划分标准:**讨论硬件本体 = tech/机器人;讨论 AI 模型 / VLA / 数据集 = ai/具身智能**

### trade(外贸资讯) — 窗口:过去 24 小时

#### 平台官方(卖家中心 / Newsroom)

- **亚马逊 Amazon**
  - Seller Central News `sellercentral.amazon.com/help/hub/announcements`
  - Amazon Newsroom `aboutamazon.com/news`
  - 全球开店中文站(`gs.amazon.cn`)、新闻动态
- **TikTok Shop**
  - TikTok Newsroom `newsroom.tiktok.com`
  - Seller Center 公告(各国站点:US / UK / 东南亚 6 国 / 沙特 / 墨西哥)
  - 字节火山引擎 TikTok 数据
- **阿里巴巴国际站 Alibaba.com**
  - 阿里巴巴国际站资讯 `seller.alibaba.com/aliyz`
  - OKKI / OKKI Copilot 产品动态
  - 1688 跨境专供
- **AliExpress(速卖通)** `sell.aliexpress.com/zh/news`
- **Shopify**
  - Shopify News `news.shopify.com`
  - Shopify Engineering `shopify.engineering/blog`
- **Temu / Pinduoduo Holdings** `temu.com` 卖家公告
- **Shein** `careers.sheingroup.com` / `corporate.sheingroup.com`
- **eBay** `ebaymainstreet.com` / 卖家中心
- **Walmart Marketplace** `marketplace.walmart.com/news`
- **Shopee 东南亚** `seller.shopee.com/edu/category/announcement`
- **Lazada** `sellercenter.lazada.com.my`(各东南亚站)
- **Mercado Libre 拉美** `developers.mercadolibre.com.ar/zh_cn/announcement`
- **Coupang 韩国** `coupangnews.com`
- **Wish** `merchant.wish.com/announcements`

#### 跨境电商垂直媒体(中文)

- 雨果跨境 `cifnews.com`
- 亿邦动力 `ebrun.com`
- 鹰熊汇 / 跨境眼 / 跨境知道
- 36 氪出海 `overseas.36kr.com`
- KrAsia(亚洲)`kr-asia.com`
- 网经社电子商务研究中心 `100ec.cn`
- 跨境电商指南、卖家精灵 `sellersprite.com/cn/blog`

#### 海外行业 / 数据机构

- Marketplace Pulse `marketplacepulse.com`
- Helium 10 blog、Jungle Scout blog
- Modern Retail `modernretail.co`、Retail Dive `retaildive.com`
- Tech in Asia `techinasia.com`、DealStreetAsia `dealstreetasia.com`
- eMarketer / Insider Intelligence cross-border 主题页
- Forrester Retail、Gartner Digital Commerce

#### 政府 / 海关 / 行业协会

- 中国海关总署 `customs.gov.cn`(进出口数据 / 公告)
- 商务部对外贸易司 `mofcom.gov.cn`(外贸数据、跨境电商综试区)
- 国务院关税税则委员会
- 中国国际贸易促进委员会 CCPIT `ccpit.org`
- 国家外汇管理局 `safe.gov.cn`
- 中国出口信用保险公司 `sinosure.com.cn`
- 海外:USTR `ustr.gov`、US Customs CBP `cbp.gov`、欧盟海关 TARIC `taxation-customs.ec.europa.eu`
- 各国合规:韩国 KCC、印尼 BKPM、巴西 ANATEL、墨西哥 SAT

#### 物流 / 跨境支付

- 中外运 / 中国邮政国际 / 菜鸟国际 / 京东物流国际(京东 IR 子页)
- DHL `dhl.com/global-en/home/press.html`、FedEx、UPS
- Flexport `flexport.com/blog`、ShipBob、Easyship
- 跨境支付:Payoneer `payoneer.com/resources`、WorldFirst `worldfirst.com`、Airwallex `airwallex.com/blog`、连连国际 `lianlianpay-global.com`、PingPong `pingpongx.com`
- 波罗的海航运指数 BDI `balticexchange.com`、上海集装箱运价指数 SCFI、Drewry WCI

### industry(行业新闻) — 窗口:过去 7 天

#### 中国研究机构

- 艾瑞咨询 `iresearch.com.cn`
- 199IT `199it.com`
- 创业邦 `cyzone.cn`
- 艾媒咨询 `iimedia.cn`
- QuestMobile `questmobile.com.cn`
- 易观分析 `analysys.cn`
- 赛迪顾问 `ccidnet.com`
- 信通院 CAICT `caict.ac.cn`(政策 + 行业白皮书)
- 中国互联网络信息中心 CNNIC `cnnic.cn`
- 中国汽车工业协会 `caam.org.cn`
- 中国电子学会 `cie-info.org.cn`

#### 海外咨询 / 研究

- McKinsey `mckinsey.com/insights`
- BCG `bcg.com/publications`
- Bain `bain.com/insights`
- Deloitte Insights `deloitte.com/global/en/insights`
- Gartner Newsroom `gartner.com/en/newsroom`
- IDC `idc.com/research`
- Forrester `forrester.com/blogs`
- Counterpoint Research `counterpointresearch.com`
- Canalys `canalys.com/newsroom`
- Omdia、Strategy Analytics
- Statista `statista.com/topics`(免费摘要)

#### 公司动态(财报 / 公告 / 季度数据)

- 港交所 HKEX 披露易 `hkexnews.hk`
- A 股巨潮资讯网 `cninfo.com.cn`
- 美股 SEC EDGAR `sec.gov/edgar`
- 各龙头公司 IR 页面(按本文件「公司清单」)

#### 垂直行业速查

- **新能源汽车**:乘联会 CPCA、中汽协 CAAM(月度交付 / 销量)
- **半导体产业**:Semiconductor Industry Association SIA `semiconductors.org`、SEMI `semi.org`
- **医疗健康**:STAT News `statnews.com`、丁香园 `dxy.cn`(医药)
- **教育科技**:EdSurge、芥末堆 `jiemodui.com`

### finance(投资与财经) — 窗口:过去 24 小时

#### 美股 / 美国市场

- 综合:Bloomberg Markets、Reuters Business、CNBC、Yahoo Finance、MarketWatch、Investing.com、Seeking Alpha free
- 大盘 / 龙头:AAPL / MSFT / GOOGL / NVDA / META / AMZN / TSLA / AMD / TSM / NFLX / AVGO / ORCL / CRM
- 财报披露:SEC EDGAR、各公司 IR
- 指数 / ETF 动向:S&P Dow Jones Indices `spglobal.com/spdji`、Nasdaq `nasdaq.com/news`

#### 港股

- 恒生指数 `hsi.com.hk`
- 港交所新闻 `hkex.com.hk/News`
- AAStocks `aastocks.com`、香港經濟日報 `hket.com`、信报 `hkej.com`
- Smartkarma research(免费摘要)

#### A 股

- 财联社快讯 `cls.cn`
- 雪球资讯 `xueqiu.com/news`
- 华尔街见闻 `wallstreetcn.com`
- 第一财经 `yicai.com`
- 证券时报 `stcn.com`、上海证券报 `cnstock.com`、经济观察报 `eeo.com.cn`
- 同花顺 / 东方财富 / 巨潮资讯

#### 宏观经济

- 经济数据日历:`investing.com/economic-calendar`
- 美联储 `federalreserve.gov`
- 央行 `pbc.gov.cn`
- 国家统计局 `stats.gov.cn`
- ECB `ecb.europa.eu`、Bank of England `bankofengland.co.uk`、BOJ `boj.or.jp`
- 智库:NBER、Brookings、Peterson Institute PIIE

#### 一级市场 / 融资

- TechCrunch funding、Crunchbase News `news.crunchbase.com`
- 投中网 `chinaventure.com.cn`、IT 桔子 `itjuzi.com`、铅笔道 `pencilnews.cn`

#### 大宗商品 / 商品市场

- Reuters Commodities `reuters.com/markets/commodities`
- OPEC 月报 `opec.org`
- Trading Economics `tradingeconomics.com`



## 分类与子分类(固定 taxonomy)

每条新条目必须归入一个 **大类(`<slug>.json`)** + 一个 **子分类(`subCategory` 字段)**。子分类只能从以下枚举里选,不要自创:

| 大类 | 子分类枚举 |
|---|---|
| **policy** | 产业政策 / 数字经济 / 金融监管 / AI 监管 / 数据安全 / 跨境贸易 / 新能源政策 / 反垄断 / 半导体出口管制 / 海外政策 |
| **tech** | 芯片硬件 / 消费电子 / 互联网产品 / 操作系统 / 机器人 / 智能汽车 / 航空航天 / XR-AR-VR / 开发者工具 / 开源生态 / 云计算 / 网络基础设施 / 安全漏洞 |
| **industry** | 行业研报 / 公司动态 / SaaS / 新能源汽车 / 半导体产业 / 制造业 / 消费零售 / 企业服务 / 医疗健康 / 教育科技 |
| **trade** | 平台政策 / 平台动态 / 独立站 / 新兴市场 / 物流仓储 / 跨境支付 / 关税法规 / 选品趋势 / 海关数据 |
| **ai** | 大模型 / 开源模型 / AI 编程 / 推理框架 / Agent / 多模态 / AI 视频 / AI 音频 / 具身智能 / AI 评测 / 论文进展 / AI 应用 |
| **finance** | 美股 / 港股 / A股 / 宏观经济 / 政策利率 / 一级市场 / 公司财报 / 风险事件 / 大宗商品 |

**跨类路由规则(优先级从高到低)**:

1. 来源是 **官方政府网站**(`*.gov.cn` / `*.gov.uk` / `*.europa.eu` / `whitehouse.gov` / `sec.gov` / `ftc.gov`) → 归 **policy**
2. 内容是 **AI 模型 / Agent / VLA / 多模态训练 / AI 编程工具 / AI 视频音频生成** → 归 **ai**,即便公司是科技巨头(如 Apple Intelligence、Google Gemini)
3. 内容是 **具身机器人 AI 能力**(如 Figure 02 VLM / Tesla Optimus 神经网络) → 归 **ai/具身智能**;**机器人本体硬件与产品发布**(如宇树 Go2 上市) → 归 **tech/机器人**
4. 内容是 **整车产品发布 / 智驾系统 / 车机系统** → 归 **tech/智能汽车**;**车企季度交付量 / 销量数据 / 市占率** → 归 **industry/新能源汽车**;**车企股价 / 财报 / 融资** → 归 **finance/公司财报**
5. 内容是 **跨境电商平台(Amazon / TikTok Shop / 阿里国际站 / Shopify / Temu / Shein / 速卖通 / Shopee / Lazada / eBay / Walmart)的卖家规则 / 平台政策 / 平台战略 / 跨境出口数据 / 海外仓 / 跨境支付** → 归 **trade**;但同一家公司的 **股价 / 财报** 仍归 **finance**,**公司层面 AI / 算法 / 技术架构发布** 仍归 **tech** 或 **ai**
6. 内容是 **海关进出口数据 / 跨境综合试验区 / 关税调整 / 出口退税 / 跨境合规要求** → 归 **trade/海关数据 或 关税法规**
7. 内容是 **公司财报 / 业绩快报 / 分红回购 / 一级市场融资轮次** → 归 **finance**
8. 内容是 **研究机构 / 咨询公司发布的行业研究** → 归 **industry**(子分类:行业研报)
9. 内容是 **股票 / 指数 / 宏观数据 / 货币政策 / 大宗商品 / 美联储 / 央行公告** → 归 **finance**
10. 其余 **科技产品发布 / 硬件 / 互联网产品 / 芯片 / 云服务 / 安全漏洞** → 归 **tech**

如果一条新闻天然跨类(如"工信部发文规范大模型应用"),只放进**最强相关**的那一类(本例归 policy 而非 ai;判定准则:**触发该新闻的最直接主体** —— 这里是政府监管行为)。

**简记口诀**:
- 政府发文 → policy
- 模型 / 算法 → ai
- 硬件 / 产品 → tech
- 销量 / 行业数据 → industry
- 跨境电商 / 平台卖家政策 / 出海 → trade
- 股票 / 财报 / 钱 → finance

## 字段规约(每条 NewsItem)

```
{
  "id":          "<slug>-<yyyymmdd>-<3 位序号>",   // 必填,稳定唯一
  "title":       "...",                              // 必填,原文标题,可适度精简但不改写
  "summary":     "...",                              // 必填,60-120 汉字,客观陈述,无营销词
  "publishedAt": "见下方时间提取规则",                  // 必填,只能是真实抽到的值
  "source":      "...",                              // 来源名称,中文优先(如 "工信部" / "Hacker News")
  "url":         "https://...",                      // 必填,原文 URL,必须可访问
  "subCategory": "..."                               // 必填,从上表枚举里选
}
```

- 不抓取付费墙 / 需要登录的内容
- 摘要禁止出现:**惊呆 / 重磅 / 震撼 / 必看 / 速速 / 史诗** 这类营销词
- 不要复制原文整段,改写成中性陈述

### ⚠️ 抓取硬性流程(违反任一条 → 丢弃该条目,不允许写入)

> **背景**:历史上多次出现"URL 真实存在 + 标题/摘要/时间却是猜的"案例。下面的步骤就是把猜的成分降为零。

#### 步骤 0 —— URL 必须真抓,不允许仅凭搜索摘要写条目

- 对每一条候选 item,**必须** `WebFetch` 该 URL 并拿到 200 响应的 HTML / JSON,从中提取 title + publishedAt
- 仅在 `WebSearch` 结果里看到的标题不算数;**搜索摘要 ≠ 正文,搜索时间 ≠ 发布时间**
- WebFetch 失败(403 / 404 / 超时 / 抓回的是 JS 空壳、无正文无时间)时,**先尝试同一一次信源的其它可抓取入口**,再决定是否丢弃:
  1. 该站 RSS / Atom feed(常见路径 `/feed`、`/rss`、`/rss.xml`、`/atom.xml`、newsroom 的 `?format=rss`)—— 从 feed 的 `<title>` + `<pubDate>` / `<updated>` 取值
  2. 官方 newsroom / IR 的**列表页**(多为服务端渲染,标题与日期可抓),据此回链到原文 URL
  3. 公司官方 GitHub / 博客的等价条目(如 releases、changelog 页)
  上述任一成功 → 用**该一次信源的 URL** 入条目;全部失败才丢弃
- ⚠️ **严禁因为一次信源难抓,就改用二手转载站(IT之家、新浪转载等)顶替同一条新闻** —— 这正是来源偏置的根因。难抓宁可丢弃,**不允许降级到转载站**
- **禁止凭记忆 / 凭搜索摘要补全**

#### 步骤 1 —— 标题校验(防"URL 对的、标题瞎编的")

抓回 HTML 后,从下列任一处取出页面的"真实标题":
- `<title>` 标签去掉站点后缀(如 ` - 站点名` / ` | Newsroom`)
- `<meta property="og:title">`
- `<h1>` 第一处文字

把"页面真实标题"和你打算写入的 `title` 字段对齐:
- 中文标题:**主语+谓语+宾语必须一致**;允许删减站点 / 编号 / 时间前缀,**不允许改主体或加猜测**
- 英文标题:允许小幅缩写,但实体名(产品名 / 公司名 / 版本号)必须一致
- **不一致 → 用页面真实标题覆盖你的写法;若覆盖后语义不通,丢弃整条**

举例(应丢弃 / 覆盖):
- 某条目 URL 指向真实存在的页面,页面真实标题是「消息称某公司寻求 500 亿元融资,下月将发布 V4.1 更新」
- 你不能写成「某公司 V4.1 定档 6 月,新增原生多模态与 MCP 适配」—— **这是伪造,必须丢弃或改回真实标题**

#### 步骤 2 —— `publishedAt` 提取(优先级从高到低,采到第一个真实值就停)

1. **HTML meta** —— `<meta property="article:published_time">` / `<meta name="pubdate">` / `<meta itemprop="datePublished">`
2. **JSON-LD** —— `<script type="application/ld+json">` 里的 `datePublished` / `dateCreated`
3. **`<time datetime="...">`** —— HTML5 time 标签的 datetime 属性
4. **页面正文里的时间标记**(必须是页面 HTML 里能 `grep` 到的字符串)
   - 中文站点常见:`2026-05-13 08:30`、`2026年5月13日 08:30`、`05-13 08:30`(今年补全)、`2026/05/13 20:11:00`
   - 英文站点常见:`May 13, 2026 8:30 AM ET`、`2026-05-13T08:30:00Z`
5. **URL 中的日期段** —— 如 `/2026/05/13/...` —— **只能拿到日期,不要拼时间**
6. **RSS / Atom feed 的 `<pubDate>`** —— 用源 feed 时优先这个

**输出格式**:

| 你抓到了 | 写到 publishedAt |
|---|---|
| 完整日期+时间+时区 | `2026-05-13T08:30:00+08:00`(标准 ISO) |
| 完整日期+时间但没时区 | 按站点 locale 补:中文站 `+08:00`、美东 `-04:00 / -05:00`、美西 `-07:00 / -08:00`、UK `+00:00 / +01:00`、UTC 站点 `Z` |
| 只有日期没有时间 | `2026-05-13`(就 10 个字符,**不要拼 T00:00:00**) |
| 只有相对时间("2 小时前"、"今天") | 用 routine 当前运行时间反推为完整 ISO,记到 summary 末尾标注 `(估算)` |
| 完全没线索 | **丢弃该条目**(宁缺毋滥),回报里计入"无法采集时间已丢弃 N 条" |

#### 步骤 3 —— 占位时间硬黑名单

下列整点时间属于"过去伪造惯犯",**默认禁止使用**:

```
00:00:00  08:00:00  09:00:00  10:00:00  12:00:00  18:00:00  20:00:00
```

仅当上述 hh:mm:ss **以完整字符串形式**出现在 WebFetch 抓到的页面 HTML 里(不是凭语境推),才允许保留。否则 **强制退化为 date-only**(只保留 `YYYY-MM-DD`),并在 routine 回报里计入"占位时间已退化 N 条"。

#### 步骤 4 —— 摘要校验(防"摘要瞎编")

`summary` 的所有事实主张(数字 / 日期 / 名称 / 版本号 / 引述)都必须能在 WebFetch 抓到的页面 HTML 里找到对应字符串或近似表述。**禁止补充原文未提及的内容**(如:原文只说"将发布 V4.1",你不许补"6 月发布""新增多模态")。

#### 步骤 5 —— 自检与整批回退

每次 commit 前,routine 自己跑一遍:

1. 同一文件里出现 ≥2 条 `publishedAt` 共享同一 `THH:MM:SS` 子串 → 视作占位嫌疑,**这些条目一律退化为 date-only**
2. `publishedAt` 晚于 routine 当前运行时间 → 一律丢弃或退化为 date-only
3. 同一批新增中 ≥30% 的条目"标题 vs 页面真实标题"对不上 → **整批本地回滚,不 commit**,在回报里说明"本次抓取质量不达标,跳过本次写入"
4. 任何 `summary` 里出现"惊呆 / 重磅 / 震撼 / 必看 / 速速 / 史诗 / 全网首发"等营销词 → 抹掉相关句子或丢弃该条目
5. **单日来源占比**:对本次涉及的每个 (大类, 日期),当天该类 ≥ 3 条时,核一遍单一来源是否 ≤ 60%(见「去重合并规则」第 5 条)。超限就回去补一手信源或减条目,**不要带着"某类某天全是 IT之家"去 commit** —— CI 的 `news-source-cap.mjs` 会拦下来

## 去重合并规则

每次运行:对每个大类做如下合并:

1. **新条目 vs 既有 items**:
   - 主键:**URL 标准化后**精确相等视为同一条(去掉 `?utm_*` 等追踪参数 + 去掉末尾 `/`)
   - 兜底:标题模糊匹配(>85% 相似)且 publishedAt 在同 24h 内,视为同一条
2. **同一新闻多源并存(转载) → 按信源层级只保留最高的一条**:同一事件若同时有一次信源(官方 newsroom / IR、政府公告、一线媒体原创)与转载站(IT之家等),**丢弃转载、保留一次信源**;层级相同(如两家都是转载)才退而保留 publishedAt 最早的那条
3. **占位剔除**:URL host 是 `example.com` 的全部丢弃
4. **单一来源上限(防刷屏)**:合并后,**同一来源在每个大类里最多保留 12 条**(按 `source` 名与 url host 双重判定,任一相同即视为同源),超出的按 `publishedAt` 倒序只留最新 12 条、丢弃其余,以此防止某个高频转载站(如 IT之家)挤占整类
   - 裁剪后若该类条目偏少,**不要**用同一来源补回 —— 宁可让该类少几条,也要保持来源分散
5. **【硬规则】单日来源占比上限(防"某天整类全是 IT之家")**:对**本次新增涉及的每一个 (大类, 日期)**,当天该类条目数 ≥ 3 时,**任一单一来源占比不得超过 60%**。若某 (大类, 日期) 算下来某来源(通常是 IT之家)超过 60% 甚至 100%:
   - **正确做法是补多样性,不是删条目** —— 回到「信息源清单」按步骤 0 多抓几条**一手信源**(官方 newsroom / IR、政府公告、一线媒体原创)把占比压下来
   - 若实在补不到其它来源 → **该 (大类, 日期) 这批宁可少写几条**,也不要让单一来源刷满当天
   - 这条由 CI 工作流 `validate-news.yml` 里的 `scripts/news-source-cap.mjs` 在 push 后强制校验(检查最近 2 个有数据日期),**违反会让校验失败**,务必提交前先自查
6. 合并完后按 `publishedAt` 倒序,**保留前 80 条**(超出部分丢弃,保持文件体积可控)

## GitHub 提交

```
工具: mcp__github__push_files
参数:
  repo: fanweibin2018/fanweibin2018
  branch: main
  message: "chore(news): routines 更新 YYYY-MM-DD HH:MM | policy +Np tech +Nt industry +Ni trade +Nx ai +Na finance +Nf"
          // Np/Nt/Ni/Nx/Na/Nf 分别为 6 类本次新增条目数
  files:
    - path: docs/.vitepress/data/news/policy.json    content: <serialized JSON>
    - path: docs/.vitepress/data/news/tech.json      content: <serialized JSON>
    - path: docs/.vitepress/data/news/industry.json  content: <serialized JSON>
    - path: docs/.vitepress/data/news/trade.json     content: <serialized JSON>
    - path: docs/.vitepress/data/news/ai.json        content: <serialized JSON>
    - path: docs/.vitepress/data/news/finance.json   content: <serialized JSON>
```

JSON 序列化注意:
- 2 空格缩进
- 不要末尾换行多一个空行
- 中文不要转义成 `\uXXXX`
- 保留每个文件顶部的 `"$schema": "./schema.json"` 字段

## 错误处理

- **某个源抓不到**:跳过,继续后面的源,不要中断
- **某条目分类不确定**:按上面"跨类路由"硬规则;若仍不确定 → 归到 **tech** 兜底
- **本次完全 0 条新增**:仍走完流程,只更新 `updatedAt`,提交一次 commit(作为心跳)
- **push 失败**(冲突 / 网络):再 `get_file_contents` 一次重新 merge → 再 push,最多重试 2 次
- **彻底失败**:在回报里如实输出错误,不要伪造数据

## 合规约束

- 仅抓**公开互联网内容**;不绕过付费墙、不抓取需要登录的页面
- 不抓取**个人 / 公司私域**信息(原 `info-competitor` / `info-keyword-monitor` 已剥离)
- **finance 类**的 JSON 每条 `summary` 末尾**不强制**加免责;但本 routine 的回报最末尾必须加一行:`⚠️ 投资类内容仅做信息汇总,非投资建议。`
- 不评论 / 不预测 / 不带情绪,只做客观陈述

## 回报格式(对话末尾输出给用户)

```
✅ 资讯更新完成 — YYYY-MM-DD HH:MM (+08:00)

新增 / 总数(本类保留):
  • 政策信息  +N / 共 NN  (子分类: A×n B×n)
  • 科技新闻  +N / 共 NN
  • 行业新闻  +N / 共 NN
  • 外贸资讯  +N / 共 NN
  • AI 与大模型 +N / 共 NN
  • 投资与财经 +N / 共 NN

跳过的源:  <列出本次抓取失败的源,如无则填 "无">
来源分布:  <各大类 Top3 来源 + 条数,用于自查是否仍偏向单一站点;任一来源在某类 >12 条即超限,需复查去重合并规则>
本次重点:  <1 句话,选最受关注的 1-2 条>

GitHub commit: <commit SHA + 链接>

⚠️ 投资类内容仅做信息汇总,非投资建议。
```

---

## 附:JSON 文件骨架速查

```json
{
  "$schema": "./schema.json",
  "slug": "tech",
  "title": "科技新闻",
  "description": "前沿科技、互联网产品、芯片硬件、开源生态。",
  "updatedAt": "2026-05-13T08:30:00+08:00",
  "items": [
    {
      "id": "tech-20260513-001",
      "title": "...",
      "summary": "...",
      "publishedAt": "2026-05-13T07:00:00+08:00",
      "source": "Apple Newsroom",
      "url": "https://...",
      "subCategory": "芯片硬件"
    }
  ]
}
```

完整契约见仓库 `docs/.vitepress/data/news/schema.json`(Draft 2020-12)。
