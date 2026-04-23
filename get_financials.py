import yfinance as yf
import json
import sys
import time
import requests
import math
from bs4 import BeautifulSoup

def safe_float(val):
    try:
        if val is None or (isinstance(val, float) and math.isnan(val)):
            return 0.0
        return float(val)
    except:
        return 0.0

def parse_number(text):
    """'10,346' → 10346.0、'▲10', '−10' → -10.0、'-' や '--' → 0.0"""
    text = text.replace(',', '').replace('\xa0', '').strip()
    if text in ('', '-', '--', '---', '－', 'ーー'):
        return 0.0
    
    # 様々なマイナス記号・ハイフンを標準の '-' (U+002D) に変換
    for minus in ['−', '－', '—', '–', '▲', '△']:
        if text.startswith(minus):
            text = '-' + text[len(minus):]
            break
        
    try:
        return float(text)
    except:
        return 0.0

def get_from_nikkei(code):
    """
    日経電子版の業績ページから財務データを取得する。
    1ページで5年分の実績（売上高、当期利益、経常利益、純資産）が取れる。
    """
    url = f"https://www.nikkei.com/nkd/company/kessan/?scode={code}&ba=1"
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept-Language": "ja-JP,ja;q=0.9"
    }
    
    try:
        resp = requests.get(url, headers=headers, timeout=10)
        if resp.status_code != 200:
            return None
        
        soup = BeautifulSoup(resp.text, 'html.parser')
        tables = soup.find_all('table')
        
        if not tables:
            return None
        
        # テーブル0: 損益計算書（経常収益・経常利益・当期利益）
        # テーブル2: 財務指標（純資産含む）
        # テーブル4: 貸借対照表（純資産合計）
        
        income_table = tables[0] if len(tables) > 0 else None
        bs_table = tables[4] if len(tables) > 4 else None
        
        if not income_table:
            return None
        
        # テーブルの行を解析
        def parse_table(table):
            rows = table.find_all('tr')
            result = {}
            headers_row = []
            for row in rows:
                cells = row.find_all(['th', 'td'])
                if not cells:
                    continue
                texts = [c.get_text(strip=True) for c in cells]
                if texts[0] == '決算期':
                    headers_row = texts[1:]  # ['2021/3連', '2022/3連', ...]
                else:
                    result[texts[0]] = texts[1:]
            return headers_row, result
        
        periods, income_data = parse_table(income_table)
        
        if not periods:
            return None
        
        # 純資産を貸借対照表から取得
        equity_data = {}
        if bs_table:
            bs_periods, bs = parse_table(bs_table)
            equity_row = bs.get('純資産合計', [])
            for i, period in enumerate(bs_periods):
                if i < len(equity_row):
                    equity_data[period] = parse_number(equity_row[i]) * 1000000  # 百万円→円
        
        # 売上高（銀行は経常収益、一般企業は売上高）
        revenue_key = next((k for k in income_data if '売上高' in k or '経常収益' in k or '営業収益' in k), None)
        net_income_key = next((k for k in income_data if '当期利益' in k or '純利益' in k), None)
        op_income_key = next((k for k in income_data if '営業利益' in k), None)
        ordinary_income_key = next((k for k in income_data if '経常利益' in k), None)
        
        if not revenue_key:
            return None
        
        income_history = []
        for i, period in enumerate(periods):
            # period例: "2023/3連" → ラベル "23/03"
            period_match = None
            import re
            m = re.search(r'(\d{4})/(\d{1,2})', period)
            if not m:
                continue
            year = int(m.group(1))
            month = int(m.group(2))
            label = f"{str(year)[-2:]}/{month:02d}"
            
            rev_vals = income_data.get(revenue_key, [])
            ni_vals  = income_data.get(net_income_key, []) if net_income_key else []
            op_vals  = income_data.get(op_income_key, []) if op_income_key else []
            
            rev = parse_number(rev_vals[i]) * 1000000 if i < len(rev_vals) else 0.0
            ni  = parse_number(ni_vals[i])  * 1000000 if i < len(ni_vals)  else 0.0
            op  = parse_number(op_vals[i])  * 1000000 if i < len(op_vals)  else 0.0
            eq  = equity_data.get(period, 0.0)
            
            income_history.append({
                "endDate":        {"fmt": label},
                "totalRevenue":   {"raw": rev},
                "grossProfit":    {"raw": 0.0},   # 日経テーブルには粗利なし
                "operatingIncome":{"raw": op},
                "netIncome":      {"raw": ni},
                "stockholdersEquity": {"raw": eq}
            })
        
        # 純資産リスト（ROE計算用のbalanceSheetStatements）
        bs_statements = []
        for i, period in enumerate(periods):
            eq = equity_data.get(period, 0.0)
            m = re.search(r'(\d{4})/(\d{1,2})', period)
            if m:
                year = int(m.group(1))
                month = int(m.group(2))
                label = f"{str(year)[-2:]}/{month:02d}"
                bs_statements.append({
                    "endDate": {"fmt": label},
                    "totalStockholderEquity": {"raw": eq}
                })
        
        # 新しい順（降順）に反転させる
        income_history.reverse()
        bs_statements.reverse()
        
        return {
            "quoteSummary": {
                "result": [{
                    "incomeStatementHistory": {"incomeStatementHistory": income_history},
                    "balanceSheetHistory": {"balanceSheetStatements": bs_statements},
                    "earningsEstimate": None  # 予測は別途Yahoo JPから取得
                }]
            }
        }
        
    except Exception as e:
        return {"error": str(e)}

def get_forecast_from_yahoo_jp(symbol):
    """来期予測のみYahoo Finance JPから補完する"""
    if not symbol.endswith('.T'):
        return None
    code = symbol.split('.')[0]
    url = f"https://finance.yahoo.co.jp/quote/{code}.T/performance"
    headers = {"User-Agent": "Mozilla/5.0"}
    try:
        resp = requests.get(url, headers=headers, timeout=10)
        if resp.status_code != 200:
            return None
        import re
        html = resp.text
        pattern = r'（会社予想）.*?<td[^>]*>.*?<span[^>]*>([\d,]+)</span>'
        match = re.search(pattern, html, re.DOTALL)
        if match:
            return float(match.group(1).replace(',', '')) * 1000000
    except:
        pass
    return None

def get_financials(symbol):
    # 日本株(.T)は日経から取得
    if symbol.endswith('.T'):
        code = symbol.split('.')[0]
        data = get_from_nikkei(code)
        if data and "quoteSummary" in data:
            # 来期予測を補完
            forecast = get_forecast_from_yahoo_jp(symbol)
            if forecast:
                data["quoteSummary"]["result"][0]["earningsEstimate"] = forecast
            return data
    
    # 米国株などはyfinanceにフォールバック
    for attempt in range(3):
        try:
            stock = yf.Ticker(symbol)
            income = stock.financials
            balance = stock.balance_sheet
            if income.empty:
                if attempt < 2:
                    time.sleep(1)
                    continue
                return {"error": "No income statement found"}
            result = {
                "incomeStatementHistory": {"incomeStatementHistory": []},
                "balanceSheetHistory": {"balanceSheetStatements": []},
                "earningsEstimate": None
            }
            for date, row in income.items():
                fmt_date = date.strftime('%Y/%m')
                result["incomeStatementHistory"]["incomeStatementHistory"].append({
                    "endDate": {"fmt": fmt_date},
                    "totalRevenue": {"raw": safe_float(row.get('Total Revenue', 0))},
                    "grossProfit":  {"raw": safe_float(row.get('Gross Profit', 0))},
                    "operatingIncome": {"raw": safe_float(row.get('Operating Income', 0))},
                    "netIncome":    {"raw": safe_float(row.get('Net Income', 0))}
                })
            for date, row in balance.items():
                fmt_date = date.strftime('%Y/%m')
                result["balanceSheetHistory"]["balanceSheetStatements"].append({
                    "endDate": {"fmt": fmt_date},
                    "totalStockholderEquity": {"raw": safe_float(row.get('Stockholders Equity', 0))}
                })
            return {"quoteSummary": {"result": [result]}}
        except Exception as e:
            if attempt < 2:
                time.sleep(1)
                continue
            return {"error": str(e)}

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No symbol provided"}))
    else:
        symbol = sys.argv[1]
        print(json.dumps(get_financials(symbol)))
