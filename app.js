let STOCKS = []; // Will be populated from CSV
let TREE_DATA = {}; // { Major: { Middle: [Stocks] } }
let currentIndex = 0;
let chart = null;
let candleSeries = null;
let volumeSeries = null;
let monthDelimiterSeries = null;
let currentRange = '2y';
let lineSeriesMap = {};

const DOM = {
    list: document.getElementById('stockList'),
    name: document.getElementById('stockName'),
    symbol: document.getElementById('stockSymbol'),
    price: document.getElementById('currentValue'),
    change: document.getElementById('priceChange'),
    changeIcon: document.getElementById('changeIcon'),
    changeValue: document.getElementById('changeValue'),
    time: document.getElementById('updateTime'),
    chartContainer: document.getElementById('chartContainer'),
    loadingOverlay: document.getElementById('loadingOverlay'),
    rangeBtns: null,
    // Settings Modal
    settingsModal: document.getElementById('settingsModal'),
    openSettingsBtn: document.getElementById('openSettingsBtn'),
    closeSettingsBtn: document.getElementById('closeSettingsBtn'),
    exportCSVBtn: document.getElementById('exportCSVBtn'),
    importCSVBtn: document.getElementById('importCSVBtn'),
    csvFileInput: document.getElementById('csvFileInput'),
    resetDataBtn: document.getElementById('resetDataBtn'),
    importStatus: document.getElementById('importStatus'),
    sidebar: document.getElementById('sidebar'),
    resizer: document.getElementById('sidebarResizer'),
    refreshChartBtn: document.getElementById('refreshChartBtn'),
    // Search Modal
    searchModal: document.getElementById('searchModal'),
    openSearchBtn: document.getElementById('openSearchBtn'),
    closeSearchBtn: document.getElementById('closeSearchBtn'),
    runGCBtn: document.getElementById('runGCBtn'),
    searchProgressArea: document.getElementById('searchProgressArea'),
    searchStatusText: document.getElementById('searchStatusText'),
    searchCountText: document.getElementById('searchCountText'),
    searchProgressBar: document.getElementById('searchProgressBar'),
    // JPX Fetch
    fetchJpxBtn: document.getElementById('fetchJpxBtn'),
    jpxStatus: document.getElementById('jpxStatus'),
    // Context Menu
    contextMenu: document.getElementById('contextMenu'),
    ctxFavorite: document.getElementById('ctxFavorite'),
    ctxYahoo: document.getElementById('ctxYahoo'),
    ctxNikkei: document.getElementById('ctxNikkei'),
    ctxKabutan: document.getElementById('ctxKabutan'),
    // Backtest
    runBacktestBtn: document.getElementById('runBacktestBtn'),
    backtestProgressArea: document.getElementById('backtestProgressArea'),
    backtestStatusText: document.getElementById('backtestStatusText'),
    backtestCountText: document.getElementById('backtestCountText'),
    backtestProgressBar: document.getElementById('backtestProgressBar'),
    backtestResults: document.getElementById('backtestResults'),
    btSampleCount: document.getElementById('btSampleCount'),
    btWinRate: document.getElementById('btWinRate'),
    btAvgReturn: document.getElementById('btAvgReturn'),
    btMedianReturn: document.getElementById('btMedianReturn')
};

const STORAGE_KEY = 'stock_viewer_custom_data';
const SIDEBAR_WIDTH_KEY = 'stock_viewer_sidebar_width';

let isSearching = false;
let contextTargetSymbol = null;

// Initialize app
async function init() {
    try {
        lucide.createIcons();
        initChart();
        initSidebarResizer();
        
        DOM.rangeBtns = document.querySelectorAll('.tab-btn');
        
        // Load Data (LocalStorage or CSV)
        await loadMeigaraData();
        
        // Range Tab Events
        DOM.rangeBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const range = btn.getAttribute('data-range');
                if (range !== currentRange) {
                    setRange(range);
                }
            });
        });

        // Settings Events
        DOM.openSettingsBtn.onclick = () => DOM.settingsModal.classList.remove('hidden');
        DOM.closeSettingsBtn.onclick = () => DOM.settingsModal.classList.add('hidden');
        window.onclick = (e) => {
            if (e.target === DOM.settingsModal) DOM.settingsModal.classList.add('hidden');
        };

        DOM.exportCSVBtn.onclick = exportCSV;
        DOM.importCSVBtn.onclick = () => DOM.csvFileInput.click();
        DOM.csvFileInput.onchange = (e) => importCSV(e.target.files[0]);
        DOM.resetDataBtn.onclick = resetData;
        if (DOM.fetchJpxBtn) DOM.fetchJpxBtn.onclick = fetchJpxStocks;

        // Search Events
        if (DOM.openSearchBtn) DOM.openSearchBtn.onclick = () => DOM.searchModal.classList.remove('hidden');
        if (DOM.closeSearchBtn) DOM.closeSearchBtn.onclick = () => DOM.searchModal.classList.add('hidden');
        if (DOM.runGCBtn) DOM.runGCBtn.onclick = startGCSearch;
        if (DOM.runBacktestBtn) DOM.runBacktestBtn.onclick = startBacktest;
        
        // Context Menu App-wide events
        document.addEventListener('click', (e) => {
            if (DOM.contextMenu && !DOM.contextMenu.classList.contains('hidden')) {
                DOM.contextMenu.classList.add('hidden');
            }
        });
        
        if (DOM.sidebar) {
            DOM.sidebar.addEventListener('scroll', () => {
                if (DOM.contextMenu && !DOM.contextMenu.classList.contains('hidden')) {
                    DOM.contextMenu.classList.add('hidden');
                }
            });
        }
        
        // Context Menu Actions
        if (DOM.ctxFavorite) {
            DOM.ctxFavorite.onclick = () => {
                if (!contextTargetSymbol) return;
                const targetStock = STOCKS.find(s => s.symbol === contextTargetSymbol);
                if (targetStock) {
                    const favMajor = '★ 一時調査候補';
                    const now = new Date();
                    const favMiddle = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
                    
                    const exists = STOCKS.some(s => s.symbol === contextTargetSymbol && s.major === favMajor);
                    if (!exists) {
                        const newStock = { ...targetStock, major: favMajor, middle: favMiddle };
                        STOCKS.push(newStock);
                        
                        // TREE_DATAにも追加する
                        if (!TREE_DATA[favMajor]) TREE_DATA[favMajor] = {};
                        if (!TREE_DATA[favMajor][favMiddle]) TREE_DATA[favMajor][favMiddle] = [];
                        TREE_DATA[favMajor][favMiddle].push(newStock);
                        
                        saveToLocal();
                        renderSidebar(true);
                        
                        // 一時調査候補の大・中フォルダを強制的に展開する
                        DOM.list.querySelectorAll('.major-folder').forEach(f => {
                            if (f.querySelector('.folder-title').textContent === favMajor) f.classList.remove('collapsed');
                        });
                        DOM.list.querySelectorAll('.middle-folder').forEach(f => {
                            if (f.querySelector('.folder-title').textContent === favMiddle) f.classList.remove('collapsed');
                        });
                        
                    } else {
                        alert("すでに一時調査候補に登録されています。");
                    }
                }
            };
        }
        if (DOM.ctxYahoo) {
            DOM.ctxYahoo.onclick = () => {
                if (!contextTargetSymbol) return;
                const code = contextTargetSymbol.replace('.T', '');
                window.open(`https://finance.yahoo.co.jp/quote/${code}`, '_blank');
            };
        }
        if (DOM.ctxNikkei) {
            DOM.ctxNikkei.onclick = () => {
                if (!contextTargetSymbol) return;
                const code = contextTargetSymbol.replace('.T', '');
                window.open(`https://www.nikkei.com/nkd/company/?scode=${code}`, '_blank');
            };
        }
        if (DOM.ctxKabutan) {
            DOM.ctxKabutan.onclick = () => {
                if (!contextTargetSymbol) return;
                const code = contextTargetSymbol.replace('.T', '');
                window.open(`https://kabutan.jp/stock/?code=${code}`, '_blank');
            };
        }

        // Try load custom data
        const customData = localStorage.getItem(STORAGE_KEY);
        if (customData) {
            parseCSV(customData);
        } else {
            // Load default meigara.csv
            loadDefaultData();
        }

        DOM.refreshChartBtn.onclick = () => {
            resizeChart();
            if (chart) chart.timeScale().fitContent();
        };
        
        // Keyboard navigation
        document.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowUp') {
                e.preventDefault();
                navigateStock(-1);
            } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                navigateStock(1);
            } else if (e.key === 'ArrowLeft') {
                e.preventDefault();
                const ranges = ['1d', '2y', '10y'];
                const idx = ranges.indexOf(currentRange);
                if (idx > 0) setRange(ranges[idx - 1]);
            } else if (e.key === 'ArrowRight') {
                e.preventDefault();
                const ranges = ['1d', '2y', '10y'];
                const idx = ranges.indexOf(currentRange);
                if (idx < ranges.length - 1) setRange(ranges[idx + 1]);
            } else if (e.key === 'Escape') {
                DOM.settingsModal.classList.add('hidden');
            }
        });

        // ResizeObserverでchartContainerのサイズ変更を自動検知
        const resizeObserver = new ResizeObserver(() => {
            resizeChart();
        });
        resizeObserver.observe(DOM.chartContainer);

        if (STOCKS.length > 0) {
            selectStock(0);
        }
    } catch (e) {
        document.body.innerHTML = `<div style="color:red; background:white; padding: 20px; font-size: 20px; z-index: 9999; position: absolute; top:0; left:0; right:0; bottom:0; padding:100px;">INIT CRASH: ${e.message}<br/><br/><pre style="white-space: pre-wrap;">${e.stack}</pre></div>`;
        console.error(e);
    }
}

async function loadMeigaraData() {
    let csvText = '';
    const cachedData = localStorage.getItem(STORAGE_KEY);
    
    if (cachedData) {
        csvText = cachedData;
    } else {
        const response = await fetch('meigara.csv');
        csvText = await response.text();
    }
    
    parseCSV(csvText);
    renderSidebar();
}

// ---- Data Persistence Functions ----
function saveToLocal() {
    let csvContent = '大分類,中分類,銘柄コード,銘柄名,備考\n';
    STOCKS.forEach(s => {
        const codeBase = s.symbol.replace('.T', '');
        csvContent += `${s.major},${s.middle},${codeBase},${s.name},${s.remarks}\n`;
    });
    localStorage.setItem(STORAGE_KEY, csvContent);
}

function parseCSV(text) {
    const lines = text.split('\n').filter(line => line.trim() !== '');
    
    // Check if first line is header by inspecting the content (heuristic)
    const firstLine = lines[0].split(',');
    let dataLines = lines;
    if (firstLine[0].includes('分類') || firstLine[2].includes('コード')) {
        dataLines = lines.slice(1);
    }
    
    STOCKS = [];
    TREE_DATA = {};
    
    dataLines.forEach(line => {
        const parts = line.split(',').map(s => s.trim());
        if (parts.length < 4) return;
        
        const [major, middle, code, name, remarks] = parts;
        if (!code) return;
        
        const symbol = (code.includes('.') || code.startsWith('^') || code.includes('=') || code.includes('-')) ? code : code + '.T';
        const stock = { 
            symbol, 
            name, 
            originalName: name, // Store CSV name
            remarks: remarks || '',
            major: major || 'その他',
            middle: middle || '共通'
        };
        
        STOCKS.push(stock);
        
        if (!TREE_DATA[stock.major]) TREE_DATA[stock.major] = {};
        if (!TREE_DATA[stock.major][stock.middle]) TREE_DATA[stock.major][stock.middle] = [];
        TREE_DATA[stock.major][stock.middle].push(stock);
    });
}

function exportCSV() {
    // UTF-8 BOM to prevent garbling in Excel
    let csvContent = '\uFEFF大分類,中分類,銘柄コード,銘柄名,備考\n';
    STOCKS.forEach(s => {
        const code = s.symbol.replace('.T', '');
        csvContent += `${s.major},${s.middle},${code},${s.name},${s.remarks}\n`;
    });
    
    // Format: StockView_YYYYMMDD_HHMMSS.csv
    const now = new Date();
    const Y = now.getFullYear();
    const M = (now.getMonth() + 1).toString().padStart(2, '0');
    const D = now.getDate().toString().padStart(2, '0');
    const h = now.getHours().toString().padStart(2, '0');
    const m = now.getMinutes().toString().padStart(2, '0');
    const s = now.getSeconds().toString().padStart(2, '0');
    const filename = `StockView_${Y}${M}${D}_${h}${m}${s}.csv`;
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function importCSV(file) {
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const text = e.target.result;
            localStorage.setItem(STORAGE_KEY, text);
            parseCSV(text);
            renderSidebar();
            
            showStatus('インポート成功！銘柄リストを更新しました。', 'success');
            setTimeout(() => {
                selectStock(0);
                DOM.settingsModal.classList.add('hidden');
            }, 1000);
        } catch (err) {
            console.error(err);
            showStatus('インポート失敗: CSVの形式を確認してください。', 'error');
        }
    };
    reader.readAsText(file);
}

function resetData() {
    if (confirm('すべてのカスタムデータを削除してデフォルトに戻しますか？')) {
        localStorage.removeItem(STORAGE_KEY);
        location.reload();
    }
}

function showStatus(msg, type) {
    DOM.importStatus.innerHTML = `<span class="status-msg ${type}">${msg}</span>`;
    setTimeout(() => {
        DOM.importStatus.innerHTML = '';
    }, 3000);
}

function renderSidebar(preserveState = false) {
    let openFolders = new Set();
    if (preserveState) {
        DOM.list.querySelectorAll('.major-folder:not(.collapsed)').forEach(f => {
            const t = f.querySelector('.folder-title');
            if (t) openFolders.add('major:' + t.textContent);
        });
        DOM.list.querySelectorAll('.middle-folder:not(.collapsed)').forEach(f => {
            const t = f.querySelector('.folder-title');
            if (t) openFolders.add('middle:' + t.textContent);
        });
    }

    DOM.list.innerHTML = '';
    
    Object.keys(TREE_DATA).forEach((major, majIdx) => {
        const majorFolder = createFolder(major, 'major-folder');
        const majorContent = majorFolder.querySelector('.folder-content');
        
        if (preserveState) {
            if (!openFolders.has('major:' + major)) majorFolder.classList.add('collapsed');
        } else {
            // Default: first major folder open, others closed
            if (majIdx !== 0) majorFolder.classList.add('collapsed');
        }
        
        Object.keys(TREE_DATA[major]).forEach(middle => {
            const middleFolder = createFolder(middle, 'middle-folder');
            const middleContent = middleFolder.querySelector('.folder-content');
            
            if (preserveState) {
                if (!openFolders.has('middle:' + middle)) middleFolder.classList.add('collapsed');
            } else {
                // Default: middle folders closed
                middleFolder.classList.add('collapsed');
            }
            
            TREE_DATA[major][middle].forEach(stock => {
                const globalIndex = STOCKS.indexOf(stock);
                const item = createStockItem(stock, globalIndex);
                middleContent.appendChild(item);
            });
            
            majorContent.appendChild(middleFolder);
        });
        
        DOM.list.appendChild(majorFolder);
    });
    
    lucide.createIcons();
}

function createFolder(title, className) {
    const div = document.createElement('div');
    div.className = `folder-item ${className}`;
    
    div.innerHTML = `
        <div class="folder-header">
            <i data-lucide="chevron-right" class="folder-icon"></i>
            <span class="folder-title">${title}</span>
        </div>
        <div class="folder-content"></div>
    `;
    
    div.querySelector('.folder-header').onclick = (e) => {
        e.stopPropagation();
        div.classList.toggle('collapsed');
        lucide.createIcons();
    };
    
    return div;
}

function createStockItem(stock, index) {
    const li = document.createElement('li');
    li.className = `stock-item ${index === currentIndex ? 'active' : ''}`;
    li.dataset.index = index;
    li.onclick = (e) => {
        e.stopPropagation();
        selectStock(index);
    };
    
    li.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        contextTargetSymbol = stock.symbol;
        
        if (DOM.contextMenu) {
            DOM.contextMenu.style.left = `${e.pageX}px`;
            DOM.contextMenu.style.top = `${e.pageY}px`;
            DOM.contextMenu.classList.remove('hidden');
        }
    });
    
    li.innerHTML = `
        <div class="stock-item-left">
            <span class="stock-item-symbol">${stock.symbol.replace('.T', '')}</span>
            <span class="stock-item-name">${stock.name}</span>
            ${stock.remarks ? `<span class="stock-item-remarks">${stock.remarks}</span>` : ''}
        </div>
        <i data-lucide="chevron-right" style="color: var(--text-muted); width: 14px;"></i>
    `;
    return li;
}

function navigateStock(direction) {
    const newIndex = currentIndex + direction;
    if (newIndex >= 0 && newIndex < STOCKS.length) {
        selectStock(newIndex);
        
        // Ensure its parent folders are expanded
        const activeItem = DOM.list.querySelector(`.stock-item[data-index="${newIndex}"]`);
        if (activeItem) {
            let parent = activeItem.parentElement;
            while (parent && parent !== DOM.list) {
                if (parent.classList.contains('folder-item')) {
                    parent.classList.remove('collapsed');
                }
                parent = parent.parentElement;
            }
        }
    }
}

// Initialize Lightweight Charts
function resizeChart() {
    if (!chart) return;
    requestAnimationFrame(() => {
        const w = DOM.chartContainer.clientWidth;
        const h = DOM.chartContainer.clientHeight;
        if (w > 0 && h > 0) {
            chart.applyOptions({ width: w, height: h });
        }
    });
}

function initChart() {
    chart = LightweightCharts.createChart(DOM.chartContainer, {
        width: DOM.chartContainer.clientWidth,
        height: DOM.chartContainer.clientHeight,
        layout: {
            background: { type: 'solid', color: 'transparent' },
            textColor: '#94a3b8',
        },
        grid: {
            vertLines: { color: 'rgba(255, 255, 255, 0.05)' },
            horzLines: { color: 'rgba(255, 255, 255, 0.05)' },
        },
        crosshair: {
            mode: 0, // 0: Normal, 1: Magnet
        },
        rightPriceScale: {
            borderColor: 'rgba(255, 255, 255, 0.1)',
        },
        timeScale: {
            borderColor: 'rgba(255, 255, 255, 0.1)',
            timeVisible: false,
            rightOffset: 5,
        },
    });

    // 背景の縦線（月初め）用の特殊なヒストグラムシリーズ
    monthDelimiterSeries = chart.addHistogramSeries({
        color: 'rgba(255, 255, 255, 0.1)',
        priceScaleId: 'monthDelimiter', 
    });
    
    chart.priceScale('monthDelimiter').applyOptions({
        scaleMargins: {
            top: 0, 
            bottom: 0,
        },
        visible: false,
    });

    candleSeries = chart.addCandlestickSeries({
        upColor: '#10b981',
        downColor: '#f43f5e',
        borderDownColor: '#f43f5e',
        borderUpColor: '#10b981',
        wickDownColor: '#f43f5e',
        wickUpColor: '#10b981',
        priceFormat: {
            type: 'price',
            precision: 0,
            minMove: 1,
        }
    });

    volumeSeries = chart.addHistogramSeries({
        color: '#26a69a',
        priceFormat: { type: 'volume' },
        priceScaleId: 'volume', 
    });
    
    chart.priceScale('volume').applyOptions({
        scaleMargins: {
            top: 0.85, 
            bottom: 0,
        },
        visible: false, // 出来高用のメモリは非表示にする
    });
    
    // Init Overlays (MAs)
    const maConfig = [
        { period: 10, color: '#3b82f6' },
        { period: 20, color: '#a855f7' },
        { period: 30, color: '#ec4899' },
        { period: 75, color: '#f59e0b' },
        { period: 200, color: '#14b8a6' }
    ];
    
    maConfig.forEach(cfg => {
        lineSeriesMap[cfg.period] = chart.addLineSeries({
            color: cfg.color,
            lineWidth: 2,
            crosshairMarkerVisible: false,
            priceLineVisible: false,
        });
    });
}

// Select a stock and fetch data
async function selectStock(index) {
    currentIndex = index;
    updateActiveStockUI();
    
    const stock = STOCKS[currentIndex];
    if (!stock) return;

    // Show Loading
    DOM.loadingOverlay.classList.remove('hidden');
    
    try {
        await fetchStockData(stock);
    } catch (e) {
        console.error("Error fetching data:", e);
        if (DOM.name.textContent === "データを読み込んでいます...") {
            DOM.name.textContent = "データの取得に失敗しました";
        }
    } finally {
        DOM.loadingOverlay.classList.add('hidden');
    }
}

function updateActiveStockUI() {
    // Remove active class from all
    const items = DOM.list.querySelectorAll('.stock-item');
    items.forEach(item => item.classList.remove('active'));
    
    // Add to current
    const activeItem = DOM.list.querySelector(`.stock-item[data-index="${currentIndex}"]`);
    if (activeItem) {
        activeItem.classList.add('active');
        
        // Ensure its parent folders are expanded
        let parent = activeItem.parentElement;
        while (parent && parent !== DOM.list) {
            if (parent.classList.contains('folder-item')) {
                parent.classList.remove('collapsed');
            }
            parent = parent.parentElement;
        }
        
        // Scroll into view
        activeItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
}

// Fetch and process data
async function fetchStockData(stock) {
    DOM.symbol.textContent = stock.symbol.replace('.T', '');
    DOM.name.textContent = stock.name;
    
    // 期間に応じてインターバルを調整
    const isIntraday = currentRange === '1d';
    const interval = isIntraday ? '5m' : (currentRange === '10y' ? '1wk' : '1d');
    // --- 1. ヘッダー情報（最新価格、前日比）の取得 --- ローカルサーバーを使用
    try {
        const hUrl = `/api/yahoo?symbol=${encodeURIComponent(stock.symbol)}&range=1d&interval=1m`;
        const hResp = await fetch(hUrl);
        if (!hResp.ok) throw new Error("Header fetch failed");
        const headerData = await hResp.json();

        const hResult = headerData.chart?.result?.[0];
        if (hResult) {
            const hMeta = hResult.meta;
            
            // 市場価格の取得
            const price = hMeta.regularMarketPrice;
            if (price !== undefined && price !== null) {
                DOM.price.textContent = price.toLocaleString();
            }
            
            // 前日比の計算 (1dリクエストでは chartPreviousClose が確実な前日終値)
            const prevClose = hMeta.regularMarketPreviousClose || hMeta.chartPreviousClose || hMeta.previousClose;
            if (price !== undefined && price !== null && prevClose !== undefined && prevClose !== null) {
                const change = price - prevClose;
                const changePercent = prevClose !== 0 ? (change / prevClose) * 100 : 0;
                
                const isUp = change >= 0;
                DOM.change.className = `price-change ${isUp ? 'positive' : 'negative'}`;
                DOM.changeIcon.setAttribute('data-lucide', isUp ? 'trending-up' : 'trending-down');
                DOM.changeValue.textContent = `${isUp ? '+' : ''}${change.toFixed(1)} (${isUp ? '+' : ''}${changePercent.toFixed(2)}%)`;
            }

            // 時刻の更新
            const updateTimeMs = hMeta.regularMarketTime ? hMeta.regularMarketTime * 1000 : Date.now();
            const updateDate = new Date(updateTimeMs);
            const m = (updateDate.getMonth()+1).toString().padStart(2, '0');
            const d = updateDate.getDate().toString().padStart(2, '0');
            const h = updateDate.getHours().toString().padStart(2, '0');
            const min = updateDate.getMinutes().toString().padStart(2, '0');
            DOM.time.textContent = `${updateDate.getFullYear()}/${m}/${d} ${h}:${min}`;
            
            // 銘柄名を最新のものに更新
            const fetchedName = hMeta.longName || hMeta.shortName || stock.name;
            if (fetchedName && fetchedName !== stock.originalName) {
                DOM.name.textContent = `${stock.originalName} (${fetchedName})`;
            }

            lucide.createIcons();
        }
    } catch (e) {
        console.error("Error fetching header data:", e);
    }

    // --- 2. チャートデータの取得 --- ローカルサーバーを使用
    // 1dで既にヘッダー用と同じデータの場合は再利用を検討するが、intervalが違うので別途取得
    const localUrl = `/api/yahoo?symbol=${encodeURIComponent(stock.symbol)}&range=${currentRange}&interval=${interval}`;
    const response = await fetch(localUrl);
    if (!response.ok) throw new Error(`サーバーが起動していないか、接続できませんでした (${response.status})`);
    const data = await response.json();
    
    const result = data.chart?.result?.[0];
    if (!result) throw new Error("No data found");
    
    const timestamps = result.timestamp || [];
    const quotes = result.indicators.quote[0];
    
    const chartData = [];
    const volumeData = [];
    const delimiterData = [];
    const seenTimes = new Set();
    
    let prevMonth = -1;
    let prevYear = -1;
    let prevHour = -1;
    
    // イントラデイの場合はtimeVisibleを有効化
    chart.applyOptions({
        timeScale: {
            timeVisible: isIntraday,
            secondsVisible: false,
            rightOffset: 5,
        }
    });
    
    for (let i = 0; i < timestamps.length; i++) {
        if (quotes.open[i] === null || quotes.close[i] === null) continue;
        
        const date = new Date(timestamps[i] * 1000);
        
        let timeValue;
        let dedupeKey;
        
        if (isIntraday) {
            // イントラデイ: UNIXタイムスタンプ（秒）を使用
            timeValue = timestamps[i];
            dedupeKey = timestamps[i].toString();
        } else {
            // 日足/週足: 日付文字列を使用
            timeValue = `${date.getFullYear()}-${(date.getMonth()+1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`;
            dedupeKey = timeValue;
        }
        
        if (seenTimes.has(dedupeKey)) continue;
        seenTimes.add(dedupeKey);
        
        const currentMonth = date.getMonth();
        const currentYear = date.getFullYear();
        const currentHour = date.getHours();
        let isFirstDayOfMonth = false;
        let isFirstDayOfYear = false;
        let isHourChange = false;
        
        if (isIntraday) {
            if (prevHour !== -1 && currentHour !== prevHour) {
                isHourChange = true;
            }
            prevHour = currentHour;
        } else {
            if (prevMonth !== -1 && currentMonth !== prevMonth) {
                isFirstDayOfMonth = true;
                if (prevYear !== -1 && currentYear !== prevYear) {
                    isFirstDayOfYear = true;
                }
            }
            prevMonth = currentMonth;
            prevYear = currentYear;
        }
        
        chartData.push({
            time: timeValue,
            open: quotes.open[i],
            high: quotes.high[i],
            low: quotes.low[i],
            close: quotes.close[i],
        });
        
        volumeData.push({
            time: timeValue,
            value: quotes.volume[i] || 0,
            color: quotes.close[i] >= quotes.open[i] ? 'rgba(16, 185, 129, 0.5)' : 'rgba(244, 63, 94, 0.5)'
        });
        
        let delimiterValue = 0;
        if (isIntraday) {
            if (isHourChange) delimiterValue = 1;
        } else if (interval === '1d') {
            if (isFirstDayOfMonth) delimiterValue = 1;
        } else {
            if (isFirstDayOfYear) delimiterValue = 1;
        }

        delimiterData.push({
            time: timeValue,
            value: delimiterValue,
            color: isIntraday
                ? 'rgba(255, 255, 255, 0.15)'
                : (isFirstDayOfYear ? 'rgba(255, 255, 255, 0.8)' : 'rgba(255, 255, 255, 0.15)')
        });
    }
    
    monthDelimiterSeries.setData(delimiterData);
    candleSeries.setData(chartData);
    volumeSeries.setData(volumeData);
    
    const closePrices = chartData.map(d => ({ time: d.time, close: d.close }));
    
    const maResults = {};
    [10, 20, 30, 75, 200].forEach(period => {
        const maData = calculateSMA(closePrices, period);
        maResults[period] = maData;
        lineSeriesMap[period].setData(maData);
    });
    
    // MA10/MA20 クロスオーバー検出 → マーカー表示
    const markers = detectCrossovers(maResults[10], maResults[20]);
    candleSeries.setMarkers(markers);
    
    chart.timeScale().fitContent();
}


function calculateSMA(data, period) {
    const result = [];
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
        sum += data[i].close;
        if (i >= period - 1) {
            result.push({
                time: data[i].time,
                value: sum / period
            });
            sum -= data[i - period + 1].close;
        }
    }
    return result;
}

// MA10/MA20 クロスオーバー検出
function detectCrossovers(ma10Data, ma20Data) {
    const markers = [];
    if (!ma10Data || !ma20Data || ma10Data.length < 2 || ma20Data.length < 2) return markers;
    
    // MA20のデータをMap化して高速検索
    const ma20Map = new Map();
    ma20Data.forEach(d => {
        const key = typeof d.time === 'number' ? d.time : d.time;
        ma20Map.set(JSON.stringify(key), d.value);
    });
    
    // MA10のデータで、同じ時間にMA20の値がある部分だけ比較
    const aligned = [];
    ma10Data.forEach(d => {
        const key = JSON.stringify(typeof d.time === 'number' ? d.time : d.time);
        if (ma20Map.has(key)) {
            aligned.push({
                time: d.time,
                ma10: d.value,
                ma20: ma20Map.get(key)
            });
        }
    });
    
    for (let i = 1; i < aligned.length; i++) {
        const prev = aligned[i - 1];
        const curr = aligned[i];
        
        const prevDiff = prev.ma10 - prev.ma20;
        const currDiff = curr.ma10 - curr.ma20;
        
        if (prevDiff <= 0 && currDiff > 0) {
            // ゴールデンクロス: MA10がMA20を上抜け
            markers.push({
                time: curr.time,
                position: 'belowBar',
                color: '#10b981',
                shape: 'arrowUp',
                text: 'GC'
            });
        } else if (prevDiff >= 0 && currDiff < 0) {
            // デッドクロス: MA10がMA20を下抜け
            markers.push({
                time: curr.time,
                position: 'aboveBar',
                color: '#f43f5e',
                shape: 'arrowDown',
                text: 'DC'
            });
        }
    }
    
    return markers;
}

// Change the time range and refresh
async function setRange(range) {
    currentRange = range;
    
    // Update active tab UI
    if (DOM.rangeBtns) {
        DOM.rangeBtns.forEach(btn => {
            btn.classList.toggle('active', btn.getAttribute('data-range') === range);
        });
    }
    
    // Reload current stock data with new range
    const stock = STOCKS[currentIndex];
    if (!stock) return;

    DOM.loadingOverlay.classList.remove('hidden');
    try {
        await fetchStockData(stock);
    } catch (e) {
        console.error("Error refreshing range data:", e);
    } finally {
        DOM.loadingOverlay.classList.add('hidden');
    }
}


function initSidebarResizer() {
    const { sidebar, resizer } = DOM;
    if (!sidebar || !resizer) return;

    let isResizing = false;

    // Load saved width
    const savedWidth = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    if (savedWidth) {
        sidebar.style.width = savedWidth + 'px';
    }

    resizer.addEventListener('mousedown', (e) => {
        isResizing = true;
        resizer.classList.add('active');
        document.body.classList.add('resizing');
    });

    document.addEventListener('mousemove', (e) => {
        if (!isResizing) return;

        let newWidth = e.clientX;
        if (newWidth < 200) newWidth = 200;

        sidebar.style.width = newWidth + 'px';
        
        // ResizeObserverが自動検知するため手動リサイズ不要
    });

    document.addEventListener('mouseup', () => {
        if (!isResizing) return;
        isResizing = false;
        resizer.classList.remove('active');
        document.body.classList.remove('resizing');
        localStorage.setItem(SIDEBAR_WIDTH_KEY, sidebar.offsetWidth);
    });
}

// ---------------- 条件検索 (Golden Cross) ----------------
async function startGCSearch() {
    if (isSearching) return;
    isSearching = true;
    DOM.runGCBtn.disabled = true;
    DOM.searchProgressArea.classList.remove('hidden');
    
    // Get unique symbols to avoid searching the same stock multiple times
    const uniqueSymbols = [...new Set(STOCKS.map(s => s.symbol))];
    let total = uniqueSymbols.length;
    let processed = 0;
    
    let foundStocks = [];
    
    // Yahoo Spark API の上限は1リクエストにつき最大20銘柄まで
    const chunkSize = 20;
    
    for (let i = 0; i < total; i += chunkSize) {
        const chunkSymbols = uniqueSymbols.slice(i, i + chunkSize);
        const symbolsStr = chunkSymbols.map(s => encodeURIComponent(s)).join(',');
        
        try {
            const url = `/api/yahoo-spark?symbols=${symbolsStr}&range=2y&interval=1d`;
            const resp = await fetch(url);
            if (!resp.ok) throw new Error(`Spark API failed: ${resp.status}`);
            
            const data = await resp.json();
            
            let resultsObj = {};
            if (data && data.spark && data.spark.result) {
               data.spark.result.forEach(r => {
                   resultsObj[r.symbol] = r;
               });
            }
            
            for (let targetSymbol of chunkSymbols) {
                const stockData = resultsObj[targetSymbol];
                if (stockData && stockData.response && stockData.response[0] && stockData.response[0].indicators) {
                    const quotes = stockData.response[0].indicators.quote[0];
                    if (quotes && quotes.close) {
                        const closeData = quotes.close;
                        let timePrices = [];
                        for (let j = 0; j < closeData.length; j++) {
                            if (closeData[j] !== null) timePrices.push({ close: closeData[j], time: j });
                        }
                        
                        if (timePrices.length > 76) {
                            const ma10 = calculateSMA(timePrices, 10);
                            const ma20 = calculateSMA(timePrices, 20);
                            const ma75 = calculateSMA(timePrices, 75);
                            
                            if (ma10.length >= 2 && ma20.length >= 2 && ma75.length >= 2) {
                                // 0=本日, 1=昨日, 2=2日前...30=30日前 まで判定
                                for (let n = 0; n <= 30; n++) {
                                    if (ma10.length >= 2 + n && ma20.length >= 2 + n && ma75.length >= 2 + n) {
                                        const curr10 = ma10[ma10.length - 1 - n].value;
                                        const prev10 = ma10[ma10.length - 2 - n].value;
                                        const curr20 = ma20[ma20.length - 1 - n].value;
                                        const prev20 = ma20[ma20.length - 2 - n].value;
                                        const curr75 = ma75[ma75.length - 1 - n].value;
                                        const prev75 = ma75[ma75.length - 2 - n].value;
                                        
                                        if (prev10 <= prev20 && curr10 > curr20 && curr10 > prev10 && curr75 >= prev75) {
                                            const orig = STOCKS.find(s => s.symbol === targetSymbol);
                                            if (orig) {
                                                // コピーして何日前のGCかのフラグを持たせる
                                                foundStocks.push({ 
                                                    ...orig,
                                                    gcDayOffset: n
                                                });
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
                
                processed++;
                DOM.searchCountText.textContent = `${processed} / ${total}`;
                DOM.searchProgressBar.style.width = `${(processed / total) * 100}%`;
                
                if (processed % parseInt(total / 10 || 1) === 0) {
                   DOM.searchStatusText.textContent = "抽出中...";
                }
            }
            
            // APIアクセス制限(Too Many Requests)回避のため、少し待機する
            await new Promise(resolve => setTimeout(resolve, 20));
            
        } catch (e) {
            console.error("Chunk processing error", e);
            processed += chunkSymbols.length;
            DOM.searchCountText.textContent = `${processed} / ${total}`;
            DOM.searchProgressBar.style.width = `${(processed / total) * 100}%`;
            
            // エラー時も少し待機する
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }
    
    DOM.searchStatusText.textContent = `完了`;
    isSearching = false;
    DOM.runGCBtn.disabled = false;
    
    if (foundStocks.length > 0) {
        addSearchResultsToTree(foundStocks);
    } else {
        alert(`抽出が完了しましたが、条件に一致する銘柄はありませんでした。`);
    }
}

// ---------------- バックテスト ----------------
let isBacktesting = false;

async function startBacktest() {
    if (isBacktesting) return;
    isBacktesting = true;
    DOM.runBacktestBtn.disabled = true;
    DOM.backtestProgressArea.classList.remove('hidden');
    DOM.backtestResults.classList.add('hidden');
    DOM.backtestStatusText.textContent = '集計中...';
    DOM.backtestProgressBar.style.width = '0%';

    const uniqueSymbols = [...new Set(STOCKS.map(s => s.symbol))];
    const total = uniqueSymbols.length;
    let processed = 0;
    const chunkSize = 20;
    const trades = [];

    for (let i = 0; i < total; i += chunkSize) {
        const chunkSymbols = uniqueSymbols.slice(i, i + chunkSize);
        const symbolsStr = chunkSymbols.map(s => encodeURIComponent(s)).join(',');

        try {
            const resp = await fetch(`/api/yahoo-spark?symbols=${symbolsStr}&range=2y&interval=1d`);
            if (!resp.ok) throw new Error(`Spark API ${resp.status}`);
            const data = await resp.json();

            let resultsObj = {};
            if (data?.spark?.result) {
                data.spark.result.forEach(r => { resultsObj[r.symbol] = r; });
            }

            for (let sym of chunkSymbols) {
                const stockData = resultsObj[sym];
                if (stockData?.response?.[0]?.indicators) {
                    const quotes = stockData.response[0].indicators.quote[0];
                    if (quotes?.close) {
                        const closeData = quotes.close.filter(v => v !== null);

                        if (closeData.length > 80) {
                            const allPrices = closeData.map((c, idx) => ({ close: c, time: idx }));
                            const ma10 = calculateSMA(allPrices, 10);
                            const ma20 = calculateSMA(allPrices, 20);
                            const ma75 = calculateSMA(allPrices, 75);

                            // 直近30取引日かつ5日後データが存在する範囲を走査
                            const scanEnd   = allPrices.length - 6;
                            const scanStart = Math.max(0, scanEnd - 30);

                            for (let d = scanStart; d <= scanEnd; d++) {
                                const i10 = d - 9;
                                const i20 = d - 19;
                                const i75 = d - 74;
                                if (i10 < 1 || i20 < 1 || i75 < 1) continue;

                                const curr10 = ma10[i10].value, prev10 = ma10[i10 - 1].value;
                                const curr20 = ma20[i20].value, prev20 = ma20[i20 - 1].value;
                                const curr75 = ma75[i75].value, prev75 = ma75[i75 - 1].value;

                                if (prev10 <= prev20 && curr10 > curr20 && curr10 > prev10 && curr75 >= prev75) {
                                    const entry = allPrices[d].close;
                                    const exit  = allPrices[d + 5].close;
                                    trades.push({ ret: (exit - entry) / entry * 100 });
                                }
                            }
                        }
                    }
                }
                processed++;
                DOM.backtestCountText.textContent = `${processed} / ${total}`;
                DOM.backtestProgressBar.style.width = `${(processed / total) * 100}%`;
            }

            await new Promise(r => setTimeout(r, 20));
        } catch (e) {
            console.error('Backtest chunk error', e);
            processed += chunkSymbols.length;
            await new Promise(r => setTimeout(r, 2000));
        }
    }

    isBacktesting = false;
    DOM.runBacktestBtn.disabled = false;
    DOM.backtestStatusText.textContent = '完了';

    if (trades.length === 0) {
        alert('直近30取引日にシグナルが発生した銘柄が見つかりませんでした。');
        DOM.backtestProgressArea.classList.add('hidden');
    } else {
        const wins    = trades.filter(t => t.ret > 0).length;
        const winRate = (wins / trades.length * 100).toFixed(1);
        const avgRet  = (trades.reduce((s, t) => s + t.ret, 0) / trades.length).toFixed(2);
        const sorted  = [...trades].sort((a, b) => a.ret - b.ret);
        const mid     = Math.floor(sorted.length / 2);
        const median  = (sorted.length % 2 === 0
            ? (sorted[mid - 1].ret + sorted[mid].ret) / 2
            : sorted[mid].ret).toFixed(2);

        DOM.btSampleCount.textContent  = `${trades.length}件`;
        DOM.btSampleCount.className    = 'backtest-value neutral';
        DOM.btWinRate.textContent      = `${winRate}%`;
        DOM.btWinRate.className        = `backtest-value ${parseFloat(winRate) >= 50 ? 'positive' : 'negative'}`;
        DOM.btAvgReturn.textContent    = `${avgRet > 0 ? '+' : ''}${avgRet}%`;
        DOM.btAvgReturn.className      = `backtest-value ${parseFloat(avgRet) >= 0 ? 'positive' : 'negative'}`;
        DOM.btMedianReturn.textContent = `${median > 0 ? '+' : ''}${median}%`;
        DOM.btMedianReturn.className   = `backtest-value ${parseFloat(median) >= 0 ? 'positive' : 'negative'}`;

        DOM.backtestResults.classList.remove('hidden');
    }
}

function addSearchResultsToTree(foundStocks) {
    const searchMajor = '🔎 抽出結果';
    
    if (!TREE_DATA[searchMajor]) {
        TREE_DATA[searchMajor] = {};
    } else {
        // 古い中分類を削除（GCから始まるもの）
        Object.keys(TREE_DATA[searchMajor]).forEach(key => {
            if (key.includes('GC（2年）')) {
                delete TREE_DATA[searchMajor][key];
            }
        });
    }
    
    // STOCKS上の古い抽出結果（同じ種類のラベルのもの）を削除
    STOCKS = STOCKS.filter(s => !(s.major === searchMajor && s.middle && s.middle.includes('GC（2年）')));
    
    let messageList = [];
    
    for (let n = 0; n <= 30; n++) {
        const dayStocks = foundStocks.filter(s => s.gcDayOffset === n);
        
        let dayName = n === 0 ? '本日' : (n === 1 ? '昨日' : `${n}日前`);
        const searchMiddle = `${dayName}GC（2年）(${dayStocks.length}件)`;
        
        messageList.push(`${dayName}: ${dayStocks.length}件`);
        
        // 0件でもフォルダを作る
        TREE_DATA[searchMajor][searchMiddle] = [];
        
        dayStocks.forEach(stock => {
            stock.major = searchMajor;
            stock.middle = searchMiddle;
            STOCKS.push(stock);
            TREE_DATA[searchMajor][searchMiddle].push(stock);
        });
    }
    
    DOM.searchStatusText.textContent = `完了: 計${foundStocks.length}件抽出`;
    alert(`抽出が完了しました！\n\n【抽出内訳】\n${messageList.join('\n')}`);
    
    renderSidebar();
    
    // 抽出追加後に該当フォルダを展開する
    setTimeout(() => {
        const folders = DOM.list.querySelectorAll('.major-folder');
        folders.forEach(f => {
            const title = f.querySelector('.folder-title').textContent;
            if (title === searchMajor) {
                f.classList.remove('collapsed');
                const midFolders = f.querySelectorAll('.middle-folder');
                midFolders.forEach(mf => {
                    const mTitle = mf.querySelector('.folder-title').textContent;
                    if (mTitle === searchMiddle) {
                        mf.classList.remove('collapsed');
                    }
                });
            }
        });
        lucide.createIcons();
    }, 100);
}

// ---------------- 東証全銘柄 (JPX) 取得 ----------------
async function fetchJpxStocks() {
    try {
        DOM.fetchJpxBtn.disabled = true;
        DOM.jpxStatus.innerHTML = '<span class="status-msg">データ取得中... (数秒かかります)</span>';
        
        const response = await fetch('/api/jpx-excel');
        if (!response.ok) throw new Error("JPX エクセルのダウンロードに失敗しました");
        
        const arrayBuffer = await response.arrayBuffer();
        // SheetJS (XLSX) must be loaded in index.html
        const workbook = XLSX.read(arrayBuffer, { type: 'array' });
        
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        
        const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        let codeIdx = -1, nameIdx = -1, marketIdx = -1, sectorIdx = -1;
        
        // Find header row
        for (let i = 0; i < 5; i++) {
            if (!rows[i]) continue;
            const rowStr = rows[i].join('');
            if (rowStr.includes('コード') && rowStr.includes('銘柄名')) {
                codeIdx = rows[i].indexOf('コード');
                nameIdx = rows[i].indexOf('銘柄名');
                marketIdx = rows[i].indexOf('市場・商品区分');
                sectorIdx = rows[i].indexOf('33業種区分');
                break;
            }
        }
        
        if (codeIdx === -1) throw new Error("JPXエクセルの形式が想定と異なります。");
        
        const targetFolderMajor = '東証全銘柄一覧';
        
        // Remove old JPX stocks from STOCKS
        STOCKS = STOCKS.filter(s => s.major !== targetFolderMajor);
        
        if (TREE_DATA[targetFolderMajor]) {
            delete TREE_DATA[targetFolderMajor];
        }
        TREE_DATA[targetFolderMajor] = {};
        
        let addedCount = 0;
        
        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            if (!row || row.length <= Math.max(codeIdx, nameIdx)) continue;
            
            const code = row[codeIdx];
            const name = row[nameIdx];
            const market = marketIdx !== -1 ? row[marketIdx] : '';
            let sector = sectorIdx !== -1 ? row[sectorIdx] : '';
            
            // Check if it's a valid stock code (4 digits + optional char)
            if (code && String(code).match(/^[0-9]{4}[A-Z]?$/)) {
                if (market && (market.includes('プライム') || market.includes('スタンダード') || market.includes('グロース'))) {
                    let middle = sector || 'その他';
                    if (middle === '-' || middle === '') middle = market;
                    
                    const symbol = String(code) + '.T';
                    const newStock = {
                        symbol: symbol,
                        name: String(name),
                        originalName: String(name),
                        remarks: String(market),
                        major: targetFolderMajor,
                        middle: String(middle)
                    };
                    
                    STOCKS.push(newStock);
                    if (!TREE_DATA[targetFolderMajor][middle]) TREE_DATA[targetFolderMajor][middle] = [];
                    TREE_DATA[targetFolderMajor][middle].push(newStock);
                    addedCount++;
                }
            }
        }
        
        if (addedCount === 0) throw new Error("対象の銘柄が見つかりませんでした。");
        
        // Save to localStorage dynamically
        saveToLocal();
        
        renderSidebar();
        DOM.jpxStatus.innerHTML = `<span class="status-msg success">${addedCount}件の東証銘柄を追加・更新しました！</span>`;
        
    } catch (e) {
        console.error(e);
        DOM.jpxStatus.innerHTML = `<span class="status-msg error">エラー: ${e.message}</span>`;
    } finally {
        DOM.fetchJpxBtn.disabled = false;
    }
}

init();
