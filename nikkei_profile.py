import sys
import io
import json
import requests
from bs4 import BeautifulSoup

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

def get_nikkei_profile(code):
    # Remove '.T' if present
    code = str(code).replace('.T', '')
    url = f'https://www.nikkei.com/nkd/company/gaiyo/?scode={code}&ba=1'
    headers = {'User-Agent': 'Mozilla/5.0'}
    
    try:
        res = requests.get(url, headers=headers, timeout=10)
        res.encoding = 'utf-8'
        if res.status_code != 200:
            return {"error": f"HTTP Error {res.status_code}"}
            
        soup = BeautifulSoup(res.text, 'html.parser')
        
        # 会社名の取得 (通常h1タグの中に入っている)
        company_name = ""
        h1_tag = soup.find('h1')
        if h1_tag:
            company_name = h1_tag.text.strip()
            
        # URLを探す。<th>URL</th>の次の<td>を探す
        th_url = soup.find('th', string='URL')
        if th_url:
            td_url = th_url.find_next_sibling('td')
            if td_url:
                a_tag = td_url.find('a')
                if a_tag and a_tag.get('href'):
                    return {"url": a_tag.get('href'), "name": company_name}
                # もしリンクがなくてもテキストがあれば返す
                text = td_url.text.strip()
                if text:
                    return {"url": text, "name": company_name}
        
        return {"error": "URL not found", "name": company_name}
        
    except Exception as e:
        return {"error": str(e)}

if __name__ == "__main__":
    code = "4755"
    if len(sys.argv) > 1:
        code = sys.argv[1]
    
    result = get_nikkei_profile(code)
    print(json.dumps(result, ensure_ascii=False, indent=2))
