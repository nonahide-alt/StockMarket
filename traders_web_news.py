import sys
import io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
import json
import requests
import re
from bs4 import BeautifulSoup
from urllib.parse import urljoin

def get_traders_web_news(code):
    """
    トレーダーズ・ウェブから指定銘柄の直近ニュースを取得する
    URL例: https://www.traders.co.jp/stocks/7150/news
    """
    url = f'https://www.traders.co.jp/stocks/{code}/news'
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36'
    }

    try:
        res = requests.get(url, headers=headers, timeout=10)
        res.encoding = 'utf-8'
        if res.status_code != 200:
            return {"error": f"HTTP {res.status_code}", "news": []}

        soup = BeautifulSoup(res.text, 'html.parser')
        news_list = []

        # 銘柄個別ニュースのリンクを探す (例: /stocks/62_7150/news/2129633)
        for a_tag in soup.find_all('a', href=re.compile(r'/stocks/\d+_?' + re.escape(code) + r'/news/\d+')):
            href = a_tag.get('href', '')
            title = a_tag.text.strip()
            if not title or len(title) < 5:
                continue

            link = urljoin('https://www.traders.co.jp', href)

            if any(n['link'] == link for n in news_list):
                continue

            # 日付を探す - コンテナから探す
            date_str = ""
            container = a_tag.find_parent('div', class_='news_container')
            if container:
                timestamp_div = container.find('div', class_='timestamp')
                if timestamp_div:
                    date_str = timestamp_div.text.strip()
            
            if not date_str:
                # 念のため正規表現でも探す
                parent = a_tag.parent.parent if a_tag.parent else None
                if parent:
                    parent_text = parent.get_text(separator=' ')
                    m = re.search(r'(\d{4}/\d{2}/\d{2}\s+\d{2}:\d{2})', parent_text)
                    if m:
                        date_str = m.group(1)
                    else:
                        m = re.search(r'(\d{2}/\d{2}\s+\d{2}:\d{2})', parent_text)
                        if m:
                            date_str = m.group(1)

            date_str = re.sub(r'\s+', ' ', date_str).strip()

            news_list.append({
                "date": date_str,
                "title": title.replace('\xa0', ' ').replace('\n', '').strip(),
                "category": "トレーダーズ",
                "link": link,
                "importance": "normal"
            })

        return {"news": news_list[:20]}

    except Exception as e:
        return {"error": str(e), "news": []}

if __name__ == "__main__":
    code = "7203"
    if len(sys.argv) > 1:
        code = sys.argv[1]

    result = get_traders_web_news(code)
    print(json.dumps(result, ensure_ascii=False, indent=2))
