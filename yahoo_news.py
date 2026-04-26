import sys
import json
import requests
from bs4 import BeautifulSoup
from urllib.parse import urljoin

def get_yahoo_news(code):
    """
    Yahooファイナンスから指定銘柄の直近ニュースを取得する
    """
    url = f'https://finance.yahoo.co.jp/quote/{code}/news'
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

        # Yahooファイナンスのニュースは <a> タグの href が /news/detail/ で始まるもの
        for a_tag in soup.find_all('a'):
            href = a_tag.get('href', '')
            if href.startswith('/news/detail/'):
                title = a_tag.text.strip()
                if not title:
                    continue
                
                # aタグの親要素などから日付やソースを取得する (構造依存)
                # 今回は最低限タイトルとリンクを取得
                link = urljoin('https://finance.yahoo.co.jp', href)
                
                # 同じ記事が複数ある場合を排除
                if any(n['link'] == link for n in news_list):
                    continue

                # timeタグがあれば日付として取得
                date_str = ""
                time_tag = a_tag.parent.parent.find('time')
                if time_tag:
                    date_str = time_tag.text.strip()
                else:
                    # テキストの中から時間を抽出 (例: "4/23")
                    parent_text = a_tag.parent.parent.text
                    # ... 簡易的に親のテキストからタイトルを抜いた部分を日付/ソースとするか、ここではブランク
                    pass
                
                source_str = "Yahoo!ファイナンス"

                news_list.append({
                    "date": date_str,
                    "title": title,
                    "category": source_str,
                    "link": link,
                    "importance": "normal"
                })

        return {"news": news_list[:20]} # 最新20件

    except Exception as e:
        return {"error": str(e), "news": []}

if __name__ == "__main__":
    code = "7203.T"
    if len(sys.argv) > 1:
        code = sys.argv[1]
    
    result = get_yahoo_news(code)
    print(json.dumps(result, ensure_ascii=False, indent=2))
