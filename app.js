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
    importStatus: document.getElementById('importStatus')
};

const STORAGE_KEY = 'stock_viewer_custom_data';

// Initialize app
async function init() {
    try {
        lucide.createIcons();
        initChart();
        
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
        
        // Keyboard navigation
        document.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowUp') {
                e.preventDefault();
                navigateStock(-1);
            } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                navigateStock(1);
            } else if (e.key === 'Escape') {
                DOM.settingsModal.classList.add('hidden');
            }
        });

        window.addEventListener('resize', () => {
            if (chart) {
                chart.applyOptions({
                    width: DOM.chartContainer.clientWidth,
                    height: DOM.chartContainer.clientHeight
                });
            }
        });

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
        
        const symbol = code.includes('.') ? code : code + '.T';
        const stock = { 
            symbol, 
            name, 
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

function renderSidebar() {
    DOM.list.innerHTML = '';
    
    Object.keys(TREE_DATA).forEach((major, majIdx) => {
        const majorFolder = createFolder(major, 'major-folder');
        const majorContent = majorFolder.querySelector('.folder-content');
        
        // Default: first major folder open, others closed
        if (majIdx !== 0) majorFolder.classList.add('collapsed');
        
        Object.keys(TREE_DATA[major]).forEach(middle => {
            const middleFolder = createFolder(middle, 'middle-folder');
            const middleContent = middleFolder.querySelector('.folder-content');
            
            // Default: middle folders closed
            middleFolder.classList.add('collapsed');
            
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
    
    // 期間に応じてインターバルを調整 (10年は週足に修正: 1moより詳細で1dより高速)
    const interval = currentRange === '10y' ? '1wk' : '1d';
    
    // 外部プロキシ(allorigins)を廃止し、ローカルプロキシ(/api/yahoo)を直接使用
    const localUrl = `/api/yahoo?symbol=${encodeURIComponent(stock.symbol)}&range=${currentRange}&interval=${interval}`;
    
    const response = await fetch(localUrl);
    if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
    const data = await response.json();
    
    const result = data.chart?.result?.[0];
    if (!result) throw new Error("No data found");
    
    const meta = result.meta;
    
    // 銘柄名を最新のものに更新
    stock.name = meta.longName || meta.shortName || stock.name;
    DOM.name.textContent = stock.name;
    
    // Update name in sidebar item
    const item = DOM.list.querySelector(`.stock-item[data-index="${STOCKS.indexOf(stock)}"] .stock-item-name`);
    if (item) item.textContent = stock.name;

    // 市場価格の取得と成形
    const price = meta.regularMarketPrice;
    if (price !== undefined && price !== null) {
        DOM.price.textContent = price.toLocaleString();
    }
    
    // 前日比の計算
    const prevClose = meta.regularMarketPreviousClose || meta.chartPreviousClose || meta.previousClose;
    if (price !== undefined && price !== null && prevClose !== undefined && prevClose !== null) {
        const change = price - prevClose;
        const changePercent = prevClose !== 0 ? (change / prevClose) * 100 : 0;
        
        const isUp = change >= 0;
        DOM.change.className = `price-change ${isUp ? 'positive' : 'negative'}`;
        DOM.changeIcon.setAttribute('data-lucide', isUp ? 'trending-up' : 'trending-down');
        DOM.changeValue.textContent = `${isUp ? '+' : ''}${change.toFixed(1)} (${isUp ? '+' : ''}${changePercent.toFixed(2)}%)`;
    }
    
    // 時刻の更新
    const updateTimeMs = meta.regularMarketTime ? meta.regularMarketTime * 1000 : Date.now();
    const updateDate = new Date(updateTimeMs);
    const m = (updateDate.getMonth()+1).toString().padStart(2, '0');
    const d = updateDate.getDate().toString().padStart(2, '0');
    const h = updateDate.getHours().toString().padStart(2, '0');
    const min = updateDate.getMinutes().toString().padStart(2, '0');
    DOM.time.textContent = `${updateDate.getFullYear()}/${m}/${d} ${h}:${min}`;
    
    lucide.createIcons();
    
    const timestamps = result.timestamp || [];
    const quotes = result.indicators.quote[0];
    
    const chartData = [];
    const volumeData = [];
    const delimiterData = [];
    const seenTimes = new Set();
    
    let prevMonth = -1;
    let prevYear = -1;
    
    for (let i = 0; i < timestamps.length; i++) {
        if (quotes.open[i] === null || quotes.close[i] === null) continue;
        
        const date = new Date(timestamps[i] * 1000);
        const timeStr = `${date.getFullYear()}-${(date.getMonth()+1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`;
        
        if (seenTimes.has(timeStr)) continue;
        seenTimes.add(timeStr);
        
        const currentMonth = date.getMonth();
        const currentYear = date.getFullYear();
        let isFirstDayOfMonth = false;
        let isFirstDayOfYear = false;
        
        if (prevMonth !== -1 && currentMonth !== prevMonth) {
            isFirstDayOfMonth = true;
            if (prevYear !== -1 && currentYear !== prevYear) {
                isFirstDayOfYear = true;
            }
        }
        prevMonth = currentMonth;
        prevYear = currentYear;
        
        chartData.push({
            time: timeStr,
            open: quotes.open[i],
            high: quotes.high[i],
            low: quotes.low[i],
            close: quotes.close[i],
        });
        
        volumeData.push({
            time: timeStr,
            value: quotes.volume[i] || 0,
            color: quotes.close[i] >= quotes.open[i] ? 'rgba(16, 185, 129, 0.5)' : 'rgba(244, 63, 94, 0.5)'
        });
        
        let delimiterValue = 0;
        if (interval === '1d') {
            if (isFirstDayOfMonth) delimiterValue = 1;
        } else {
            // 週足や月足などの長期チャートでは、年の切り替わり目のみを表示
            if (isFirstDayOfYear) delimiterValue = 1;
        }

        delimiterData.push({
            time: timeStr,
            value: delimiterValue,
            color: isFirstDayOfYear ? 'rgba(255, 255, 255, 0.8)' : 'rgba(255, 255, 255, 0.15)'
        });
    }
    
    monthDelimiterSeries.setData(delimiterData);
    candleSeries.setData(chartData);
    volumeSeries.setData(volumeData);
    
    const closePrices = chartData.map(d => ({ time: d.time, close: d.close }));
    
    [10, 20, 30, 75, 200].forEach(period => {
        const maData = calculateSMA(closePrices, period);
        lineSeriesMap[period].setData(maData);
    });
    
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


init();
