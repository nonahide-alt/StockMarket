import sys
import json
import requests
import pandas as pd
import io
import re

def get_nikkei_dividend_json(code):
    # Remove '.T' if present
    code = str(code).replace('.T', '')
    url = f'https://www.nikkei.com/nkd/company/kessan/?scode={code}'
    headers = {'User-Agent': 'Mozilla/5.0'}
    
    try:
        res = requests.get(url, headers=headers, timeout=10)
        res.encoding = res.apparent_encoding
        if res.status_code != 200:
            return json.dumps({"error": f"HTTP Error {res.status_code}"})
            
        tables = pd.read_html(io.StringIO(res.text))
        
        if len(tables) < 3:
            return json.dumps({"error": "Tables not found on Nikkei page"})
            
        # Table 0: 通期決算 (contains 1株益, 1株配当)
        t_pl = tables[0]
        # Table 2: 財務 (contains 1株純資産)
        t_bs = tables[2]
        
        # 1列目が指標名の想定
        pl_metrics = t_pl.iloc[:, 0].tolist()
        bs_metrics = t_bs.iloc[:, 0].tolist()
        
        # 行のインデックスを探す
        idx_eps = next((i for i, m in enumerate(pl_metrics) if '1株益' in str(m) or '一株利益' in str(m) or '一株益' in str(m)), None)
        idx_div = next((i for i, m in enumerate(pl_metrics) if '1株配当' in str(m) or '一株配当' in str(m)), None)
        idx_bps = next((i for i, m in enumerate(bs_metrics) if '1株純資産' in str(m) or '一株純資産' in str(m)), None)
        
        if idx_eps is None or idx_div is None or idx_bps is None:
            return json.dumps({"error": "Required metrics not found"})
            
        # 年度のラベル（2列目以降）
        # 列名から「連」や「単」などの文字を除去して年度だけにする
        raw_labels = t_pl.columns[1:].tolist()
        labels = []
        for lbl in raw_labels:
            # "2021/3連" -> "21.3"
            lbl_str = str(lbl)
            m = re.search(r'(\d{4})/(\d+)', lbl_str)
            if m:
                y = m.group(1)[-2:]
                mon = m.group(2)
                
                # 予想が含まれる場合
                res_label = f"{y}.{mon}"
                if '予' in lbl_str:
                    res_label += "予"
                labels.append(res_label)
            else:
                labels.append(lbl_str)
        
        # データの取得
        def clean_val(x):
            if pd.isna(x) or str(x).strip() in ['-', '－', '赤字', '*']: return None
            try: return float(str(x).replace(',', ''))
            except: return None

        dividends = []
        payouts = []
        does = []
        
        for col_i in range(1, len(t_pl.columns)):
            val_div = clean_val(t_pl.iloc[idx_div, col_i])
            val_eps = clean_val(t_pl.iloc[idx_eps, col_i])
            
            # BSのテーブルは列数がPLと同じと仮定
            val_bps = None
            if col_i < len(t_bs.columns):
                val_bps = clean_val(t_bs.iloc[idx_bps, col_i])
            
            dividends.append(val_div)
            
            # 配当性向 = 配当 / EPS * 100
            if val_div is not None and val_eps is not None and val_eps > 0:
                payouts.append(round(val_div / val_eps * 100, 1))
            else:
                payouts.append(None)
                
            # DOE = 配当 / BPS * 100
            if val_div is not None and val_bps is not None and val_bps > 0:
                does.append(round(val_div / val_bps * 100, 1))
            else:
                does.append(None)
                
        result = {
            "labels": labels,
            "dividends": dividends,
            "payouts": payouts,
            "does": does
        }
        
        return json.dumps(result, ensure_ascii=False)
        
    except Exception as e:
        return json.dumps({"error": str(e)})

if __name__ == "__main__":
    code = "7203"
    if len(sys.argv) > 1:
        code = sys.argv[1]
    
    print(get_nikkei_dividend_json(code))
