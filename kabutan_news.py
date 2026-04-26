import sys
import json
import requests
import re
from bs4 import BeautifulSoup

# 重要度判定キーワード
KEYWORDS_POSITIVE = [
    '上方修正', '増配', '特別配当', '自社株買い', '株式分割', '増益', '最高益', '最高売上',
    '黒字転換', '黒字化', '好調', '大幅増', '上振れ', '増収増益', 'レーティング引き上げ',
    '目標株価を引き上げ', '目標株価引き上げ', '買い推奨', '新製品', '大型受注', '提携',
]
KEYWORDS_NEGATIVE = [
    '下方修正', '減配', '無配', '赤字転落', '赤字', '大幅減', '下振れ', '減収減益',
    'レーティング引き下げ', '目標株価を引き下げ', '目標株価引き下げ', '売り推奨',
    'リコール', '不正', '行政処分', '課徴金', '損失', '訴訟',
]
KEYWORDS_IMPORTANT = [
    '決算', '業績予想', '業績修正', '配当予告', '増資', '社長', 'M&A', '買収',
    'レーティング', '適時開示', '四半期', '本決算', '中間決算', '株主還元',
]

def classify_news(title):
    """ニュースタイトルを分類してタグと色を返す"""
    tags = []
    for kw in KEYWORDS_POSITIVE:
        if kw in title:
            return 'positive', tags
    for kw in KEYWORDS_NEGATIVE:
        if kw in title:
            return 'negative', tags
    for kw in KEYWORDS_IMPORTANT:
        if kw in title:
            return 'important', tags
    return 'normal', tags

def get_kabutan_news(code, limit=15):
    code = str(code).replace('.T', '')
    url = f'https://kabutan.jp/stock/news?code={code}'
    headers = {'User-Agent': 'Mozilla/5.0'}

    try:
        res = requests.get(url, headers=headers, timeout=10)
        if res.status_code != 200:
            return json.dumps({"error": f"HTTP {res.status_code}", "news": []})

        res.encoding = 'utf-8'
        soup = BeautifulSoup(res.text, 'html.parser')

        news_list = []
        tables = soup.find_all('table')

        # Table 3がニュース一覧
        news_table = None
        for tbl in tables:
            rows = tbl.find_all('tr')
            if rows and len(rows) > 2:
                first_cells = [td.text.strip() for td in rows[0].find_all(['td', 'th'])]
                # 日時っぽい列（年/月/日 時刻形式）かチェック
                if first_cells and re.search(r'\d{2}/\d{2}/\d{2}', first_cells[0]):
                    news_table = tbl
                    break

        if news_table is None:
            return json.dumps({"error": "News table not found", "news": []})

        count = 0
        for tr in news_table.find_all('tr'):
            if count >= limit:
                break
            cells = [td.text.strip() for td in tr.find_all(['td', 'th'])]
            if len(cells) < 3:
                continue
            date_str = cells[0].replace('\xa0', ' ')
            category  = cells[1]
            title     = cells[2]

            # リンク取得
            a = tr.find('a')
            href = a['href'] if a else ''
            link = f'https://kabutan.jp{href}' if href.startswith('/') else href

            # 重要度分類
            importance, _ = classify_news(title)

            # ノイズフィルタリング: テクニカルや特集、重要でないものを除外
            if category in ['テク', '海外', '特集']:
                continue
            
            # 日々の市況など業績と無関係な「材料」のうち、重要キーワードを含まないものを除外
            if importance == 'normal' and category not in ['開示', '決算']:
                continue

            # 日時を整形 (26/04/24 15:32 -> 2026/04/24 15:32)
            m = re.search(r'(\d{2})/(\d{2})/(\d{2})\s*(\d{2}:\d{2})?', date_str)
            if m:
                yy, mm, dd = m.group(1), m.group(2), m.group(3)
                tm = m.group(4) or ''
                date_disp = f'20{yy}/{mm}/{dd} {tm}'.strip()
            else:
                date_disp = date_str

            news_list.append({
                "date":       date_disp,
                "category":   category,
                "title":      title,
                "link":       link,
                "importance": importance  # 'positive' | 'negative' | 'important' | 'normal'
            })
            count += 1

        return json.dumps({"news": news_list}, ensure_ascii=False)

    except Exception as e:
        return json.dumps({"error": str(e), "news": []})


if __name__ == "__main__":
    code = "7203"
    if len(sys.argv) > 1:
        code = sys.argv[1]
    print(get_kabutan_news(code))
