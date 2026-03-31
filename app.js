const STOCKS = [
    { symbol: '7203.T', name: 'トヨタ自動車' },
    { symbol: '9984.T', name: 'ソフトバンクグループ' },
    { symbol: '8306.T', name: '三菱UFJフィナンシャルG' },
    { symbol: '6758.T', name: 'ソニーグループ' },
    { symbol: '6861.T', name: 'キーエンス' },
    { symbol: '8035.T', name: '東京エレクトロン' },
    { symbol: '9432.T', name: '日本電信電話 (NTT)' },
    { symbol: '9983.T', name: 'ファーストリテイリング' },
    { symbol: '4063.T', name: '信越化学工業' },
    { symbol: '8058.T', name: '三菱商事' }
];

let currentIndex = 0;
let chart = null;
let candleSeries = null;
let volumeSeries = null;
let monthDelimiterSeries = null;
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
    addStockInput: document.getElementById('addStockInput'),
    addStockBtn: document.getElementById('addStockBtn')
};

// Initialize app
function init() {
    try {
        lucide.createIcons();
        renderSidebar();
        initChart();
        
        // Initial fetch
        selectStock(currentIndex);
        
        // Add Stock Events
        DOM.addStockBtn.addEventListener('click', handleAddStock);
        DOM.addStockInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') handleAddStock();
        });

        // Keyboard navigation
        document.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowUp') {
                e.preventDefault();
                if (currentIndex > 0) selectStock(currentIndex - 1);
            } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                if (currentIndex < STOCKS.length - 1) selectStock(currentIndex + 1);
            }
        });

        // Handle window resize
        window.addEventListener('resize', () => {
            if (chart) {
                chart.applyOptions({
                    width: DOM.chartContainer.clientWidth,
                    height: DOM.chartContainer.clientHeight
                });
            }
        });
    } catch (e) {
        document.body.innerHTML = `<div style="color:red; background:white; padding: 20px; font-size: 20px; z-index: 9999; position: absolute; top:0; left:0; right:0; bottom:0; padding:100px;">INIT CRASH: ${e.message}<br/><br/><pre style="white-space: pre-wrap;">${e.stack}</pre></div>`;
        console.error(e);
    }
}

// Render Sidebar List
function renderSidebar() {
    DOM.list.innerHTML = '';
    STOCKS.forEach((stock, index) => {
        const li = document.createElement('li');
        li.className = `stock-item ${index === currentIndex ? 'active' : ''}`;
        li.onclick = () => selectStock(index);
        
        li.innerHTML = `
            <div class="stock-item-left">
                <span class="stock-item-symbol">${stock.symbol.replace('.T', '')}</span>
                <span class="stock-item-name">${stock.name}</span>
            </div>
            <i data-lucide="chevron-right" style="color: var(--text-muted); width: 16px;"></i>
        `;
        DOM.list.appendChild(li);
    });
    lucide.createIcons();
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
    renderSidebar(); // Update active state
    
    // Make sure the active item is visible
    const activeItem = DOM.list.children[index];
    if (activeItem) {
        activeItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    const stock = STOCKS[currentIndex];
    
    // Show Loading
    DOM.loadingOverlay.classList.remove('hidden');
    
    try {
        await fetchStockData(stock);
    } catch (e) {
        console.error("Error fetching data:", e);
        DOM.name.textContent = "データの取得に失敗しました";
    } finally {
        DOM.loadingOverlay.classList.add('hidden');
    }
}

// Fetch and process data
async function fetchStockData(stock) {
    const yfUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${stock.symbol}?interval=1d&range=2y`;
    const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(yfUrl)}`;
    
    const response = await fetch(proxyUrl);
    if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
    const resultData = await response.json();
    const data = JSON.parse(resultData.contents);
    
    const result = data.chart?.result?.[0];
    if (!result) throw new Error("No data found");
    
    const meta = result.meta;
    const price = meta.regularMarketPrice;
    
    // Yahoo API may return prev close under different properties depending on the endpoint/time
    const prevClose = meta.regularMarketPreviousClose || meta.chartPreviousClose || meta.previousClose || price;
    
    const change = price - prevClose;
    const changePercent = prevClose !== 0 ? (change / prevClose) * 100 : 0;
    
    DOM.symbol.textContent = stock.symbol.replace('.T', '');
    stock.name = meta.longName || meta.shortName || stock.name; // 最新の名前に上書き
    DOM.name.textContent = stock.name;
    DOM.price.textContent = price.toLocaleString();
    renderSidebar(); // 名前が更新された可能性があるのでリストを再描画
    
    const isUp = change >= 0;
    DOM.change.className = `price-change ${isUp ? 'positive' : 'negative'}`;
    DOM.changeIcon.setAttribute('data-lucide', isUp ? 'trending-up' : 'trending-down');
    DOM.changeValue.textContent = `${isUp ? '+' : ''}${change.toFixed(1)} (${isUp ? '+' : ''}${changePercent.toFixed(2)}%)`;
    
    // Format timestamp
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
        
        delimiterData.push({
            time: timeStr,
            value: isFirstDayOfMonth ? 1 : 0,
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

function handleAddStock() {
    const code = DOM.addStockInput.value.trim();
    if (!code) return;
    
    // .Tがなければ自動付与（日本株のデフォルト）
    const symbol = code.includes('.') ? code.toUpperCase() : code + '.T';
    
    // 重複チェック
    const existingIndex = STOCKS.findIndex(s => s.symbol === symbol);
    if (existingIndex !== -1) {
        selectStock(existingIndex);
        DOM.addStockInput.value = '';
        return;
    }
    
    // リストに追加して選択
    STOCKS.push({ symbol: symbol, name: '検索中...' });
    const newIndex = STOCKS.length - 1;
    selectStock(newIndex);
    DOM.addStockInput.value = '';
}

init();
