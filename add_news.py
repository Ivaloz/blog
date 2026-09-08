# -*- coding: utf-8 -*-
import json
import os
from datetime import datetime, timedelta

def create_news_item(title, summary, url, source, published_at, category_slug, item_id):
    """Create a news item in the correct format"""
    now = datetime.now().strftime('%Y-%m-%dT%H:%M:%S+08:00')
    return {
        'title': title,
        'summary': summary,
        'publishedAt': published_at,
        'source': source,
        'url': url,
        'subCategory': '',
        'id': item_id,
        'createdAt': now,
        'updatedAt': now
    }

def add_news_to_category(category_slug, new_items):
    """Add news items to a category"""
    output_dir = 'docs/.vitepress/data/news'
    json_file = os.path.join(output_dir, f'{category_slug}.json')
    
    # Load existing items
    if os.path.exists(json_file):
        with open(json_file, 'r', encoding='utf-8') as f:
            existing_data = json.load(f)
    else:
        print(f"Warning: {json_file} not found")
        return
    
    # Merge items (keep existing, add new)
    existing_items = existing_data.get('items', [])
    existing_urls = {item.get('url') for item in existing_items}
    
    # Add new items that don't already exist
    added_count = 0
    for item in new_items:
        if item.get('url') not in existing_urls:
            existing_items.append(item)
            added_count += 1
    
    # Sort by publishedAt (newest first)
    existing_items.sort(key=lambda x: x.get('publishedAt', ''), reverse=True)
    
    # Keep only latest 80 items
    existing_items = existing_items[:80]
    
    # Update data
    existing_data['items'] = existing_items
    existing_data['updatedAt'] = datetime.now().strftime('%Y-%m-%dT%H:%M:%S+08:00')
    
    # Save to file
    with open(json_file, 'w', encoding='utf-8') as f:
        json.dump(existing_data, f, ensure_ascii=False, indent=2)
    
    print(f"Added {added_count} new items to {category_slug}, total: {len(existing_items)}")

def main():
    """Main function to add news"""
    print("Adding news items...")
    
    # AI news
    ai_items = [
        create_news_item(
            title='Claude完成费马大定理证明',
            summary='Anthropic公布，其模型Claude在11天内完成了费马大定理的首个端到端、可由计算机完整检查的形式化证明，产出约1300万行Lean代码和30300个可验证定理，规模达Mathlib库的5倍以上。',
            url='https://m.cnyes.com/news/id/6598842',
            source='金色财经',
            published_at='2026-09-05T10:00:00+08:00',
            category_slug='ai',
            item_id='ai-20260905-001'
        ),
        create_news_item(
            title='OpenAI发布GPT-6 Astra',
            summary='OpenAI发布了GPT-6 Astra模型，编程和计算机操作是强项，105万token上下文，API定价输入10美元、输出50美元每百万token。',
            url='https://openai.com/zh-Hant/index/playco-game-prototyping-with-astra',
            source='OpenAI',
            published_at='2026-09-03T10:00:00+08:00',
            category_slug='ai',
            item_id='ai-20260903-001'
        ),
        create_news_item(
            title='阿里更新旗舰模型Qwen3.8-Max',
            summary='阿里更新了旗舰模型Qwen3.8-Max，在推理、编程、智能体及视觉理解基准等维度全面超越前代模型。',
            url='https://zhuanlan.zhihu.com/p/670574382',
            source='知乎',
            published_at='2026-09-04T10:00:00+08:00',
            category_slug='ai',
            item_id='ai-20260904-001'
        ),
        create_news_item(
            title='陶哲轩发出AI告警',
            summary='著名数学家陶哲轩指出，AI解题过快且过程黑盒，可能掩盖数学研究中宝贵的「失败」经验，阻碍对开放性问题的真正理解。',
            url='https://m.cnyes.com/news/id/6598842',
            source='金色财经',
            published_at='2026-09-05T11:00:00+08:00',
            category_slug='ai',
            item_id='ai-20260905-002'
        ),
        create_news_item(
            title='欧盟收紧数字监管：ChatGPT等纳入最高等级监管',
            summary='欧盟委员会宣布将ChatGPT、Reddit和Roblox纳入《数字服务法》最高等级监管范围，因其用户规模巨大且对社会影响扩大。',
            url='https://m.cnyes.com/news/id/6598842',
            source='金色财经',
            published_at='2026-09-05T12:00:00+08:00',
            category_slug='ai',
            item_id='ai-20260905-003'
        )
    ]
    add_news_to_category('ai', ai_items)
    
    # Tech news
    tech_items = [
        create_news_item(
            title='特斯拉Cybercab今日奥斯汀发布：无方向盘L5 Robotaxi',
            summary='首款原生无人驾驶量产车，取消方向盘/踏板，接入本地无人出行网，目标价<3万美元。',
            url='https://mguba.eastmoney.com/mguba/article/0/1768006904',
            source='股吧',
            published_at='2026-09-03T10:00:00+08:00',
            category_slug='tech',
            item_id='tech-20260903-001'
        ),
        create_news_item(
            title='我国牵头全球首个腿式机器人国际标准发布',
            summary='覆盖楼梯/坡面/越障真实场景评价体系，人形机器人"量产元年"配套规则落地，上半年国人形机出货破4万台。',
            url='https://mguba.eastmoney.com/mguba/article/0/1768006904',
            source='股吧',
            published_at='2026-09-03T11:00:00+08:00',
            category_slug='tech',
            item_id='tech-20260903-002'
        ),
        create_news_item(
            title='国产AI芯片百万颗缺口延续，交付排至3年后',
            summary='2026需求约400万颗/交付300万颗，寒武纪、摩尔线程、壁仞营收高增，科创AI ETF单日拉3.72%。',
            url='https://mguba.eastmoney.com/mguba/article/0/1768006904',
            source='股吧',
            published_at='2026-09-03T12:00:00+08:00',
            category_slug='tech',
            item_id='tech-20260903-003'
        ),
        create_news_item(
            title='腾讯WorkBuddy开放平台上线',
            summary='放Agent底座，接30+品牌智能硬件，开Skill/Expert/Connector三能力，覆盖金融/法律/医疗20余场景。',
            url='https://mguba.eastmoney.com/mguba/article/0/1768006904',
            source='股吧',
            published_at='2026-09-03T13:00:00+08:00',
            category_slug='tech',
            item_id='tech-20260903-004'
        ),
        create_news_item(
            title='苹果规划AI安防摄影机',
            summary='彭博社爆料，苹果正设计一款主打隐私保护的家用安防摄影机，计划利用AI监测环境而非直接记录影音，预计2027年发布。',
            url='https://m.cnyes.com/news/id/6598842',
            source='金色财经',
            published_at='2026-09-05T10:00:00+08:00',
            category_slug='tech',
            item_id='tech-20260905-001'
        )
    ]
    add_news_to_category('tech', tech_items)
    
    # Industry news
    industry_items = [
        create_news_item(
            title='2026世界动力电池大会宜宾启幕',
            summary='全球1/10动力电池产自宜宾，发布年度创新技术与路线图；一汽硫化物全固态低压力界面突破同步发酵。',
            url='https://mguba.eastmoney.com/mguba/article/0/1768006904',
            source='股吧',
            published_at='2026-09-03T10:00:00+08:00',
            category_slug='industry',
            item_id='industry-20260903-001'
        ),
        create_news_item(
            title='机器人小店落地合肥',
            summary='安徽首个机器人无人售卖场景应用「零次方机器人小店」亮相合肥，由「00后」团队打造，订单量突破3亿元，计划新开500家门店。',
            url='https://m.cnyes.com/news/id/6598842',
            source='金色财经',
            published_at='2026-09-05T10:00:00+08:00',
            category_slug='industry',
            item_id='industry-20260905-001'
        ),
        create_news_item(
            title='无界动力机器人量产准备',
            summary='无界动力第二代自研机器人K15进入组装测试阶段，预计2027年年产量达150-200万套，行业趋势从定制化转向成熟方案铺量。',
            url='https://m.cnyes.com/news/id/6598842',
            source='金色财经',
            published_at='2026-09-05T11:00:00+08:00',
            category_slug='industry',
            item_id='industry-20260905-002'
        ),
        create_news_item(
            title='国家人工智能基金投资北京可灵',
            summary='国家人工智能基金向北京可灵注入现金资本14亿元，推动AI产业发展。',
            url='https://m.cnyes.com/news/id/6598842',
            source='金色财经',
            published_at='2026-09-05T12:00:00+08:00',
            category_slug='industry',
            item_id='industry-20260905-003'
        )
    ]
    add_news_to_category('industry', industry_items)
    
    # Trade news
    trade_items = [
        create_news_item(
            title='中国将对自然人增值税实行代扣代缴',
            summary='11月1日起施行，进一步规范增值税管理。',
            url='https://www.365area.com/news/4434d60fcd1aade6',
            source='365外贸网',
            published_at='2026-09-05T10:00:00+08:00',
            category_slug='trade',
            item_id='trade-20260905-001'
        ),
        create_news_item(
            title='2026全球新能源企业500强总营收达10.59万亿元',
            summary='中国上榜企业营收占比51.84%，显示中国在全球新能源领域的领先地位。',
            url='https://www.365area.com/news/4434d60fcd1aade6',
            source='365外贸网',
            published_at='2026-09-05T11:00:00+08:00',
            category_slug='trade',
            item_id='trade-20260905-002'
        ),
        create_news_item(
            title='西南地区首条直达非洲货机航线开通',
            summary='加强中国与非洲地区的贸易联系，促进双边贸易发展。',
            url='https://www.365area.com/news/4434d60fcd1aade6',
            source='365外贸网',
            published_at='2026-09-05T12:00:00+08:00',
            category_slug='trade',
            item_id='trade-20260905-003'
        ),
        create_news_item(
            title='工信部鼓励"一人公司"等微型主体发展',
            summary='鼓励各地对依托智能工具开展敏捷创业的"一人公司"、超级个体等微型主体给予包容支持。',
            url='https://www.365area.com/news/4434d60fcd1aade6',
            source='365外贸网',
            published_at='2026-09-05T13:00:00+08:00',
            category_slug='trade',
            item_id='trade-20260905-004'
        )
    ]
    add_news_to_category('trade', trade_items)
    
    # Policy news
    policy_items = [
        create_news_item(
            title='促进数字化绿色化协同转型发展实施方案（2026-2030年）',
            summary='到2030年算力设施等重点领域可再生能源电力消费达所在省份消纳责任权重水平，支持算力设施液冷散热、余热回收等技术。',
            url='https://searxng.com.cn?post=103',
            source='零壹咨询',
            published_at='2026-09-04T10:00:00+08:00',
            category_slug='policy',
            item_id='policy-20260904-001'
        ),
        create_news_item(
            title='财政部发布《境内单位代扣代缴自然人增值税管理办法》',
            summary='进一步规范自然人增值税代扣代缴管理，11月1日起施行。',
            url='https://searxng.com.cn?post=103',
            source='零壹咨询',
            published_at='2026-09-03T10:00:00+08:00',
            category_slug='policy',
            item_id='policy-20260903-001'
        ),
        create_news_item(
            title='七部门促进数字化绿色化协同',
            summary='中国七部门联合印发方案，促进数字化与绿色化协同发展，推动产业转型升级。',
            url='https://m.cnyes.com/news/id/6598842',
            source='金色财经',
            published_at='2026-09-05T10:00:00+08:00',
            category_slug='policy',
            item_id='policy-20260905-001'
        ),
        create_news_item(
            title='纽约限制AI进入课堂',
            summary='纽约宣布限制在课堂中使用人工智能，以保护学术诚信，建立一年期暂停令。',
            url='https://www.instagram.com/reel/Dc6vWfTlMeb',
            source='Instagram',
            published_at='2026-09-05T11:00:00+08:00',
            category_slug='policy',
            item_id='policy-20260905-002'
        )
    ]
    add_news_to_category('policy', policy_items)
    
    # Finance news
    finance_items = [
        create_news_item(
            title='美联储9月加息预期进一步升温',
            summary='美元兑加元创两周新高，市场对美联储9月加息预期增强。',
            url='https://finance.sina.com.cn/money/forex/hbfx/2026-09-02/doc-iniqmfsw4627168.shtml',
            source='新浪财经',
            published_at='2026-09-02T10:00:00+08:00',
            category_slug='finance',
            item_id='finance-20260902-001'
        ),
        create_news_item(
            title='战争打不完，油价下不去',
            summary='美联储9月陷入加不加都难的困境，地缘政治冲突持续影响能源市场。',
            url='https://m.21jingji.com/article/20260902/herald/0917497cde7df6d0baf2f0e7b874f87e.html',
            source='金十数据·21财经',
            published_at='2026-09-02T15:23:00+08:00',
            category_slug='finance',
            item_id='finance-20260902-002'
        ),
        create_news_item(
            title='A股市场动态',
            summary='国产AI芯片概念股持续活跃，科创AI ETF单日拉3.72%，算力基础设施板块受关注。',
            url='https://mguba.eastmoney.com/mguba/article/0/1768006904',
            source='股吧',
            published_at='2026-09-03T10:00:00+08:00',
            category_slug='finance',
            item_id='finance-20260903-001'
        ),
        create_news_item(
            title='固态电池概念股活跃',
            summary='一汽硫化物全固态低压力界面突破，固态电池概念股短线主题活跃。',
            url='https://mguba.eastmoney.com/mguba/article/0/1768006904',
            source='股吧',
            published_at='2026-09-03T11:00:00+08:00',
            category_slug='finance',
            item_id='finance-20260903-002'
        )
    ]
    add_news_to_category('finance', finance_items)
    
    print("\nAll news items added successfully!")

if __name__ == '__main__':
    main()
