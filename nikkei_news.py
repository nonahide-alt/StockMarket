import sys
import io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
import json
import requests
from bs4 import BeautifulSoup
from urllib.parse import urljoin

def get_nikkei_news(code):
    """
    日経電子版（スマートチャート）から指定銘柄の直近ニュースを取得する
    """
    url = f'https://www.nikkei.com/nkd/company/news/?scode={code}'
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

        # 日経のニュースリストは、ul.m-newsList などの中にあるか、
        # div.m-articleListItem などの中にある
        # 単純に記事リンク (/article/ などを探す)
        
        for a_tag in soup.find_all('a'):
            href = a_tag.get('href', '')
            if '/article/' in href or '/news/news/' in href:
                title = a_tag.text.strip()
                if not title or len(title) < 5:
                    continue
                
                link = urljoin('https://www.nikkei.com', href)
                
                # 重複排除
                if any(n['link'] == link for n in news_list):
                    continue

                # timeタグなどで日付を探す (親や祖先要素)
                date_str = ""
                parent = a_tag.parent
                for _ in range(4):
                    if not parent: break
                    time_span = parent.find('span', class_=lambda c: c and ('time' in c.lower() or 'date' in c.lower()))
                    if time_span:
                        date_str = time_span.text.strip().replace('\xa0', ' ').replace('\r', '').replace('\n', '')
                        # 余分な連続空白を1つに
                        date_str = ' '.join(date_str.split())
                        break
                    time_tag = parent.find('time')
                    if time_tag:
                        date_str = time_tag.text.strip().replace('\xa0', ' ').replace('\r', '').replace('\n', '')
                        date_str = ' '.join(date_str.split())
                        break
                    parent = parent.parent

                news_list.append({
                    "date": date_str,
                    "title": title.replace('\xa0', ' '),
                    "category": "日本経済新聞",
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
    
    result = get_nikkei_news(code)
    print(json.dumps(result, ensure_ascii=False, indent=2))
