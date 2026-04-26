import sys
import json
import requests
import re
from bs4 import BeautifulSoup


def get_kabutan_yutai(code):
    """
    株探から株主優待情報・権利確定日・決算発表予定日を取得する。
    """
    code = str(code).replace('.T', '')
    url = f'https://kabutan.jp/stock/yutai?code={code}'
    headers = {'User-Agent': 'Mozilla/5.0'}

    try:
        res = requests.get(url, headers=headers, timeout=10)
        if res.status_code != 200:
            return {"error": f"HTTP {res.status_code}", "has_yutai": False}

        res.encoding = 'utf-8'
        soup = BeautifulSoup(res.text, 'html.parser')

        result = {
            "has_yutai": False,
            "kessan_date": "",       # 決算発表予定日
            "kenri_month": "",       # 権利確定月
            "kenri_lastday": "",     # 権利付き最終日
            "yield_total": "",       # 優待+配当利回り
            "yield_yutai": "",       # 優待利回り
            "category": "",          # 優待カテゴリ
            "content": "",           # 優待内容(簡潔)
            "min_shares": "",        # 最低必要株数
            "long_term": False,      # 長期保有優遇あり
        }

        # 決算発表予定日
        div = soup.find('div', id='kessan_happyoubi')
        if div:
            txt = div.text.strip()
            m = re.search(r'\d{4}/\d{2}/\d{2}', txt)
            if m:
                result["kessan_date"] = m.group(0)

        # stock_yutai_top_1: 利回り
        tbl1 = soup.find('table', class_='stock_yutai_top_1')
        if tbl1:
            rows = tbl1.find_all('tr')
            if len(rows) >= 2:
                cells = [td.text.strip() for td in rows[1].find_all('td')]
                if len(cells) >= 2:
                    result["yield_total"] = cells[0]
                    result["yield_yutai"] = cells[1]
                    result["has_yutai"] = True

        # stock_yutai_top_2: 権利確定月・権利付き最終日・最低株数
        tbl2 = soup.find('table', class_='stock_yutai_top_2')
        if tbl2:
            result["has_yutai"] = True
            for row in tbl2.find_all('tr'):
                cells = [td.text.strip() for td in row.find_all(['th', 'td'])]
                # 列0がラベル、列1が値
                for i in range(0, len(cells) - 1, 2):
                    label = cells[i]
                    val   = cells[i + 1] if i + 1 < len(cells) else ''
                    if '権利確定月' in label:
                        result["kenri_month"] = val
                    elif '権利付き最終日' in label:
                        result["kenri_lastday"] = val
                    elif '最低必要株数' in label:
                        result["min_shares"] = val
                    elif '長期保有優遇' in label:
                        result["long_term"] = ('あり' in val)
                    elif 'カテゴリ' in label:
                        result["category"] = val

        # stock_yutai_top_3: 優待内容(概要)
        tbl3 = soup.find('table', class_='stock_yutai_top_3')
        if tbl3:
            for row in tbl3.find_all('tr'):
                cells = [td.text.strip() for td in row.find_all('td')]
                if len(cells) >= 2 and '優待内容' in cells[0]:
                    result["content"] = cells[1][:120]

        # stock_yutai_detail_box: 詳細内容（最初の保有株数別テーブルの1行目）
        detail_tbl = soup.find('table', class_=lambda c: c and 'stock_yutai_detail_1' in c)
        if detail_tbl and not result["content"]:
            rows = detail_tbl.find_all('tr')
            if len(rows) >= 2:
                cells = [td.text.strip() for td in rows[1].find_all('td')]
                if len(cells) >= 2:
                    result["content"] = cells[1][:120]

        return result

    except Exception as e:
        return {"error": str(e), "has_yutai": False}


if __name__ == "__main__":
    code = "7203"
    if len(sys.argv) > 1:
        code = sys.argv[1]
    print(json.dumps(get_kabutan_yutai(code), ensure_ascii=False, indent=2))
