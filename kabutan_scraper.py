import sys
import json
import requests
import re
from bs4 import BeautifulSoup


def get_kabutan_business_info(code):
    """
    株探から日本語の事業概要・業種・テーマ・決算月を取得する。
    Returns: {"summary": str, "sector": str, "fiscal_month": str}
    """
    code = str(code).replace('.T', '')
    url = f'https://kabutan.jp/stock/?code={code}'
    headers = {'User-Agent': 'Mozilla/5.0'}

    try:
        res = requests.get(url, headers=headers, timeout=10)
        if res.status_code != 200:
            return {"error": f"HTTP {res.status_code}", "summary": "", "sector": ""}

        res.encoding = 'utf-8'
        soup = BeautifulSoup(res.text, 'html.parser')

        summary = ""
        sector  = ""
        fiscal_month = ""

        # 全テーブルのthを走査
        for tbl in soup.find_all('table'):
            for th in tbl.find_all('th'):
                label = th.text.strip()
                td = th.find_next_sibling('td')
                if td is None:
                    continue
                val = td.text.strip()

                if '概要' in label and len(val) > 10:
                    summary = val
                elif '業種' in label and not sector:
                    sector = val
                elif '所属' in label and not sector:
                    sector = val
                elif '決算' in label and len(val) <= 4:
                    fiscal_month = val

        # 財務テーブルから決算月を推定 (例: 2024.12 -> 12月)
        if not fiscal_month:
            for th in soup.find_all('th'):
                m = re.search(r'(\d{4})\.(\d{2})', th.text)
                if m:
                    fiscal_month = f"{int(m.group(2))}月"
                    break

        return {"summary": summary, "sector": sector, "fiscal_month": fiscal_month}

    except Exception as e:
        return {"error": str(e), "summary": "", "sector": ""}


if __name__ == "__main__":
    code = "7203"
    if len(sys.argv) > 1:
        code = sys.argv[1]
    result = get_kabutan_business_info(code)
    print(json.dumps(result, ensure_ascii=False))
