# -*- coding: utf-8 -*-
import json
import os
import urllib.request
import urllib.parse
from datetime import datetime, timedelta

# Tavily API key (from environment)
TAVILY_API_KEY = os.environ.get('TAVILY_API_KEY', '')

# News categories and their search queries
CATEGORIES = {
    'ai': {
        'title': 'AI 与大模型',
        'description': '大模型、Agent、AI 编程、推理能力、开源模型的进展动态。',
        'queries': [
            'AI大模型 最新进展 2026年9月',
            'OpenAI Anthropic Google DeepMind 发布 2026年9月',
            '大模型 Agent 编程 推理 2026年9月'
        ]
    },
    'tech': {
        'title': '科技新闻',
        'description': '芯片、消费电子、机器人、量子计算等科技领域动态。',
        'queries': [
            '科技新闻 芯片 机器人 2026年9月',
            '消费电子 量子计算 2026年9月',
            '科技公司 产品发布 2026年9月'
        ]
    },
    'industry': {
        'title': '行业新闻',
        'description': '制造业、能源、医疗、教育等行业动态。',
        'queries': [
            '行业新闻 产业动态 2026年9月',
            '制造业 能源 医疗 2026年9月',
            '产业升级 数字化转型 2026年9月'
        ]
    },
    'trade': {
        'title': '外贸资讯',
        'description': '进出口、跨境电商、汇率、贸易政策等外贸领域动态。',
        'queries': [
            '外贸资讯 进出口 跨境电商 2026年9月',
            '贸易政策 汇率 关税 2026年9月',
            '出口 进口 物流 2026年9月'
        ]
    },
    'policy': {
        'title': '政策信息',
        'description': '产业政策、监管动态、法律法规等政策领域资讯。',
        'queries': [
            '政策信息 国务院 政策法规 2026年9月',
            '产业政策 监管 法律法规 2026年9月',
            '政府政策 经济政策 2026年9月'
        ]
    },
    'finance': {
        'title': '投资与财经',
        'description': '股市、基金、宏观经济、投资策略等财经领域动态。',
        'queries': [
            '金融市场 股票 基金 2026年9月',
            '投资财经 宏观经济 2026年9月',
            '股市行情 投资策略 2026年9月'
        ]
    }
}

def search_tavily(query, max_results=10):
    """Search using Tavily API"""
    if not TAVILY_API_KEY:
        print(f"Warning: TAVILY_API_KEY not set, skipping search for: {query}")
        return []
    
    url = 'https://api.tavily.com/search'
    data = json.dumps({
        'api_key': TAVILY_API_KEY,
        'query': query,
        'max_results': max_results,
        'search_depth': 'basic',
        'time_range': 'week'
    }).encode('utf-8')
    
    req = urllib.request.Request(url, data=data, headers={'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            result = json.loads(resp.read().decode('utf-8'))
            return result.get('results', [])
    except Exception as e:
        print(f"Error searching for '{query}': {e}")
        return []

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

def fetch_category_news(category_slug, category_info):
    """Fetch news for a specific category"""
    all_items = []
    
    for query in category_info['queries']:
        results = search_tavily(query, max_results=5)
        for i, result in enumerate(results):
            title = result.get('title', '')
            content = result.get('content', '')
            url = result.get('url', '')
            source = result.get('url', '').split('/')[2] if '/' in result.get('url', '') else ''
            
            # Create a summary from content (first 200 chars)
            summary = content[:200] + '...' if len(content) > 200 else content
            
            # Generate published time (use current time for now)
            published_at = datetime.now().strftime('%Y-%m-%dT%H:%M:%S+08:00')
            
            # Generate unique ID
            date_str = datetime.now().strftime('%Y%m%d')
            item_id = f"{category_slug}-{date_str}-{i:03d}"
            
            item = create_news_item(
                title=title,
                summary=summary,
                url=url,
                source=source,
                published_at=published_at,
                category_slug=category_slug,
                item_id=item_id
            )
            all_items.append(item)
    
    return all_items

def main():
    """Main function to fetch and update news"""
    print("Starting news fetch...")
    
    # Create output directory
    output_dir = 'docs/.vitepress/data/news'
    os.makedirs(output_dir, exist_ok=True)
    
    for category_slug, category_info in CATEGORIES.items():
        print(f"\nFetching news for: {category_info['title']}")
        
        # Fetch new items
        new_items = fetch_category_news(category_slug, category_info)
        print(f"  Found {len(new_items)} new items")
        
        # Load existing items
        json_file = os.path.join(output_dir, f'{category_slug}.json')
        if os.path.exists(json_file):
            with open(json_file, 'r', encoding='utf-8') as f:
                existing_data = json.load(f)
        else:
            existing_data = {
                '$schema': './schema.json',
                'slug': category_slug,
                'title': category_info['title'],
                'description': category_info['description'],
                'updatedAt': datetime.now().strftime('%Y-%m-%dT%H:%M:%S+08:00')
            }
        
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
        
        print(f"  Added {added_count} new items, total: {len(existing_items)}")
    
    print("\nNews fetch completed!")

if __name__ == '__main__':
    main()
