import sys
import json
import requests
import re
from bs4 import BeautifulSoup

def get_yahoo_dividend_json(code):
    code = str(code).replace('.T', '')
    url = f'https://finance.yahoo.co.jp/quote/{code}.T/dividend'
    headers = {'User-Agent': 'Mozilla/5.0'}

    try:
        res = requests.get(url, headers=headers, timeout=10)
        if res.status_code != 200:
            return json.dumps({"error": f"HTTP Error {res.status_code}"})

        res.encoding = 'utf-8'
        soup = BeautifulSoup(res.text, 'html.parser')
        tables = soup.find_all('table')

        if len(tables) < 3:
            return json.dumps({"error": "Tables not found"})

        def parse_year_label(th_text, is_forecast=False):
            """'2025年3月' -> '25.3' (予想なら '25.3予')"""
            m = re.search(r'(\d{4})年(\d+)月', th_text)
            if not m:
                return None
            year = m.group(1)[-2:]
            mon  = m.group(2)
            label = f"{year}.{mon}"
            if is_forecast:
                label += "予"
            return label

        # ----- Table 0: 予想配当 (最新予想行) -----
        # th: ['2026年3月', '予想'] → 予想ラベル
        div_data = {}  # label -> dividend
        fore_table = tables[0]
        for tr in fore_table.find_all('tr'):
            ths = [th.text.strip() for th in tr.find_all('th')]
            tds = [td.text.strip() for td in tr.find_all('td')]
            if not ths or not tds:
                continue
            th_text = ths[0]
            if not re.search(r'\d{4}年\d+月', th_text):
                continue
            # 年間合計（インデックス4）または年間予想（インデックス4）
            # cols: [第1Q, 第2Q, 第3Q, 第4Q, 合計, 前年]
            total = tds[4] if len(tds) > 4 else '---'
            if total in ('---', '', '－'):
                # 予想の場合、第2Qや合計を探す
                for v in tds:
                    try:
                        val = float(v)
                        total = v
                        break
                    except:
                        continue
            label = parse_year_label(th_text, is_forecast=True)
            if label:
                try:
                    div_data[label] = float(total)
                except:
                    div_data[label] = None

        # ----- Table 1: 過去の配当履歴 -----
        hist_table = tables[1]
        for tr in hist_table.find_all('tr'):
            ths = [th.text.strip() for th in tr.find_all('th')]
            tds = [td.text.strip() for td in tr.find_all('td')]
            if not ths or not tds:
                continue
            th_text = ths[0]
            if not re.search(r'\d{4}年\d+月', th_text):
                continue
            # 年間合計（インデックス4）
            total = tds[4] if len(tds) > 4 else '---'
            label = parse_year_label(th_text, is_forecast=False)
            if label:
                try:
                    div_data[label] = float(total)
                except:
                    div_data[label] = None

        # ----- Table 2: 配当性向・EPS -----
        payout_data = {}  # label -> payout%
        eps_data = {}     # label -> EPS(円)
        payout_table = tables[2]
        for tr in payout_table.find_all('tr'):
            ths = [th.text.strip() for th in tr.find_all('th')]
            tds = [td.text.strip() for td in tr.find_all('td')]
            if not ths or not tds:
                continue
            th_text = ths[0]
            if not re.search(r'\d{4}年\d+月', th_text):
                continue
            label = parse_year_label(th_text, is_forecast=False)
            payout_str = tds[0].replace('%', '').strip()
            if label:
                try:
                    payout_data[label] = float(payout_str)
                except:
                    payout_data[label] = None
            # EPS（PER計算用）
            eps_str = tds[1].replace('円', '').replace(',', '').strip() if len(tds) > 1 else ''
            if label:
                try:
                    eps_data[label] = float(eps_str)
                except:
                    eps_data[label] = None

        # ----- ラベルを年代順ソート -----
        def sort_key(lbl):
            is_fore = lbl.endswith('予')
            clean = lbl.replace('予', '')
            parts = clean.split('.')
            try:
                return (int(parts[0]), int(parts[1]), 1 if is_fore else 0)
            except:
                return (99, 99, 0)

        all_labels = sorted(div_data.keys(), key=sort_key)

        labels    = []
        dividends = []
        payouts   = []
        epss      = []

        for lbl in all_labels:
            clean = lbl.replace('予', '')
            div_val = div_data.get(lbl)
            labels.append(lbl)
            dividends.append(div_val)
            payouts.append(payout_data.get(clean))
            epss.append(eps_data.get(clean))

        result = {
            "labels":    labels,
            "dividends": dividends,
            "payouts":   payouts,
            "eps":       epss,
        }
        return json.dumps(result, ensure_ascii=False)

    except Exception as e:
        return json.dumps({"error": str(e)})


if __name__ == "__main__":
    code = "7203"
    if len(sys.argv) > 1:
        code = sys.argv[1]
    print(get_yahoo_dividend_json(code))
