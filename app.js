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
    favoriteList: document.getElementById('favoriteList'),
    verticalResizer: document.getElementById('verticalResizer'),
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
    ctxRealFavorite: document.getElementById('ctxRealFavorite'),
    ctxCheckMark: document.getElementById('ctxCheckMark'),
    ctxEditRemark: document.getElementById('ctxEditRemark'),
    ctxYahoo: document.getElementById('ctxYahoo'),
    ctxNikkei: document.getElementById('ctxNikkei'),
    ctxKabutan: document.getElementById('ctxKabutan'),
    ctxKabuyoho: document.getElementById('ctxKabuyoho'),
    ctxBuffettCode: document.getElementById('ctxBuffettCode'),
    ctxAiPrompt: document.getElementById('ctxAiPrompt'),
    ctxDelete: document.getElementById('ctxDelete'),
    ctxSendToFolder: document.getElementById('ctxSendToFolder'),
    ctxMoveToFolder: document.getElementById('ctxMoveToFolder'),
    folderSendSubMenu: document.getElementById('folderSendSubMenu'),
    middleSendSubMenu: document.getElementById('middleSendSubMenu'),
    folderContextMenu: document.getElementById('folderContextMenu'),
    ctxFolderCreate: document.getElementById('ctxFolderCreate'),
    ctxMajorFolderCreate: document.getElementById('ctxMajorFolderCreate'),
    ctxFolderRename: document.getElementById('ctxFolderRename'),
    ctxFolderDelete: document.getElementById('ctxFolderDelete'),
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
    btMedianReturn: document.getElementById('btMedianReturn'),
    // Quick Search
    quickSearchInput: document.getElementById('quickSearchInput'),
    quickSearchBtn: document.getElementById('quickSearchBtn'),
    // Settings & Toggles
    autoCopyToggle: document.getElementById('autoCopyToggle'),
    openFinanceBtn: document.getElementById('openFinanceBtn')
};

const STORAGE_KEY = 'stock_viewer_custom_data';
const SIDEBAR_WIDTH_KEY = 'stock_viewer_sidebar_width';

let isSearching = false;
let contextTargetSymbol = null;
let contextTargetStock = null;
let contextTargetFolder = { isMajor: false, major: null, middle: null };

// Quick Search handler
async function quickSearchStock() {
    const input = DOM.quickSearchInput;
    if (!input) return;
    let code = input.value.trim();
    if (!code) return;
    
    // 数字のみの場合は .T を付与
    if (/^\d+$/.test(code)) {
        code = code + '.T';
    }
    
    const symbol = code;
    
    // ローディング表示
    DOM.loadingOverlay.classList.remove('hidden');
    DOM.symbol.textContent = symbol.replace('.T', '');
    DOM.name.textContent = '検索中...';
    
    try {
        // APIでデータ取得を試行
        const hUrl = `/api/yahoo?symbol=${encodeURIComponent(symbol)}&range=1d&interval=1m`;
        const hResp = await fetch(hUrl);
        if (!hResp.ok) throw new Error('APIエラー');
        const headerData = await hResp.json();
        const hResult = headerData.chart?.result?.[0];
        if (!hResult) throw new Error('銘柄が見つかりません');
        
        const hMeta = hResult.meta;
        
        // 既存の銘柄リストから日本語名を取得
        let stockName = symbol;
        const existingStock = STOCKS.find(s => s.symbol === symbol);
        if (existingStock) {
            stockName = (existingStock.originalName || existingStock.name).replace(/^✔\s*/, '').trim();
        } else {
            // STOCKSに無い場合はNikkei Profile APIから日本語名を取得を試みる
            try {
                const nUrl = `/api/nikkei_profile?symbol=${encodeURIComponent(symbol)}`;
                const nResp = await fetch(nUrl);
                if (nResp.ok) {
                    const nData = await nResp.json();
                    if (nData && nData.name) {
                        stockName = nData.name;
                    } else {
                        stockName = hMeta.longName || hMeta.shortName || symbol;
                    }
                } else {
                    stockName = hMeta.longName || hMeta.shortName || symbol;
                }
            } catch (ne) {
                console.warn('Failed to fetch Japanese name from Nikkei Profile API', ne);
                stockName = hMeta.longName || hMeta.shortName || symbol;
            }
        }
        
        // 検索履歴フォルダに登録
        const historyMajor = '🔍 検索履歴';
        const now = new Date();
        const Y = now.getFullYear();
        const M = (now.getMonth()+1).toString().padStart(2,'0');
        const D = now.getDate().toString().padStart(2,'0');
        const historyMiddle = `${Y}/${M}/${D}`;
        
        // 重複チェック（同じ日の同じ銘柄は追加しない）
        if (!TREE_DATA[historyMajor]) TREE_DATA[historyMajor] = {};
        if (!TREE_DATA[historyMajor][historyMiddle]) TREE_DATA[historyMajor][historyMiddle] = [];
        
        const alreadyExists = TREE_DATA[historyMajor][historyMiddle].some(s => s.symbol === symbol);
        
        const newStock = {
            symbol: symbol,
            name: stockName,
            originalName: stockName,
            major: historyMajor,
            middle: historyMiddle,
            remarks: ''
        };
        
        if (!alreadyExists) {
            STOCKS.push(newStock);
            TREE_DATA[historyMajor][historyMiddle].push(newStock);
            saveToLocal();
        }
        
        // 該当銘柄を選択状態にしてチャート表示
        const stockIdx = STOCKS.indexOf(alreadyExists ? TREE_DATA[historyMajor][historyMiddle].find(s => s.symbol === symbol) : newStock);
        renderSidebar(true);
        await selectStock(stockIdx >= 0 ? stockIdx : STOCKS.length - 1);
        
        input.value = '';
    } catch (e) {
        console.error('Quick search error:', e);
        DOM.name.textContent = '銘柄が見つかりません';
        DOM.symbol.textContent = symbol.replace('.T', '');
    } finally {
        DOM.loadingOverlay.classList.add('hidden');
    }
}

// Initialize app
async function init() {
    try {
        lucide.createIcons();
        initChart();
        initSidebarResizer();
        initVerticalResizer();
        
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
        if (DOM.openFinanceBtn) DOM.openFinanceBtn.onclick = openFinanceWindow;
        
        // Quick Search Events
        if (DOM.quickSearchBtn) {
            DOM.quickSearchBtn.onclick = () => quickSearchStock();
        }
        if (DOM.quickSearchInput) {
            DOM.quickSearchInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    quickSearchStock();
                }
            });
        }
        
        // Auto Copy Toggle initialization
        if (DOM.autoCopyToggle) {
            const savedState = localStorage.getItem('auto_copy_enabled');
            if (savedState !== null) {
                DOM.autoCopyToggle.checked = savedState === 'true';
            }
            DOM.autoCopyToggle.onchange = (e) => {
                localStorage.setItem('auto_copy_enabled', e.target.checked);
            };
        }


        
        // Context Menu App-wide events
        document.addEventListener('click', (e) => {
            // サブメニュー内のクリックは無視する
            if (DOM.folderSendSubMenu && DOM.folderSendSubMenu.contains(e.target)) return;
            if (DOM.middleSendSubMenu && DOM.middleSendSubMenu.contains(e.target)) return;
            
            if (DOM.contextMenu && !DOM.contextMenu.classList.contains('hidden')) {
                DOM.contextMenu.classList.add('hidden');
            }
            if (DOM.folderContextMenu && !DOM.folderContextMenu.classList.contains('hidden')) {
                DOM.folderContextMenu.classList.add('hidden');
            }
            hideAllSubMenus();
        });
        
        if (DOM.sidebar) {
            DOM.sidebar.addEventListener('scroll', () => {
                if (DOM.contextMenu && !DOM.contextMenu.classList.contains('hidden')) {
                    DOM.contextMenu.classList.add('hidden');
                }
                if (DOM.folderContextMenu && !DOM.folderContextMenu.classList.contains('hidden')) {
                    DOM.folderContextMenu.classList.add('hidden');
                }
                hideAllSubMenus();
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
                        document.querySelectorAll('.sidebar .major-folder').forEach(f => {
                            if (f.dataset.name === favMajor) f.classList.remove('collapsed');
                        });
                        document.querySelectorAll('.sidebar .middle-folder').forEach(f => {
                            if (f.dataset.name === favMiddle) f.classList.remove('collapsed');
                        });
                        
                    } else {
                        alert("すでに一時調査候補に登録されています。");
                    }
                }
            };
        }

        if (DOM.ctxRealFavorite) {
            DOM.ctxRealFavorite.onclick = () => {
                if (!contextTargetSymbol) return;
                const targetStock = STOCKS.find(s => s.symbol === contextTargetSymbol);
                if (targetStock) {
                    const favMajor = '★ お気に入り';
                    const favMiddle = '登録済み';
                    
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
                        
                        // お気に入りの大・中フォルダを強制的に展開する
                        document.querySelectorAll('.sidebar .major-folder').forEach(f => {
                            if (f.dataset.name === favMajor) f.classList.remove('collapsed');
                        });
                        document.querySelectorAll('.sidebar .middle-folder').forEach(f => {
                            if (f.dataset.name === favMiddle) f.classList.remove('collapsed');
                        });
                        
                    } else {
                        alert("すでにお気に入りに登録されています。");
                    }
                }
            };
        }
        if (DOM.ctxCheckMark) {
            DOM.ctxCheckMark.onclick = () => {
                if (!contextTargetSymbol) return;
                
                const matches = STOCKS.filter(s => s.symbol === contextTargetSymbol);
                if (matches.length > 0) {
                    const hasCheck = matches[0].isChecked || false;
                    
                    matches.forEach(s => {
                        s.isChecked = !hasCheck;
                    });
                    
                    saveToLocal();
                    renderSidebar(true);
                    
                    // Update header if this stock is currently active
                    if (DOM.symbol && DOM.symbol.textContent.trim() === contextTargetSymbol.replace('.T', '')) {
                        const activeStock = STOCKS.find(s => s.symbol === contextTargetSymbol);
                        if (activeStock) {
                            let textOnly = DOM.name.textContent.replace(/^✔\s*/, '').trim();
                            if (activeStock.isChecked) {
                                DOM.name.innerHTML = `<i data-lucide="check-circle-2" style="color: var(--accent-color); width: 22px; height: 22px; margin-right: 6px; vertical-align: text-bottom;"></i>${textOnly}`;
                            } else {
                                DOM.name.textContent = textOnly;
                            }
                            lucide.createIcons({root: DOM.name.parentElement});
                        }
                    }
                }
            };
        }

        if (DOM.ctxEditRemark) {
            DOM.ctxEditRemark.onclick = () => {
                if (DOM.contextMenu) DOM.contextMenu.classList.add('hidden');
                if (!contextTargetSymbol) return;
                
                const targetStock = STOCKS.find(s => s.symbol === contextTargetSymbol);
                if (targetStock) {
                    const newRemarks = prompt('備考を編集してください:', targetStock.remarks || '');
                    if (newRemarks !== null) {
                        STOCKS.forEach(s => {
                            if (s.symbol === contextTargetSymbol) {
                                s.remarks = newRemarks;
                            }
                        });
                        saveToLocal();
                        renderSidebar(true);
                    }
                }
            };
        }

        // ---- フォルダへ送る / 移動する ----
        if (DOM.ctxSendToFolder) {
            DOM.ctxSendToFolder.addEventListener('mouseenter', (e) => {
                hideAllSubMenus();
                showFolderSendMenu(DOM.ctxSendToFolder, false);
            });
        }
        if (DOM.ctxMoveToFolder) {
            DOM.ctxMoveToFolder.addEventListener('mouseenter', (e) => {
                hideAllSubMenus();
                showFolderSendMenu(DOM.ctxMoveToFolder, true);
            });
        }

        if (DOM.ctxYahoo) {
            DOM.ctxYahoo.onclick = () => {
                if (!contextTargetSymbol) return;
                const code = contextTargetSymbol.replace('.T', '');
                window.open(`https://finance.yahoo.co.jp/quote/${code}/performance`, '_blank');
            };
        }
        if (DOM.ctxNikkei) {
            DOM.ctxNikkei.onclick = () => {
                if (!contextTargetSymbol) return;
                const code = contextTargetSymbol.replace('.T', '');
                window.open(`https://www.nikkei.com/nkd/company/kessan/?scode=${code}`, '_blank');
            };
        }
        if (DOM.ctxKabutan) {
            DOM.ctxKabutan.onclick = () => {
                if (!contextTargetSymbol) return;
                const code = contextTargetSymbol.replace('.T', '');
                window.open(`https://kabutan.jp/stock/?code=${code}`, '_blank');
            };
        }
        if (DOM.ctxKabuyoho) {
            DOM.ctxKabuyoho.onclick = () => {
                if (!contextTargetSymbol) return;
                const code = contextTargetSymbol.replace('.T', '');
                window.open(`https://kabuyoho.ifis.co.jp/index.php?id=100&action=tp1&sa=report&bcode=${code}`, '_blank');
            };
        }
        if (DOM.ctxBuffettCode) {
            DOM.ctxBuffettCode.onclick = () => {
                if (!contextTargetSymbol) return;
                const code = contextTargetSymbol.replace('.T', '');
                window.open(`https://www.buffett-code.com/company/${code}/`, '_blank');
            };
        }
        if (DOM.ctxAiPrompt) {
            DOM.ctxAiPrompt.onclick = () => {
                if (!contextTargetSymbol) return;
                const code = contextTargetSymbol.replace('.T', '');
                
                const promptText = `東京市場の銘柄コード${code}で下記情報をまとめて
銘柄コード
会社名
market（プライム / スタンダード / グロース）
industry_jpx（東証業種）
事業要約
主力事業（最大3つ、簡潔）
代表的な製品・サービス（簡潔）
業種
ROEレベル(高 / 中 / 低 / 赤字)
財務状況(安定 / 標準 / 不安定)
Earningsトレンド(成長 / 横ばい / 減少)
主要リスク(通常 / 監理銘柄 / 整理銘柄)
アナリストコンセンサス(強気 / 中立 / 弱気 / 不明)
ai_overall_view( 成長型 / 安定型 / 市況連動 / 再建型 など)`;

                navigator.clipboard.writeText(promptText).then(() => {
                    if (DOM.contextMenu) DOM.contextMenu.classList.add('hidden');
                    alert('AI指示プロンプトをクリップボードにコピーしました。');
                }).catch(err => {
                    console.error('クリップボードコピーに失敗しました', err);
                    alert('コピーに失敗しました。');
                });
            };
        }
        if (DOM.ctxDelete) {
            DOM.ctxDelete.onclick = () => {
                if (DOM.contextMenu) DOM.contextMenu.classList.add('hidden');
                
                if (!contextTargetStock) return;
                const targetStock = contextTargetStock;
                
                if (confirm(`${targetStock.name} をリストから削除しますか？`)) {
                    // 古い currentIndex が指している銘柄を記憶するか、今の銘柄が消されるかで判定
                    const isActiveStockDeleted = (STOCKS[currentIndex] === targetStock);
                    
                    // STOCKS配列から削除
                    const globalIdx = STOCKS.findIndex(s => s === targetStock || (s.symbol === targetStock.symbol && s.major === targetStock.major && s.middle === targetStock.middle));
                    if (globalIdx !== -1) {
                        STOCKS.splice(globalIdx, 1);
                    }
                    
                    // TREE_DATAから削除
                    const majorGrp = TREE_DATA[targetStock.major];
                    if (majorGrp && majorGrp[targetStock.middle]) {
                        const midArr = majorGrp[targetStock.middle];
                        const idx = midArr.findIndex(s => s === targetStock || (s.symbol === targetStock.symbol && s.major === targetStock.major && s.middle === targetStock.middle));
                        if (idx !== -1) midArr.splice(idx, 1);
                        
                        // 空になったらキーを削除
                        if (midArr.length === 0) {
                            delete majorGrp[targetStock.middle];
                            if (Object.keys(majorGrp).length === 0) {
                                delete TREE_DATA[targetStock.major];
                            }
                        }
                    }
                    
                    saveToLocal();
                    
                    // 削除したアイテムより後ろのインデックスだった場合の調整
                    if (isActiveStockDeleted) {
                        selectStock(Math.max(0, currentIndex - 1));
                    } else if (globalIdx !== -1 && currentIndex > globalIdx) {
                        currentIndex--;
                    }
                    
                    renderSidebar(true);
                    if (STOCKS.length > 0) {
                        updateActiveStockUI();
                    } else {
                        // 銘柄が空になった場合の表示クリア等
                        DOM.symbol.textContent = "----";
                        DOM.name.textContent = "銘柄がありません";
                        DOM.price.textContent = "0";
                        DOM.changeValue.textContent = "0 (0.00%)";
                        if (candleSeries) candleSeries.setData([]);
                        if (volumeSeries) volumeSeries.setData([]);
                    }
                }
            };
        }
        
        if (DOM.ctxMajorFolderCreate) {
            DOM.ctxMajorFolderCreate.onclick = () => {
                if (DOM.folderContextMenu) DOM.folderContextMenu.classList.add('hidden');
                
                const newName = prompt('新しい大フォルダ名を入力してください:');
                if (!newName || !newName.trim()) return;
                const trimmedName = newName.trim();
                
                if (TREE_DATA[trimmedName]) {
                    alert(`「${trimmedName}」は既に存在します。`);
                    return;
                }
                
                TREE_DATA[trimmedName] = { '共通': [] };
                
                saveToLocal();
                renderSidebar(true);
                
                // 作成した大フォルダを展開
                document.querySelectorAll('.sidebar .major-folder').forEach(f => {
                    if (f.dataset.name === trimmedName) f.classList.remove('collapsed');
                });
            };
        }

        if (DOM.ctxFolderCreate) {
            DOM.ctxFolderCreate.onclick = () => {
                if (DOM.folderContextMenu) DOM.folderContextMenu.classList.add('hidden');
                if (!contextTargetFolder.major) return;
                
                const { isMajor, major, middle } = contextTargetFolder;
                const parentMajor = major;
                
                const newName = prompt('新しいフォルダ名を入力してください:');
                if (!newName || !newName.trim()) return;
                const trimmedName = newName.trim();
                
                if (isMajor) {
                    // 大フォルダ右クリック → その下に中フォルダを作成
                    if (!TREE_DATA[parentMajor]) TREE_DATA[parentMajor] = {};
                    if (TREE_DATA[parentMajor][trimmedName]) {
                        alert(`「${trimmedName}」は既に存在します。`);
                        return;
                    }
                    TREE_DATA[parentMajor][trimmedName] = [];
                } else {
                    // 中フォルダ右クリック → 同じ大フォルダ直下に中フォルダを作成
                    if (!TREE_DATA[parentMajor]) TREE_DATA[parentMajor] = {};
                    if (TREE_DATA[parentMajor][trimmedName]) {
                        alert(`「${trimmedName}」は既に存在します。`);
                        return;
                    }
                    TREE_DATA[parentMajor][trimmedName] = [];
                }
                
                saveToLocal();
                renderSidebar(true);
                
                // 作成先の大フォルダを展開
                document.querySelectorAll('.sidebar .major-folder').forEach(f => {
                    if (f.dataset.name === parentMajor) f.classList.remove('collapsed');
                });
            };
        }

        if (DOM.ctxFolderRename) {
            DOM.ctxFolderRename.onclick = () => {
                if (DOM.folderContextMenu) DOM.folderContextMenu.classList.add('hidden');
                if (!contextTargetFolder.major) return;
                
                const { isMajor, major, middle } = contextTargetFolder;
                const targetName = isMajor ? major : middle;
                
                const newName = prompt('新しいフォルダ名を入力してください:', targetName);
                if (!newName || newName === targetName) return;
                
                // STOCKS の更新
                STOCKS.forEach(stock => {
                    if (isMajor) {
                        if (stock.major === major) stock.major = newName;
                    } else {
                        if (stock.major === major && stock.middle === middle) stock.middle = newName;
                    }
                });
                
                // TREE_DATA の再構築
                const newTree = {};
                STOCKS.forEach(stock => {
                    if (!newTree[stock.major]) newTree[stock.major] = {};
                    if (!newTree[stock.major][stock.middle]) newTree[stock.major][stock.middle] = [];
                    newTree[stock.major][stock.middle].push(stock);
                });
                TREE_DATA = newTree;
                
                saveToLocal();
                renderSidebar(true);
            };
        }
        
        if (DOM.ctxFolderDelete) {
            DOM.ctxFolderDelete.onclick = () => {
                if (DOM.folderContextMenu) DOM.folderContextMenu.classList.add('hidden');
                if (!contextTargetFolder.major) return;
                
                const { isMajor, major, middle } = contextTargetFolder;
                const targetName = isMajor ? major : middle;
                
                if (confirm(`フォルダ「${targetName}」内のすべての銘柄を削除しますか？`)) {
                    // STOCKS から一括削除
                    const initialCount = STOCKS.length;
                    
                    if (isMajor) {
                        STOCKS = STOCKS.filter(stock => stock.major !== major);
                        delete TREE_DATA[major];
                    } else {
                        STOCKS = STOCKS.filter(stock => !(stock.major === major && stock.middle === middle));
                        if (TREE_DATA[major]) {
                            delete TREE_DATA[major][middle];
                            if (Object.keys(TREE_DATA[major]).length === 0) {
                                delete TREE_DATA[major];
                            }
                        }
                    }
                    const treeChanged = (isMajor && !TREE_DATA[major]) || (!isMajor && (!TREE_DATA[major] || !TREE_DATA[major][middle]));
                    
                    if (STOCKS.length !== initialCount || treeChanged) {
                        saveToLocal();
                        // 修正されたcurrentIndexのために現在の状態を確認
                        if (!STOCKS[currentIndex]) {
                            selectStock(Math.max(0, STOCKS.length - 1));
                        }
                        renderSidebar(false); // 削除なので開閉状態を一旦リセットまたは再構築
                        if (STOCKS.length > 0) {
                            updateActiveStockUI();
                        } else {
                            DOM.symbol.textContent = "----";
                            DOM.name.textContent = "銘柄がありません";
                            DOM.price.textContent = "0";
                            DOM.changeValue.textContent = "0 (0.00%)";
                            if (candleSeries) candleSeries.setData([]);
                            if (volumeSeries) volumeSeries.setData([]);
                        }
                    }
                }
            };
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
    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const cachedData = localStorage.getItem(STORAGE_KEY);

    try {
        if (isLocal) {
            // ローカル環境ならサーバー上のmeigara.csvを最優先（全ブラウザ同期のため）
            const response = await fetch('meigara.csv?t=' + Date.now());
            if (response.ok) {
                const csvText = await response.text();
                if (csvText && csvText.trim().length > 0) {
                    parseCSV(csvText);
                    localStorage.setItem(STORAGE_KEY, csvText);
                    renderSidebar();
                    return;
                }
            }
        }
    } catch (e) {
        console.warn('Server fetch failed, falling back to LocalStorage:', e);
    }

    // GitHub Pagesなどの環境、またはサーバー取得失敗時はLocalStorageを優先
    if (cachedData) {
        parseCSV(cachedData);
    } else {
        // LocalStorageも空の場合は初期ファイルを取得
        try {
            const response = await fetch('meigara.csv');
            const csvText = await response.text();
            parseCSV(csvText);
        } catch (e) {
            console.error('Initial data load failed:', e);
        }
    }
    renderSidebar();
}

// ---- Data Persistence Functions ----
async function saveToServer(csvContent) {
    try {
        await fetch('/api/save', {
            method: 'POST',
            body: csvContent
        });
    } catch (e) {
        console.error('Failed to save to server:', e);
    }
}

function saveToLocal() {
    let csvContent = '大分類,中分類,銘柄コード,銘柄名,備考\n';
    STOCKS.forEach(s => {
        const codeBase = s.symbol.replace('.T', '');
        const nameToSave = s.isChecked ? '✔ ' + s.name : s.name;
        csvContent += `${s.major},${s.middle},${codeBase},${nameToSave},${s.remarks}\n`;
    });
    // 空フォルダも永続化する
    Object.keys(TREE_DATA).forEach(major => {
        Object.keys(TREE_DATA[major]).forEach(middle => {
            if (TREE_DATA[major][middle].length === 0) {
                csvContent += `${major},${middle},,,\n`;
            }
        });
    });
    localStorage.setItem(STORAGE_KEY, csvContent);
    saveToServer(csvContent);
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
        if (!code) {
            // 空フォルダエントリ: コードが空でも大分類・中分類があればフォルダ構造を作成
            if (major && middle) {
                if (!TREE_DATA[major]) TREE_DATA[major] = {};
                if (!TREE_DATA[major][middle]) TREE_DATA[major][middle] = [];
            }
            return;
        }
        
        const symbol = (code.includes('.') || code.startsWith('^') || code.includes('=') || code.includes('-')) ? code : code + '.T';
        let isChecked = false;
        let cleanName = name;
        if (cleanName.startsWith('✔ ')) {
            isChecked = true;
            cleanName = cleanName.replace(/^✔\s*/, '');
        }

        const stock = { 
            symbol, 
            name: cleanName, 
            originalName: cleanName, // Store CSV name
            isChecked: isChecked,
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
        const nameToExport = s.isChecked ? '✔ ' + s.name : s.name;
        csvContent += `${s.major},${s.middle},${code},${nameToExport},${s.remarks}\n`;
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
    reader.onload = async (e) => {
        try {
            const text = e.target.result;
            localStorage.setItem(STORAGE_KEY, text);
            await saveToServer(text);
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
        // We don't delete meigara.csv on server, but it will be re-fetched next time.
        // If we want a REAL reset, we'd need a server-side reset too.
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
        document.querySelectorAll('.sidebar .major-folder:not(.collapsed)').forEach(f => {
            if (f.dataset.name) openFolders.add('major:' + f.dataset.name);
        });
        document.querySelectorAll('.sidebar .middle-folder:not(.collapsed)').forEach(f => {
            if (f.dataset.name) openFolders.add('middle:' + f.dataset.name);
        });
    }

    DOM.list.innerHTML = '';
    if (DOM.favoriteList) DOM.favoriteList.innerHTML = '';
    
    let majIdx = 0;
    Object.keys(TREE_DATA).forEach((major) => {
        let majorCount = 0;
        Object.values(TREE_DATA[major]).forEach(arr => { majorCount += arr.length; });
        const majorTitle = `${major} (${majorCount}件)`;
        
        const majorFolder = createFolder(majorTitle, 'major-folder', true, major, null);
        const majorContent = majorFolder.querySelector('.folder-content');
        
        // ドラッグ並び替え対応
        majorFolder.draggable = true;
        majorFolder.dataset.majorKey = major;
        majorFolder.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('text/plain', major);
            e.dataTransfer.setData('drag-type', 'major');
            majorFolder.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
        });
        majorFolder.addEventListener('dragend', () => {
            majorFolder.classList.remove('dragging');
            document.querySelectorAll('.folder-item.drag-over').forEach(el => el.classList.remove('drag-over'));
        });
        majorFolder.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            majorFolder.classList.add('drag-over');
        });
        majorFolder.addEventListener('dragleave', () => {
            majorFolder.classList.remove('drag-over');
        });
        majorFolder.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
            majorFolder.classList.remove('drag-over');
            
            const dragType = e.dataTransfer.getData('drag-type');
            const draggedKey = e.dataTransfer.getData('text/plain');
            
            if (dragType === 'middle') {
                // 中フォルダを別の大フォルダへ移動
                const [srcMajor, srcMiddle] = draggedKey.split('|||');
                if (!srcMajor || !srcMiddle) return;
                if (srcMajor === major) return; // 同じ大フォルダ内は無視
                
                // 移動先に同名の中フォルダがある場合
                if (TREE_DATA[major][srcMiddle]) {
                    if (!confirm(`「${major}」には既に「${srcMiddle}」が存在します。統合しますか？`)) return;
                    // 統合: 銘柄を移動先に追加
                    const movingStocks = TREE_DATA[srcMajor][srcMiddle] || [];
                    movingStocks.forEach(s => {
                        s.major = major;
                        TREE_DATA[major][srcMiddle].push(s);
                    });
                } else {
                    // 新規移動
                    const movingStocks = TREE_DATA[srcMajor][srcMiddle] || [];
                    movingStocks.forEach(s => { s.major = major; });
                    TREE_DATA[major][srcMiddle] = movingStocks;
                }
                
                // 元の大フォルダから削除
                delete TREE_DATA[srcMajor][srcMiddle];
                if (Object.keys(TREE_DATA[srcMajor]).length === 0) {
                    delete TREE_DATA[srcMajor];
                }
                
                saveToLocal();
                renderSidebar(true);
                return;
            }
            
            // 大フォルダの並び替え（既存処理）
            if (!draggedKey || draggedKey === major) return;
            
            const keys = Object.keys(TREE_DATA);
            const fromIdx = keys.indexOf(draggedKey);
            const toIdx = keys.indexOf(major);
            if (fromIdx === -1 || toIdx === -1) return;
            
            keys.splice(fromIdx, 1);
            keys.splice(toIdx, 0, draggedKey);
            
            const newTree = {};
            keys.forEach(k => { newTree[k] = TREE_DATA[k]; });
            TREE_DATA = newTree;
            
            saveToLocal();
            renderSidebar(true);
        });
        
        if (preserveState) {
            if (!openFolders.has('major:' + major)) majorFolder.classList.add('collapsed');
        } else {
            // Default: first major folder open, others closed
            if (majIdx !== 0) majorFolder.classList.add('collapsed');
        }
        
        Object.keys(TREE_DATA[major]).forEach(middle => {
            const middleStocks = TREE_DATA[major][middle];
            const middleCount = middleStocks.length;
            
            // GCフォルダの場合、勝率・平均上昇率を色付きで表示
            let statsHtml = '';
            if (middle.includes('GC（2年）')) {
                const rateStocks = middleStocks.filter(s => s.gcRiseRate !== null && s.gcRiseRate !== undefined);
                if (rateStocks.length > 0) {
                    const winCount = rateStocks.filter(s => s.gcRiseRate > 0).length;
                    const winRate = (winCount / rateStocks.length) * 100;
                    const avgRate = rateStocks.reduce((sum, s) => sum + s.gcRiseRate, 0) / rateStocks.length;
                    const winClass = winRate >= 50 ? 'positive' : 'negative';
                    const avgClass = avgRate >= 0 ? 'positive' : 'negative';
                    statsHtml = ` <span class="folder-stat ${winClass}">勝率${winRate.toFixed(0)}%</span> <span class="folder-stat ${avgClass}">平均${avgRate >= 0 ? '+' : ''}${avgRate.toFixed(1)}%</span>`;
                }
            }
            
            const middleTitle = `${middle} (${middleCount}件)${statsHtml}`;
            
            const middleFolder = createFolder(middleTitle, 'middle-folder', false, major, middle);
            const middleContent = middleFolder.querySelector('.folder-content');
            
            // 中フォルダのドラッグ対応
            middleFolder.draggable = true;
            middleFolder.addEventListener('dragstart', (e) => {
                e.stopPropagation(); // 大フォルダへの伝播を防止
                e.dataTransfer.setData('text/plain', `${major}|||${middle}`);
                e.dataTransfer.setData('drag-type', 'middle');
                middleFolder.classList.add('dragging');
                e.dataTransfer.effectAllowed = 'move';
            });
            middleFolder.addEventListener('dragend', () => {
                middleFolder.classList.remove('dragging');
                document.querySelectorAll('.folder-item.drag-over').forEach(el => el.classList.remove('drag-over'));
            });
            
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
        
        if (major.includes('抽出結果')) {
            if (DOM.favoriteList) DOM.favoriteList.appendChild(majorFolder);
        } else {
            DOM.list.appendChild(majorFolder);
        }
        majIdx++;
    });
    
    lucide.createIcons();
}

function createFolder(title, className, isMajor = false, majorName = null, middleName = null) {
    const div = document.createElement('div');
    div.className = `folder-item ${className}`;
    div.dataset.name = isMajor ? majorName : middleName;
    
    div.innerHTML = `
        <div class="folder-header">
            <i data-lucide="chevron-right" class="folder-icon"></i>
            <span class="folder-title">${title}</span>
        </div>
        <div class="folder-content"></div>
    `;
    
    const header = div.querySelector('.folder-header');
    header.onclick = (e) => {
        e.stopPropagation();
        div.classList.toggle('collapsed');
        lucide.createIcons();
    };
    header.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        contextTargetFolder = { isMajor, major: majorName, middle: middleName };
        
        if (DOM.folderContextMenu) {
            DOM.folderContextMenu.style.left = `${e.pageX}px`;
            DOM.folderContextMenu.style.top = `${e.pageY}px`;
            DOM.folderContextMenu.classList.remove('hidden');
        }
        if (DOM.contextMenu) DOM.contextMenu.classList.add('hidden');
    });
    
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
        e.stopPropagation();
        contextTargetSymbol = stock.symbol;
        contextTargetStock = stock;
        
        if (DOM.folderContextMenu) DOM.folderContextMenu.classList.add('hidden');
        if (DOM.contextMenu) {
            DOM.contextMenu.style.left = `${e.pageX}px`;
            DOM.contextMenu.style.top = `${e.pageY}px`;
            DOM.contextMenu.classList.remove('hidden');
        }
    });
    
    li.innerHTML = `
        <div class="stock-item-left">
            <span class="stock-item-symbol">${stock.symbol.replace('.T', '')}</span>
            <span class="stock-item-name">
                ${stock.isChecked ? '<i data-lucide="check-circle-2" style="color: var(--accent-color); width: 14px; height: 14px; margin-right: 4px; vertical-align: text-bottom;"></i>' : ''}
                ${stock.name}
            </span>
            ${(stock.gcRiseRate !== undefined && stock.gcRiseRate !== null) ? 
                `<span class="stock-item-rise ${stock.gcRiseRate > 0 ? 'positive' : (stock.gcRiseRate < 0 ? 'negative' : '')}">
                    ${stock.gcRiseRate > 0 ? '+' : ''}${stock.gcRiseRate.toFixed(1)}%
                </span>` 
            : ''}
            ${stock.remarks ? `<span class="stock-item-remarks">${stock.remarks}</span>` : ''}
        </div>
        <i data-lucide="chevron-right" style="color: var(--text-muted); width: 14px;"></i>
    `;
    return li;
}

// ---- フォルダへ送る：サブメニュー関連 ----

function hideAllSubMenus() {
    if (DOM.folderSendSubMenu) DOM.folderSendSubMenu.classList.add('hidden');
    if (DOM.middleSendSubMenu) DOM.middleSendSubMenu.classList.add('hidden');
}

function positionSubMenu(anchor, submenu, level) {
    const anchorRect = anchor.getBoundingClientRect();
    submenu.style.position = 'fixed';
    
    // level=0: コンテキストメニュー項目の右側, level=1: 大フォルダ項目の右側
    let left = anchorRect.right + 2;
    let top = anchorRect.top;
    
    // 画面外にはみ出す場合は左側に表示
    submenu.classList.remove('hidden');
    const menuWidth = submenu.offsetWidth || 200;
    const menuHeight = submenu.offsetHeight || 300;
    
    if (left + menuWidth > window.innerWidth) {
        left = anchorRect.left - menuWidth - 2;
    }
    if (top + menuHeight > window.innerHeight) {
        top = Math.max(4, window.innerHeight - menuHeight - 4);
    }
    
    submenu.style.left = `${left}px`;
    submenu.style.top = `${top}px`;
}

function showFolderSendMenu(anchorEl, isMove = false) {
    const sub = DOM.folderSendSubMenu;
    if (!sub) return;
    
    sub.innerHTML = '';
    
    const majorKeys = Object.keys(TREE_DATA);
    if (majorKeys.length === 0) {
        sub.innerHTML = '<div class="submenu-item" style="color: var(--text-muted); pointer-events:none;">フォルダがありません</div>';
        positionSubMenu(anchorEl, sub, 0);
        return;
    }
    
    majorKeys.forEach(major => {
        const item = document.createElement('div');
        item.className = 'submenu-item has-sub';
        const middleCount = Object.keys(TREE_DATA[major]).length;
        item.innerHTML = `
            <span style="display:flex;align-items:center;gap:8px;overflow:hidden;">
                <span class="folder-emoji">📁</span>
                <span style="overflow:hidden;text-overflow:ellipsis;">${major}</span>
            </span>
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="sub-icon"><polyline points="9 18 15 12 9 6"></polyline></svg>
        `;
        
        item.addEventListener('mouseenter', () => {
            // 既存の中フォルダサブメニューを閉じてから新しく開く
            if (DOM.middleSendSubMenu) DOM.middleSendSubMenu.classList.add('hidden');
            showMiddleSendMenu(item, major, isMove);
        });
        
        sub.appendChild(item);
    });
    
    positionSubMenu(anchorEl, sub, 0);
}

function showMiddleSendMenu(anchorEl, majorName, isMove = false) {
    const sub = DOM.middleSendSubMenu;
    if (!sub) return;
    
    sub.innerHTML = '';
    
    const middles = TREE_DATA[majorName];
    if (!middles) return;
    
    const middleKeys = Object.keys(middles);
    
    middleKeys.forEach(middle => {
        const stockCount = middles[middle].length;
        const item = document.createElement('div');
        item.className = 'submenu-item';
        item.innerHTML = `
            <span style="display:flex;align-items:center;gap:8px;overflow:hidden;">
                <span class="folder-emoji">📂</span>
                <span style="overflow:hidden;text-overflow:ellipsis;">${middle}</span>
            </span>
            <span style="font-size:11px;color:var(--text-muted);flex-shrink:0;">${stockCount}件</span>
        `;
        
        item.addEventListener('click', (e) => {
            e.stopPropagation();
            sendStockToFolder(majorName, middle, isMove);
        });
        
        sub.appendChild(item);
    });
    
    positionSubMenu(anchorEl, sub, 1);
}

function sendStockToFolder(majorName, middleName, isMove = false) {
    if (!contextTargetSymbol || !contextTargetStock) return;
    
    // 重複チェック
    const exists = STOCKS.some(s => 
        s.symbol === contextTargetSymbol && 
        s.major === majorName && 
        s.middle === middleName
    );
    
    if (exists) {
        alert(`${contextTargetStock.name} は既に「${majorName} > ${middleName}」に登録されています。`);
        hideAllSubMenus();
        if (DOM.contextMenu) DOM.contextMenu.classList.add('hidden');
        return;
    }
    
    // 移動の場合は元のフォルダから削除する
    if (isMove) {
        const oldMajor = contextTargetStock.major;
        const oldMiddle = contextTargetStock.middle;
        
        const index = STOCKS.findIndex(s => s === contextTargetStock);
        if (index > -1) STOCKS.splice(index, 1);
        
        if (TREE_DATA[oldMajor] && TREE_DATA[oldMajor][oldMiddle]) {
            const tIdx = TREE_DATA[oldMajor][oldMiddle].findIndex(s => s === contextTargetStock);
            if (tIdx > -1) TREE_DATA[oldMajor][oldMiddle].splice(tIdx, 1);
        }
    }
    
    const newStock = { 
        ...contextTargetStock, 
        major: majorName, 
        middle: middleName 
    };
    
    STOCKS.push(newStock);
    
    if (!TREE_DATA[majorName]) TREE_DATA[majorName] = {};
    if (!TREE_DATA[majorName][middleName]) TREE_DATA[majorName][middleName] = [];
    TREE_DATA[majorName][middleName].push(newStock);
    
    saveToLocal();
    renderSidebar(true);
    
    // 送り先フォルダを展開
    document.querySelectorAll('.sidebar .major-folder').forEach(f => {
        if (f.dataset.name === majorName) f.classList.remove('collapsed');
    });
    document.querySelectorAll('.sidebar .middle-folder').forEach(f => {
        if (f.dataset.name === middleName) f.classList.remove('collapsed');
    });
    
    hideAllSubMenus();
    if (DOM.contextMenu) DOM.contextMenu.classList.add('hidden');
}

function navigateStock(direction) {
    const newIndex = currentIndex + direction;
    if (newIndex >= 0 && newIndex < STOCKS.length) {
        selectStock(newIndex);
        
        // Ensure its parent folders are expanded
        const activeItem = document.querySelector(`.sidebar .stock-item[data-index="${newIndex}"]`);
        if (activeItem) {
            let parent = activeItem.parentElement;
            while (parent && !parent.classList.contains('sidebar')) {
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

    if (DOM.autoCopyToggle && DOM.autoCopyToggle.checked) {
        const code = stock.symbol.replace('.T', '');
        const copyText = `${code} ${stock.name}`;
        navigator.clipboard.writeText(copyText).catch(err => console.error('Copy failed', err));
    }

    // Show Loading
    DOM.loadingOverlay.classList.remove('hidden');
    
    try {
        await fetchStockData(stock);
        fetchAndRenderFinanceData(stock.symbol);
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
    const items = document.querySelectorAll('.sidebar .stock-item');
    items.forEach(item => item.classList.remove('active'));
    
    // Add to current
    const activeItem = document.querySelector(`.sidebar .stock-item[data-index="${currentIndex}"]`);
    if (activeItem) {
        activeItem.classList.add('active');
        
        // Ensure its parent folders are expanded
        let parent = activeItem.parentElement;
        while (parent && !parent.classList.contains('sidebar')) {
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
    if (stock.isChecked) {
        DOM.name.innerHTML = `<i data-lucide="check-circle-2" style="color: var(--accent-color); width: 22px; height: 22px; margin-right: 6px; vertical-align: text-bottom;"></i>${stock.name}`;
        lucide.createIcons({root: DOM.name.parentElement});
    } else {
        DOM.name.textContent = stock.name;
    }
    
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
                lastCurrentPrice = price; // 配当利回り計算用に保持
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
            const fetchedName = hMeta.longName || hMeta.shortName || stock.originalName;
            let displayName = fetchedName;
            if (fetchedName && fetchedName !== stock.originalName) {
                displayName = `${stock.originalName} (${fetchedName})`;
            }
            if (stock.isChecked) {
                DOM.name.innerHTML = `<i data-lucide="check-circle-2" style="color: var(--accent-color); width: 22px; height: 22px; margin-right: 6px; vertical-align: text-bottom;"></i>${displayName}`;
            } else {
                DOM.name.textContent = displayName;
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
                        const openData = quotes.open || [];
                        let timePrices = [];
                        for (let j = 0; j < closeData.length; j++) {
                            if (closeData[j] !== null && closeData[j] !== undefined) {
                                const openVal = (openData[j] !== null && openData[j] !== undefined) ? openData[j] : null;
                                timePrices.push({ close: closeData[j], open: openVal, time: j });
                            }
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
                                                let gcRiseRate = null;
                                                // 2日以上前のGCのみ計算（前日の終値が存在するため）
                                                if (n >= 2) {
                                                    // 歯抜けがない timePrices 配列を基準にする
                                                    // 前日の終値
                                                    const prevDayData = timePrices[timePrices.length - 1 - 1];
                                                    // GC発生日（n日前）の終値を基準値として使用
                                                    // （Spark APIにはopen値がないため、GC日のcloseで代用）
                                                    const gcDayData = timePrices[timePrices.length - 1 - n];
                                                    
                                                    if (prevDayData && gcDayData && gcDayData.close > 0) {
                                                        const closePrevDay = prevDayData.close;
                                                        const closeGCDay = gcDayData.close;
                                                        gcRiseRate = ((closePrevDay - closeGCDay) / closeGCDay) * 100;
                                                    }
                                                }
                                                
                                                foundStocks.push({ 
                                                    ...orig,
                                                    gcDayOffset: n,
                                                    gcRiseRate: gcRiseRate
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
    const now = new Date();
    const mm = (now.getMonth() + 1).toString().padStart(2, '0');
    const dd = now.getDate().toString().padStart(2, '0');
    const HH = now.getHours().toString().padStart(2, '0');
    const min = now.getMinutes().toString().padStart(2, '0');
    const timeStr = `${mm}/${dd} ${HH}:${min}`;
    
    const searchMajor = `🔎 抽出結果 ${timeStr}`;
    
    // 古い「🔎 抽出結果」関連フォルダを全削除
    Object.keys(TREE_DATA).forEach(key => {
        if (key.startsWith('🔎 抽出結果')) {
            delete TREE_DATA[key];
        }
    });
    
    // STOCKS上の古い抽出結果を削除
    STOCKS = STOCKS.filter(s => !s.major.startsWith('🔎 抽出結果'));
    
    TREE_DATA[searchMajor] = {};
    
    let messageList = [];
    
    for (let n = 0; n <= 30; n++) {
        const dayStocks = foundStocks.filter(s => s.gcDayOffset === n);
        
        let dayName = n === 0 ? '本日' : (n === 1 ? '昨日' : `${n}日前`);
        
        const searchMiddle = `${dayName}GC（2年）`;
        
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
    
    saveToLocal(); // 自動保存を追加
    renderSidebar();
    
    // 抽出追加後に該当フォルダを展開する
    setTimeout(() => {
        const folders = document.querySelectorAll('.sidebar .major-folder');
        folders.forEach(f => {
            if (f.dataset.name === searchMajor) {
                f.classList.remove('collapsed');
                const midFolders = f.querySelectorAll('.middle-folder');
                midFolders.forEach(mf => {
                    // 全てのサブフォルダを展開オプションにするか、本日のGCだけ展開するか
                    mf.classList.remove('collapsed');
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
function initVerticalResizer() {
    if (!DOM.verticalResizer || !DOM.list.parentElement) return;
    
    const upperContainer = document.getElementById('stockListContainer');
    if (!upperContainer) return;
    
    let isResizing = false;
    let startY = 0;
    let startHeight = 0;
    
    const savedHeight = localStorage.getItem('stock_viewer_upper_height');
    if (savedHeight) {
        upperContainer.style.flex = `0 0 ${savedHeight}px`;
    }

    DOM.verticalResizer.addEventListener('mousedown', (e) => {
        isResizing = true;
        startY = e.clientY;
        startHeight = upperContainer.offsetHeight;
        
        DOM.verticalResizer.classList.add('active');
        document.body.classList.add('v-resizing');
    });

    document.addEventListener('mousemove', (e) => {
        if (!isResizing) return;
        
        const delta = e.clientY - startY;
        let newHeight = startHeight + delta;
        
        if (newHeight < 50) newHeight = 50;
        
        const maxH = DOM.sidebar.clientHeight - 100;
        if (newHeight > maxH) newHeight = maxH;
        
        upperContainer.style.flex = `0 0 ${newHeight}px`;
    });

    document.addEventListener('mouseup', () => {
        if (isResizing) {
            isResizing = false;
            DOM.verticalResizer.classList.remove('active');
            document.body.classList.remove('v-resizing');
            
            localStorage.setItem('stock_viewer_upper_height', upperContainer.offsetHeight);
        }
    });
}

// ---- Financial Charts (Separate Window) ----
let financeWindow = null;
let lastFinanceData = null;
let lastCurrentPrice = null; // 現在株価（配当利回り計算用）
let _financeAbortController = null; // 業績データ取得キャンセル用

function openFinanceWindow() {
    const width = 1000;
    const height = 800;
    const left = (window.screen.width / 2) - (width / 2);
    const top = (window.screen.height / 2) - (height / 2);
    
    financeWindow = window.open('finance.html', 'FinanceCharts', `width=${width},height=${height},left=${left},top=${top}`);
    
    // ウィンドウが読み込まれたら直近のデータを送信
    financeWindow.onload = () => {
        if (lastFinanceData && currentIndex !== -1) {
            const stock = STOCKS[currentIndex];
            financeWindow.updateFinancials(stock.symbol.replace('.T', ''), stock.name, lastFinanceData);
        } else if (financeWindow.updateProgress) {
            financeWindow.updateProgress(10, "データの取得を待機中...");
        }
    };
}

async function fetchAndRenderFinanceData(symbol, forceFull = false) {
    // 前回の取得が進行中であればキャンセルする
    if (_financeAbortController) {
        _financeAbortController.abort();
    }
    _financeAbortController = new AbortController();
    const signal = _financeAbortController.signal;

    lastFinanceData = null; // 新しい銘柄の取得を開始するのでリセット

    const notifyProgress = (percent, message) => {
        if (financeWindow && !financeWindow.closed && financeWindow.updateProgress) {
            financeWindow.updateProgress(percent, message, symbol);
        }
    };

    try {
        notifyProgress(10, "基本業績データを取得中...");
        const resp = await fetch(`/api/quoteSummary?symbol=${encodeURIComponent(symbol)}`, { signal });
        if (!resp.ok) throw new Error("Finance fetch failed");
        if (signal.aborted) return;
        const data = await resp.json();
        if (signal.aborted) return;
        
        const income = data.quoteSummary?.result?.[0]?.incomeStatementHistory?.incomeStatementHistory;
        const balance = data.quoteSummary?.result?.[0]?.balanceSheetHistory?.balanceSheetStatements;
        
        if (!income || income.length === 0) {
            lastFinanceData = null;
            if (forceFull && financeWindow && !financeWindow.closed && typeof financeWindow.resetFullDataBtn === 'function') {
                financeWindow.resetFullDataBtn();
            }
            return;
        }
        
        // Yahoo returns newest first. Reverse to oldest first.
        const reversedIncome = [...income].reverse();
        const bsMap = {};
        if (balance) {
            balance.forEach(b => {
                const lbl = b.endDate?.fmt;
                if (lbl) bsMap[lbl] = b.totalStockholderEquity?.raw || 0;
            });
        }
        
        const labels = [], revenues = [], grossMargins = [], opMargins = [], netMargins = [], roes = [], equityRatios = [];
        const grossProfits = [], opIncomes = [], netIncomes = [];
        
        reversedIncome.forEach(inc => {
            const date = inc.endDate?.fmt;
            if (!date) return;
            // 短縮形式 (例: 24/03) に変換
            const parts = date.split('/');
            const shortDate = parts.length === 2 ? `${parts[0].slice(-2)}/${parts[1]}` : date;
            labels.push(shortDate);
            
            const rev = inc.totalRevenue?.raw || 0;
            const gp = inc.grossProfit?.raw || 0;
            const op = inc.operatingIncome?.raw || 0;
            const ni = inc.netIncome?.raw || 0;
            
            revenues.push(rev / 1000000);
            grossProfits.push(gp / 1000000);
            opIncomes.push(op / 1000000);
            netIncomes.push(ni / 1000000);
            
            grossMargins.push(rev ? (gp / rev) * 100 : 0);
            opMargins.push(rev ? (op / rev) * 100 : 0);
            netMargins.push(rev ? (ni / rev) * 100 : 0);
            
            // 純資産: 日経はincome内にstockholdersEquityを含む場合あり
            const equity = inc.stockholdersEquity?.raw
                        || bsMap[shortDate]
                        || bsMap[date]
                        || 0;
            roes.push(equity ? (ni / equity) * 100 : 0);

            // 自己資本比率（日経から取得した場合のみ存在）
            const er = inc.equityRatio?.raw;
            equityRatios.push(er !== undefined && er !== null ? er : null);
        });
        
        const forecast = data.quoteSummary?.result?.[0]?.earningsEstimate;
        
        if (signal.aborted) return;

        // ---- 簡易取得モード判定 ----
        const isLite = !forceFull && (localStorage.getItem('financeWindow_liteMode') === 'true');
        if (isLite) {
            const liteData = {
                isLite: true,
                labels, revenues, grossMargins, opMargins, netMargins,
                roes, equityRatios, grossProfits, opIncomes, netIncomes,
                forecast: forecast ? forecast / 1000000 : null,
                dividendData: null, currentPrice: lastCurrentPrice,
                businessInfo: null, newsInfo: null, yahooNewsInfo: null,
                nikkeiNewsInfo: null, minkabuNewsInfo: null, tradersWebNewsInfo: null,
                yutaiInfo: null, nikkeiProfileInfo: null
            };
            // 事業内容だけ取得（軽量・1リクエスト）
            if (symbol.endsWith('.T')) {
                notifyProgress(40, '事業内容を取得中...');
                try {
                    const bizResp = await fetch(`/api/kabutan_biz?symbol=${encodeURIComponent(symbol)}`, { signal });
                    if (bizResp.ok && !signal.aborted) {
                        const bizData = await bizResp.json();
                        if (bizData.summary) liteData.businessInfo = bizData;
                    }
                } catch (e) {
                    if (e.name === 'AbortError') return;
                }
            }
            if (signal.aborted) return;
            lastFinanceData = liteData;
            notifyProgress(100, '取得完了（簡易）');
            if (financeWindow && !financeWindow.closed) {
                const stock = STOCKS[currentIndex];
                financeWindow.updateFinancials(stock.symbol.replace('.T', ''), stock.name, lastFinanceData);
            }
            return;
        }

        let dividendData = null;
        notifyProgress(30, "配当データを取得中...");
        try {
            const divResp = await fetch(`/api/nikkei_dividend?symbol=${encodeURIComponent(symbol)}`, { signal });
            if (divResp.ok) {
                if (signal.aborted) return;
                dividendData = await divResp.json();
                if (dividendData.error) {
                    console.error("Nikkei API returned error:", dividendData.error);
                    dividendData = null;
                }
            }
        } catch (e) {
            if (e.name === 'AbortError') return;
            console.error("Failed to fetch Nikkei Dividend data", e);
        }
        
        // ----- 株探から日本語事業概要を取得 -----
        if (signal.aborted) return;
        let businessInfo = null;
        if (symbol.endsWith('.T')) {
            notifyProgress(50, "事業内容を取得中...");
            try {
                const bizResp = await fetch(`/api/kabutan_biz?symbol=${encodeURIComponent(symbol)}`, { signal });
                if (bizResp.ok) {
                    if (signal.aborted) return;
                    const bizData = await bizResp.json();
                    if (bizData.summary) businessInfo = bizData;
                }
            } catch (e) {
                if (e.name === 'AbortError') return;
                console.warn('Kabutan biz info fetch failed', e);
            }
        } else {
            // 米国株など: quoteSummaryのbusinessInfoをそのまま使用
            businessInfo = data.quoteSummary?.result?.[0]?.businessInfo || null;
        }

        // ----- 直近ニュースを取得 -----
        if (signal.aborted) return;
        let newsInfo = null;
        let yahooNewsInfo = null;
        let nikkeiNewsInfo = null;
        let minkabuNewsInfo = null;
        let tradersWebNewsInfo = null;
        if (symbol.endsWith('.T')) {
            notifyProgress(70, "ニュース記事を取得中...");
            try {
                const [newsResp, yahooResp, nikkeiResp, minkabuResp, tradersWebResp] = await Promise.all([
                    fetch(`/api/kabutan_news?symbol=${encodeURIComponent(symbol)}`, { signal }).catch(e => e.name === 'AbortError' ? null : null),
                    fetch(`/api/yahoo_news?symbol=${encodeURIComponent(symbol)}`, { signal }).catch(e => e.name === 'AbortError' ? null : null),
                    fetch(`/api/nikkei_news?symbol=${encodeURIComponent(symbol)}`, { signal }).catch(e => e.name === 'AbortError' ? null : null),
                    fetch(`/api/minkabu_news?symbol=${encodeURIComponent(symbol)}`, { signal }).catch(e => e.name === 'AbortError' ? null : null),
                    fetch(`/api/traders_web_news?symbol=${encodeURIComponent(symbol)}`, { signal }).catch(e => e.name === 'AbortError' ? null : null)
                ]);

                if (signal.aborted) return;

                if (newsResp && newsResp.ok) {
                    const newsData = await newsResp.json();
                    if (newsData.news) newsInfo = newsData.news;
                }

                if (yahooResp && yahooResp.ok) {
                    const yahooData = await yahooResp.json();
                    if (yahooData.news) yahooNewsInfo = yahooData.news;
                }

                if (nikkeiResp && nikkeiResp.ok) {
                    const nikkeiData = await nikkeiResp.json();
                    if (nikkeiData.news) nikkeiNewsInfo = nikkeiData.news;
                }

                if (minkabuResp && minkabuResp.ok) {
                    const minkabuData = await minkabuResp.json();
                    if (minkabuData.news) minkabuNewsInfo = minkabuData.news;
                }

                if (tradersWebResp && tradersWebResp.ok) {
                    const tradersWebData = await tradersWebResp.json();
                    if (tradersWebData.news) tradersWebNewsInfo = tradersWebData.news;
                }
            } catch (e) {
                if (e.name === 'AbortError') return;
                console.warn('News fetch failed', e);
            }
        }

        // ----- 株探から株主優待情報を取得 -----
        if (signal.aborted) return;
        let yutaiInfo = null;
        if (symbol.endsWith('.T')) {
            notifyProgress(90, "株主優待情報を取得中...");
            try {
                const yutaiResp = await fetch(`/api/kabutan_yutai?symbol=${encodeURIComponent(symbol)}`, { signal });
                if (yutaiResp.ok) {
                    if (signal.aborted) return;
                    const yutaiData = await yutaiResp.json();
                    if (!yutaiData.error) yutaiInfo = yutaiData;
                }
            } catch (e) {
                if (e.name === 'AbortError') return;
                console.warn('Kabutan yutai fetch failed', e);
            }
        }

        // ----- 日経から企業概要(HPのURL等)を取得 -----
        if (signal.aborted) return;
        let nikkeiProfileInfo = null;
        if (symbol.endsWith('.T')) {
            notifyProgress(95, "企業概要を取得中...");
            try {
                const nikkeiProfileResp = await fetch(`/api/nikkei_profile?symbol=${encodeURIComponent(symbol)}`, { signal });
                if (nikkeiProfileResp.ok) {
                    if (signal.aborted) return;
                    const profileData = await nikkeiProfileResp.json();
                    if (!profileData.error) nikkeiProfileInfo = profileData;
                }
            } catch (e) {
                if (e.name === 'AbortError') return;
                console.warn('Nikkei profile fetch failed', e);
            }
        }
        
        lastFinanceData = { 
            isLite: false,
            labels, 
            revenues, 
            grossMargins, 
            opMargins, 
            netMargins, 
            roes, 
            equityRatios,
            grossProfits, 
            opIncomes, 
            netIncomes,
            forecast: forecast ? forecast / 1000000 : null,
            dividendData: dividendData,
            currentPrice: lastCurrentPrice,
            businessInfo: businessInfo,
            newsInfo: newsInfo,
            yahooNewsInfo: yahooNewsInfo,
            nikkeiNewsInfo: nikkeiNewsInfo,
            minkabuNewsInfo: minkabuNewsInfo,
            tradersWebNewsInfo: tradersWebNewsInfo,
            yutaiInfo: yutaiInfo,
            nikkeiProfileInfo: nikkeiProfileInfo
        };
        
        notifyProgress(100, "取得完了");
        
        // 別ウィンドウが開いていれば更新
        if (financeWindow && !financeWindow.closed) {
            const stock = STOCKS[currentIndex];
            financeWindow.updateFinancials(stock.symbol.replace('.T', ''), stock.name, lastFinanceData);
            if (forceFull && typeof financeWindow.resetFullDataBtn === 'function') {
                financeWindow.resetFullDataBtn();
            }
        }
        
    } catch (e) {
        if (e.name === 'AbortError') return; // キャンセルは正常終了
        console.error("Failed to fetch finance data", e);
        lastFinanceData = null;
        if (forceFull && financeWindow && !financeWindow.closed && typeof financeWindow.resetFullDataBtn === 'function') {
            financeWindow.resetFullDataBtn();
        }
    }
}

// 別ウィンドウから全データを取得するための公開関数
window.fetchAndRenderFinanceDataFull = function(symbol) {
    fetchAndRenderFinanceData(symbol, true);
};

init();
