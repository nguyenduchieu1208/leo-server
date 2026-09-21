/**
 * Frontend Application Logic for AMECC Materials Tracker - Super Fast & Light Theme Edition
 * Tối ưu hóa hiệu năng đỉnh cao:
 * 1. Phân trang tải luân phiên (Virtual Batch Rendering / Infinite Scroll)
 * 2. Tải lười (Lazy-render) chi tiết BTP: Chỉ vẽ bảng khi bấm mở cấu kiện
 * 3. Tải lười các Tab (Chỉ vẽ Timeline hoặc Shape khi người dùng bấm vào tab đó)
 * 4. Sử dụng Inline SVG siêu nhẹ thay cho việc quét toàn trang với Lucide
 */

const SVG_ICONS = {
    chevronRight: `<svg class="w-4 h-4 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>`,
    chevronDown: `<svg class="w-4 h-4 text-blue-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>`,
    check: `<svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
    clock: `<svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
    x: `<svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
    alertTriangle: `<svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`
};

let state = {
    projects: [],
    currentProject: null,
    projectData: null,
    selectedSheet: 'all',
    selectedDate: 'all',
    selectedStatus: 'all',
    searchQuery: '',
    isAdmin: false,
    isStaticMode: window.location.protocol === 'file:' || window.location.hostname.endsWith('github.io') || window.location.hostname.endsWith('pages.dev'),
    expandedAssemblies: new Set(),
    filterCollapsed: false,
    // Performance pagination
    visibleCount: 35,
    filteredAssemblies: [],
    activeTab: 'tree',
    scrollObserver: null,
    dvgUnit: 'kg',
    analyticsMode: 'dvg',
    activeDvgFilter: 'all',
    dvgSearchQuery: '',
    chartMetric: 'weight'
};

let chartDvgBarInstance = null;
let chartDvgDoughnutInstance = null;

// Cập nhật các lựa chọn và nhãn trên thanh bộ lọc thu gọn
function updateCompactFilterBadges() {
    const pSelect = document.getElementById('compact-select-project');
    const mainPSelect = document.getElementById('select-project');
    const sSelect = document.getElementById('compact-select-sheet');
    const mainSSelect = document.getElementById('select-sheet');
    const dLabel = document.getElementById('compact-date-label');
    const cSearch = document.getElementById('compact-input-search');
    const mainSearch = document.getElementById('input-search');
    
    if (pSelect && mainPSelect) {
        if (mainPSelect.value) {
            pSelect.value = mainPSelect.value;
        }
        if (!pSelect.value && state.currentProject) {
            for (let i = 0; i < pSelect.options.length; i++) {
                if (pSelect.options[i].value.includes(state.currentProject) || pSelect.options[i].text.includes(state.currentProject)) {
                    pSelect.selectedIndex = i;
                    break;
                }
            }
        }
        if (!pSelect.value && mainPSelect.selectedIndex >= 0 && pSelect.options.length > mainPSelect.selectedIndex) {
            pSelect.selectedIndex = mainPSelect.selectedIndex;
        }
    }
    if (sSelect && sSelect.value !== state.selectedSheet) {
        sSelect.value = state.selectedSheet || 'all';
    }
    if (mainSSelect && mainSSelect.value !== state.selectedSheet) {
        mainSSelect.value = state.selectedSheet || 'all';
    }
    if (dLabel) {
        dLabel.textContent = state.selectedDate === 'all' ? 'Tất cả ngày' : `📅 Ngày ${formatDateDisplay(state.selectedDate)}`;
    }
    if (cSearch && mainSearch && cSearch.value !== mainSearch.value) {
        cSearch.value = mainSearch.value;
    }
}

// Chuyển đổi trạng thái Thu gọn / Mở rộng của Bảng lọc
function toggleFilterCollapse(forceState = null) {
    const isCollapsed = forceState !== null ? forceState : !state.filterCollapsed;
    state.filterCollapsed = isCollapsed;
    localStorage.setItem('amecc_filter_collapsed', isCollapsed ? 'true' : 'false');
    
    const topBar = document.getElementById('filter-top-bar');
    const fullContent = document.getElementById('filter-full-content');
    const compactContent = document.getElementById('filter-compact-content');

    if (isCollapsed) {
        // Thu gọn: ẩn thanh tiêu đề trên và 3 dòng đầy đủ, chỉ hiện thanh thu gọn với DUY NHẤT 1 nút Mở Rộng
        if (topBar) topBar.classList.add('hidden');
        if (fullContent) fullContent.classList.add('hidden');
        if (compactContent) compactContent.classList.remove('hidden');
    } else {
        // Mở rộng: hiện thanh tiêu đề trên với DUY NHẤT 1 nút Thu Gọn và 3 dòng đầy đủ
        if (topBar) topBar.classList.remove('hidden');
        if (fullContent) fullContent.classList.remove('hidden');
        if (compactContent) compactContent.classList.add('hidden');
    }
    if (window.lucide) lucide.createIcons();
    updateCompactFilterBadges();
}

// Hàm chuyển đổi định dạng hiển thị sang Ngày/Tháng/Năm (DD/MM/YYYY)
function formatDateDisplay(dStr) {
    if (!dStr || dStr === 'all') return dStr;
    const s = String(dStr).trim();
    const mISO = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
    if (mISO) {
        const [, y, mo, d] = mISO;
        return `${d.padStart(2, '0')}/${mo.padStart(2, '0')}/${y}`;
    }
    return s;
}

// Hàm tính khóa sắp xếp theo thời gian chính xác
function parseDateSortKey(dStr) {
    if (!dStr || dStr === 'all') return 0;
    const s = String(dStr).trim();
    const mVN = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (mVN) {
        return new Date(parseInt(mVN[3]), parseInt(mVN[2]) - 1, parseInt(mVN[1])).getTime();
    }
    const mISO = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
    if (mISO) {
        return new Date(parseInt(mISO[1]), parseInt(mISO[2]) - 1, parseInt(mISO[3])).getTime();
    }
    return new Date(s).getTime() || 0;
}

document.addEventListener('DOMContentLoaded', async () => {
    lucide.createIcons();
    await loadServerInfo();
    setInterval(loadServerInfo, 15000); // Giãn tần suất polling để không gây nghẽn mạng
    
    await loadProjectsList();
    await loadAnnouncements();
    setupAnnouncementEvents();
    setupEventListeners();
});

// Hiển thị giao diện Chế độ Online 24/24 Cloud
function renderStaticModeUI() {
    state.isStaticMode = true;
    state.isAdmin = false;
    const cloudBox = document.getElementById('online-cloud-box');
    if (cloudBox) {
        cloudBox.classList.remove('hidden');
        cloudBox.classList.add('inline-flex');
    }
    const lanBox = document.getElementById('lan-box');
    if (lanBox) { lanBox.classList.add('hidden'); lanBox.classList.remove('flex'); }
    const tunnelBox = document.getElementById('tunnel-box');
    if (tunnelBox) { tunnelBox.classList.add('hidden'); tunnelBox.classList.remove('flex'); }
    const btnReload = document.getElementById('btn-reload-data');
    if (btnReload) { btnReload.classList.add('hidden'); btnReload.classList.remove('flex'); }
    const btnUpload = document.getElementById('btn-upload-excel');
    if (btnUpload) { btnUpload.classList.add('hidden'); btnUpload.classList.remove('flex'); }
}

// 1. Tải thông tin mạng LAN & Public Link & Phân quyền Admin
async function loadServerInfo() {
    if (state.isStaticMode) {
        renderStaticModeUI();
        return;
    }
    try {
        const res = await fetch('/api/info');
        if (!res.ok) throw new Error('API server không khả dụng');
        const info = await res.json();
        state.isAdmin = info.is_admin || false;
        
        const ipText = document.getElementById('lan-ip-text');
        if (ipText) {
            ipText.textContent = info.lan_url;
            ipText.dataset.url = info.lan_url;
        }

        const lanBox = document.getElementById('lan-box');
        if (lanBox) {
            if (state.isAdmin) {
                lanBox.classList.remove('hidden');
                lanBox.classList.add('flex');
            } else {
                lanBox.classList.add('hidden');
                lanBox.classList.remove('flex');
            }
        }

        const tunnelBox = document.getElementById('tunnel-box');
        const tunnelText = document.getElementById('tunnel-url-text');
        if (tunnelBox) {
            if (state.isAdmin) {
                tunnelBox.classList.remove('hidden');
                tunnelBox.classList.add('flex');
                if (tunnelText) {
                    if (info.public_url) {
                        tunnelText.textContent = info.public_url;
                        tunnelText.dataset.url = info.public_url;
                    } else {
                        tunnelText.textContent = "Đang kết nối...";
                    }
                }
            } else {
                tunnelBox.classList.add('hidden');
                tunnelBox.classList.remove('flex');
            }
        }

        const btnReload = document.getElementById('btn-reload-data');
        if (btnReload) {
            if (state.isAdmin) {
                btnReload.classList.remove('hidden');
                btnReload.classList.add('flex');
            } else {
                btnReload.classList.add('hidden');
                btnReload.classList.remove('flex');
            }
        }

        const btnUpload = document.getElementById('btn-upload-excel');
        if (btnUpload) {
            if (state.isAdmin) {
                btnUpload.classList.remove('hidden');
                btnUpload.classList.add('flex');
            } else {
                btnUpload.classList.add('hidden');
                btnUpload.classList.remove('flex');
            }
        }

        const btnEditAnn = document.getElementById('btn-edit-announcement');
        if (btnEditAnn) {
            if (state.isAdmin) {
                btnEditAnn.classList.remove('hidden');
                btnEditAnn.classList.add('inline-flex');
            } else {
                btnEditAnn.classList.add('hidden');
                btnEditAnn.classList.remove('inline-flex');
            }
        }
        const btnViewToEdit = document.getElementById('btn-view-to-edit-announcement');
        if (btnViewToEdit) {
            if (state.isAdmin) {
                btnViewToEdit.classList.remove('hidden');
                btnViewToEdit.classList.add('inline-flex');
            } else {
                btnViewToEdit.classList.add('hidden');
                btnViewToEdit.classList.remove('inline-flex');
            }
        }
    } catch (e) {
        renderStaticModeUI();
    }
}

// 2. Tải danh sách file dự án
async function loadProjectsList(preferredFilePath = null) {
    const select = document.getElementById('select-project');
    try {
        let data = null;
        if (!state.isStaticMode) {
            try {
                const res = await fetch('/api/projects');
                if (res.ok) {
                    data = await res.json();
                }
            } catch (err) {
                renderStaticModeUI();
            }
        }

        // Nếu ở chế độ Static hoặc API không phản hồi -> Đọc file data/projects.json
        if (!data) {
            const res = await fetch(`data/projects.json?t=${Date.now()}`, { cache: 'no-store' });
            if (res.ok) {
                data = await res.json();
                renderStaticModeUI();
            } else {
                throw new Error("Không thể tải danh sách dự án từ máy chủ hoặc dữ liệu tĩnh.");
            }
        }

        state.projects = data.projects || [];
        
        select.innerHTML = '';
        const compactSelectProj = document.getElementById('compact-select-project');
        if (compactSelectProj) compactSelectProj.innerHTML = '';

        if (state.projects.length === 0) {
            select.innerHTML = '<option value="">Không tìm thấy file PL nào trong thư mục Data</option>';
            if (compactSelectProj) compactSelectProj.innerHTML = '<option value="">Không có file</option>';
            return;
        }

        let targetFile = preferredFilePath;
        let found = false;

        state.projects.forEach((p) => {
            const opt = document.createElement('option');
            opt.value = p.file_path;
            const sizeStr = p.size_bytes ? ` (${(p.size_bytes / 1024 / 1024).toFixed(1)} MB)` : '';
            opt.textContent = `${p.display_name || p.project_id}${sizeStr}`;
            if (targetFile && (p.file_path === targetFile || p.project_id === targetFile)) found = true;
            select.appendChild(opt);

            if (compactSelectProj) {
                const cOpt = document.createElement('option');
                cOpt.value = p.file_path;
                cOpt.textContent = p.display_name || p.project_id;
                compactSelectProj.appendChild(cOpt);
            }
        });

        if (!found && state.projects.length > 0) {
            targetFile = state.projects[0].file_path;
        }

        if (targetFile) {
            select.value = targetFile;
            if (compactSelectProj) compactSelectProj.value = targetFile;
            await loadProjectData(targetFile, true);
        }
    } catch (e) {
        select.innerHTML = '<option value="">Lỗi nạp danh sách file PL</option>';
        console.error(e);
    }
}

// 3. Tải chi tiết dữ liệu dự án
async function loadProjectData(filePath, forceReload = false) {
    const container = document.getElementById('assemblies-container');
    container.innerHTML = `
        <div class="text-center py-16 bg-white border border-slate-200 rounded-2xl shadow-xs">
            <div class="inline-block animate-spin text-blue-600 mb-3">
                <i data-lucide="loader-2" class="w-8 h-8"></i>
            </div>
            <p class="text-slate-600 text-sm font-medium">Đang tải và nạp dữ liệu...</p>
        </div>
    `;
    lucide.createIcons();

    try {
        let projData = null;
        if (!state.isStaticMode) {
            try {
                const url = `/api/project-data?file_path=${encodeURIComponent(filePath)}${forceReload ? '&force_reload=true' : ''}`;
                const res = await fetch(url);
                if (res.ok) {
                    projData = await res.json();
                }
            } catch (err) {
                renderStaticModeUI();
            }
        }

        // Nếu ở chế độ Static hoặc API không phản hồi -> Đọc file data/{project_id}.json
        if (!projData) {
            let pObj = state.projects.find(p => p.file_path === filePath || p.project_id === filePath || p.file_name === filePath);
            let projCode = pObj ? pObj.project_id : filePath.split('/').pop().split('\\').pop().replace('PL.xlsx', '').replace('.xlsx', '').replace('.json', '');
            
            const timestamp = Date.now();
            let jsonUrl = `data/${projCode}.json`;
            let res = await fetch(`${jsonUrl}?t=${timestamp}`, { cache: 'no-store' });
            if (!res.ok) {
                jsonUrl = `data/${projCode}PL.json`;
                res = await fetch(`${jsonUrl}?t=${timestamp}`, { cache: 'no-store' });
            }
            if (res.ok) {
                projData = await res.json();
                renderStaticModeUI();
            } else {
                throw new Error(`Không thể nạp dữ liệu cho dự án: ${projCode}`);
            }
        }

        state.projectData = projData;
        state.currentProject = (filePath.split('/').pop() || '').split('\\').pop().replace('PL.xlsx', '').replace('.xlsx', '').replace('.json', '');
        state.expandedAssemblies.clear();
        state.selectedDate = 'all';
        state.selectedSheet = 'all';
        state.visibleCount = 35;
        
        renderSheetSelector();
        renderDatePills();
        updateKPIs();
        updateCompactFilterBadges();
        applyFiltersAndRender(true);

        // Tải nội dung tab tương ứng nếu đang mở Tab Timeline, DVG hoặc QLDA
        if (state.activeTab === 'timeline') renderDailyTimeline();
        if (state.activeTab === 'dvg') renderDvgAnalytics();
        if (state.activeTab === 'qlda') initOrRenderQlda();

    } catch (e) {
        container.innerHTML = `
            <div class="p-8 text-center bg-red-50 border border-red-200 rounded-2xl text-red-800">
                <i data-lucide="alert-circle" class="w-10 h-10 mx-auto mb-2 text-red-600"></i>
                <h3 class="font-bold text-base">Lỗi khi đọc dữ liệu dự án</h3>
                <p class="text-xs text-red-600 mt-1">${e.message}</p>
            </div>
        `;
        lucide.createIcons();
    }
}

// 4. Cập nhật các thẻ KPI
function updateKPIs() {
    if (!state.projectData) return;
    const data = state.projectData;
    
    const kpiTotal = document.getElementById('kpi-total-assy');
    const kpiCompleted = document.getElementById('kpi-completed-assy');
    const kpiPartial = document.getElementById('kpi-partial-assy');
    const kpiDvgRate = document.getElementById('kpi-dvg-highlight-rate');
    const kpiDvgSub = document.getElementById('kpi-dvg-highlight-sub');

    if (kpiTotal) kpiTotal.textContent = (data.total_assemblies || 0).toLocaleString('vi-VN');
    if (kpiCompleted) kpiCompleted.textContent = (data.completed_assemblies || 0).toLocaleString('vi-VN');
    if (kpiPartial) kpiPartial.textContent = (data.partial_assemblies || 0).toLocaleString('vi-VN');

    // Cập nhật thẻ KPI 4: Tiến độ khối lượng toàn dự án (DVG)
    if (kpiDvgRate || kpiDvgSub) {
        const { totals } = computeDvgAnalyticsData();
        if (kpiDvgRate) kpiDvgRate.textContent = `${totals.completion_rate_weight}%`;
        if (kpiDvgSub) kpiDvgSub.textContent = `Đã nhận: ${formatWeightVal(totals.da_nhan_weight)}`;
    }
}

// Hiển thị danh sách dropdown chọn Sheet (Đồng bộ cả thanh Đầy đủ và thanh Thu gọn)
function renderSheetSelector() {
    const selectSheet = document.getElementById('select-sheet');
    const compactSelectSheet = document.getElementById('compact-select-sheet');
    if (!state.projectData) return;

    if (selectSheet) selectSheet.innerHTML = '<option value="all">📂 Tất cả hạng mục (Sheets)</option>';
    if (compactSelectSheet) compactSelectSheet.innerHTML = '<option value="all">📂 Tất cả sheet</option>';

    const bomSheets = state.projectData.bom_sheets || [];
    bomSheets.forEach(s => {
        if (selectSheet) {
            const opt = document.createElement('option');
            opt.value = s;
            opt.textContent = `Hạng mục: ${s}`;
            selectSheet.appendChild(opt);
        }
        if (compactSelectSheet) {
            const cOpt = document.createElement('option');
            cOpt.value = s;
            cOpt.textContent = `Sheet: ${s}`;
            compactSelectSheet.appendChild(cOpt);
        }
    });

    if (selectSheet) selectSheet.value = state.selectedSheet || 'all';
    if (compactSelectSheet) compactSelectSheet.value = state.selectedSheet || 'all';
}

// 5. Quản lý Lịch chọn ngày trực quan & Dropdown chọn ngày
let calendarState = {
    currentYear: new Date().getFullYear() || 2026,
    currentMonth: new Date().getMonth() + 1 // Tự động lấy tháng hiện tại thay vì gán cứng
};

function selectDeliveryDate(dStr) {
    state.selectedDate = dStr;
    const select = document.getElementById('select-date');
    const label = document.getElementById('current-date-label');
    const modal = document.getElementById('modal-calendar-picker');

    if (select) select.value = dStr;
    if (label) {
        label.textContent = dStr !== 'all' ? formatDateDisplay(dStr) : 'Tất cả ngày';
    }
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }

    updateCompactFilterBadges();
    applyFiltersAndRender(true);
    if (state.activeTab === 'timeline') renderDailyTimeline();
}

function openCalendarModal() {
    const modal = document.getElementById('modal-calendar-picker');
    if (!modal || !state.projectData) return;

    const rawDates = state.projectData.all_delivery_dates || [];
    
    // Nếu có ngày đang chọn, mở đúng tháng/năm của ngày đó
    if (state.selectedDate && state.selectedDate !== 'all' && state.selectedDate.includes('/')) {
        const parts = state.selectedDate.split('/');
        calendarState.currentMonth = parseInt(parts[1], 10);
        calendarState.currentYear = parseInt(parts[2], 10);
    } else if (rawDates.length > 0) {
        // Lấy ngày giao gần nhất trong danh sách
        const lastDate = rawDates[rawDates.length - 1];
        if (lastDate.includes('/')) {
            const parts = lastDate.split('/');
            calendarState.currentMonth = parseInt(parts[1], 10);
            calendarState.currentYear = parseInt(parts[2], 10);
        }
    }

    populateQuickMonthSelect();
    renderCalendarGrid();

    modal.classList.remove('hidden');
    modal.classList.add('flex');
    if (window.lucide) lucide.createIcons();
}

function populateQuickMonthSelect() {
    const selectQuick = document.getElementById('select-cal-quick-month');
    if (!selectQuick || !state.projectData) return;

    const rawDates = state.projectData.all_delivery_dates || [];
    const monthMap = {};

    rawDates.forEach(d => {
        if (d.includes('/')) {
            const [dayStr, moStr, yrStr] = d.split('/');
            const key = `${yrStr}-${moStr.padStart(2, '0')}`;
            if (!monthMap[key]) {
                monthMap[key] = { year: parseInt(yrStr, 10), month: parseInt(moStr, 10), count: 0 };
            }
            monthMap[key].count++;
        }
    });

    selectQuick.innerHTML = '<option value="">Chọn tháng có hàng...</option>';
    Object.keys(monthMap).sort().forEach(k => {
        const item = monthMap[k];
        const opt = document.createElement('option');
        opt.value = `${item.year}-${item.month}`;
        opt.textContent = `Tháng ${item.month.toString().padStart(2, '0')}/${item.year} (${item.count} ngày có hàng)`;
        selectQuick.appendChild(opt);
    });

    selectQuick.onchange = (e) => {
        if (e.target.value) {
            const [y, m] = e.target.value.split('-');
            calendarState.currentYear = parseInt(y, 10);
            calendarState.currentMonth = parseInt(m, 10);
            renderCalendarGrid();
        }
    };
}

function renderCalendarGrid() {
    const grid = document.getElementById('cal-days-grid');
    const labelMonthYear = document.getElementById('cal-month-year-label');
    if (!grid || !state.projectData) return;

    const year = calendarState.currentYear;
    const month = calendarState.currentMonth;

    if (labelMonthYear) {
        labelMonthYear.textContent = `Tháng ${month.toString().padStart(2, '0')} / ${year}`;
    }

    const deliveryMap = {};
    const rawDates = state.projectData.all_delivery_dates || [];
    const dailyData = state.projectData.daily_delivery || {};

    rawDates.forEach(d => {
        if (d.includes('/')) {
            const [dayStr, moStr, yrStr] = d.split('/');
            if (parseInt(yrStr, 10) === year && parseInt(moStr, 10) === month) {
                const dayNum = parseInt(dayStr, 10);
                const info = dailyData[d] || {};
                deliveryMap[dayNum] = {
                    dateStr: d,
                    itemsCount: info.total_items_count || 0,
                    qty: info.total_qty || 0,
                    assembliesCount: (info.assemblies_affected || []).length
                };
            }
        }
    });

    const firstDayDate = new Date(year, month - 1, 1);
    let startDayOfWeek = (firstDayDate.getDay() + 6) % 7;
    const daysInMonth = new Date(year, month, 0).getDate();

    let gridHtml = '';

    for (let i = 0; i < startDayOfWeek; i++) {
        gridHtml += `<div class="p-2 sm:p-2.5 rounded-xl bg-slate-50/50 border border-transparent"></div>`;
    }

    for (let day = 1; day <= daysInMonth; day++) {
        const hasDelivery = deliveryMap[day] !== undefined;
        const dInfo = deliveryMap[day];
        const isSelected = dInfo && state.selectedDate === dInfo.dateStr;

        if (hasDelivery) {
            const tooltip = `Ngày ${dInfo.dateStr}: ${dInfo.assembliesCount} cấu kiện, ${dInfo.itemsCount} BTP`;
            const activeRing = isSelected ? 'ring-3 ring-amber-400 ring-offset-2' : '';
            gridHtml += `
                <button type="button" class="cal-day-btn relative flex flex-col items-center justify-center p-2 sm:p-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-bold transition shadow-xs cursor-pointer ${activeRing}" 
                    data-date="${dInfo.dateStr}" title="${tooltip}">
                    <span class="text-xs sm:text-sm font-extrabold leading-tight">${day}</span>
                    <span class="text-[9px] block text-blue-100 font-mono tracking-tight whitespace-nowrap mt-0.5">📦 ${dInfo.assembliesCount} CK</span>
                </button>
            `;
        } else {
            gridHtml += `
                <div class="flex flex-col items-center justify-center p-2 sm:p-2.5 rounded-xl bg-slate-100/50 border border-slate-200/60 text-slate-400 select-none">
                    <span class="text-xs sm:text-sm font-medium leading-tight">${day}</span>
                    <span class="text-[9px] block text-slate-300 mt-0.5">-</span>
                </div>
            `;
        }
    }

    grid.innerHTML = gridHtml;

    grid.querySelectorAll('.cal-day-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const d = this.dataset.date;
            if (d) selectDeliveryDate(d);
        });
    });
}

function renderDateSelector() {
    const select = document.getElementById('select-date');
    const label = document.getElementById('current-date-label');
    const btnOpenCalendar = document.getElementById('btn-open-calendar');
    const btnAll = document.getElementById('btn-date-all');

    if (!select || !state.projectData) return;
    
    const rawDates = state.projectData.all_delivery_dates || [];
    // Sắp xếp giảm dần: Ngày mới nhất (vd: 17/09) lên đầu tiên để người dùng dễ chọn ngay lập tức
    const sortedDates = [...rawDates].sort((a, b) => parseDateSortKey(b) - parseDateSortKey(a));
    
    select.innerHTML = `<option value="all">📅 Tất cả ngày nhận (Toàn bộ ${sortedDates.length} ngày)</option>`;

    sortedDates.forEach((d, idx) => {
        const opt = document.createElement('option');
        opt.value = d;
        const latestTag = idx === 0 ? ' (Mới nhất)' : '';
        opt.textContent = `📅 Ngày ${formatDateDisplay(d)}${latestTag}`;
        select.appendChild(opt);
    });

    select.value = state.selectedDate || 'all';
    if (label) {
        label.textContent = state.selectedDate && state.selectedDate !== 'all' ? formatDateDisplay(state.selectedDate) : 'Tất cả ngày';
    }

    select.onchange = (e) => {
        selectDeliveryDate(e.target.value);
    };

    if (btnAll) {
        btnAll.onclick = () => {
            selectDeliveryDate('all');
        };
    }

    if (btnOpenCalendar) {
        btnOpenCalendar.onclick = openCalendarModal;
    }


    // Gắn sự kiện điều hướng tháng trong modal
    const btnPrev = document.getElementById('btn-cal-prev-month');
    const btnNext = document.getElementById('btn-cal-next-month');
    const btnClose = document.getElementById('btn-close-calendar');
    const btnCloseBottom = document.getElementById('btn-cal-close-bottom');
    const btnViewAll = document.getElementById('btn-cal-view-all');
    const modal = document.getElementById('modal-calendar-picker');

    if (btnPrev) {
        btnPrev.onclick = () => {
            calendarState.currentMonth--;
            if (calendarState.currentMonth < 1) {
                calendarState.currentMonth = 12;
                calendarState.currentYear--;
            }
            renderCalendarGrid();
        };
    }

    if (btnNext) {
        btnNext.onclick = () => {
            calendarState.currentMonth++;
            if (calendarState.currentMonth > 12) {
                calendarState.currentMonth = 1;
                calendarState.currentYear++;
            }
            renderCalendarGrid();
        };
    }

    const closeModal = () => {
        if (modal) {
            modal.classList.add('hidden');
            modal.classList.remove('flex');
        }
    };

    if (btnClose) btnClose.onclick = closeModal;
    if (btnCloseBottom) btnCloseBottom.onclick = closeModal;
    if (btnViewAll) {
        btnViewAll.onclick = () => selectDeliveryDate('all');
    }
    if (modal) {
        modal.onclick = (e) => {
            if (e.target === modal) closeModal();
        };
    }
}
const renderDatePills = renderDateSelector;

// Hàm đánh dấu nổi bật từ khóa tìm kiếm (Highlight Search)
function highlightText(text, query) {
    if (!text || !query) return text !== undefined && text !== null ? String(text) : '';
    const str = String(text);
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${escaped})`, 'gi');
    return str.replace(regex, '<mark class="bg-amber-200 text-amber-950 font-bold px-0.5 rounded-xs">$1</mark>');
}

// Hàm hiển thị dải tiến độ từng Hạng mục (Sheet Progress Breakdown)
function renderSheetBreakdown() {
    const section = document.getElementById('sheet-breakdown-section');
    const container = document.getElementById('sheet-chips-container');
    if (!section || !container || !state.projectData) return;

    const allAssemblies = state.projectData.assemblies || [];
    const sheets = state.projectData.sheets || [];

    if (sheets.length <= 1) {
        section.classList.add('hidden');
        return;
    }

    section.classList.remove('hidden');

    // Thống kê theo từng sheet
    const statsBySheet = {};
    sheets.forEach(s => {
        statsBySheet[s] = { total: 0, completed: 0 };
    });

    allAssemblies.forEach(a => {
        const s = a.sheet || 'Khac';
        if (!statsBySheet[s]) statsBySheet[s] = { total: 0, completed: 0 };
        statsBySheet[s].total++;
        if (a.status === 'completed') {
            statsBySheet[s].completed++;
        }
    });

    let html = `
        <button type="button" class="sheet-filter-chip flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold transition shadow-2xs cursor-pointer active:scale-95 ${state.selectedSheet === 'all' ? 'bg-blue-600 text-white border-blue-600 ring-2 ring-blue-300' : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'}" data-sheet="all">
            <span>📂 Tất cả (${allAssemblies.length} CK)</span>
        </button>
    `;

    sheets.forEach(s => {
        const st = statsBySheet[s] || { total: 0, completed: 0 };
        const percent = st.total > 0 ? Math.round((st.completed / st.total) * 100) : 0;
        const isSelected = state.selectedSheet === s;
        const badgeColor = percent === 100 ? 'bg-emerald-100 text-emerald-800' : (percent > 0 ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600');
        const activeClass = isSelected ? 'bg-indigo-600 text-white border-indigo-600 ring-2 ring-indigo-300' : 'bg-white text-slate-800 border-slate-200 hover:bg-slate-50';

        html += `
            <button type="button" class="sheet-filter-chip flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-bold transition shadow-2xs cursor-pointer active:scale-95 ${activeClass}" data-sheet="${s}">
                <span class="font-mono font-bold">${s}</span>
                <span class="px-1.5 py-0.5 rounded text-[10px] font-bold ${isSelected ? 'bg-white/20 text-white' : badgeColor}">
                    ${percent}% (${st.completed}/${st.total})
                </span>
            </button>
        `;
    });

    container.innerHTML = html;

    container.querySelectorAll('.sheet-filter-chip').forEach(btn => {
        btn.addEventListener('click', function() {
            const targetSheet = this.dataset.sheet;
            if (state.selectedSheet === targetSheet && targetSheet !== 'all') {
                state.selectedSheet = 'all';
            } else {
                state.selectedSheet = targetSheet;
            }
            const selectSheet = document.getElementById('select-sheet');
            if (selectSheet) selectSheet.value = state.selectedSheet;
            
            const badge = document.getElementById('export-scope-badge');
            if (badge) {
                badge.textContent = state.selectedSheet === 'all' ? 'Tất cả các sheet' : `Hạng mục: ${state.selectedSheet}`;
            }
            updateCompactFilterBadges();
            applyFiltersAndRender(true);
        });
    });
}

// 6. Áp dụng bộ lọc và kích hoạt vẽ danh sách
function applyFiltersAndRender(resetPagination = true) {
    if (!state.projectData) return;
    let assemblies = state.projectData.assemblies || [];

    // Kiểm tra và hiển thị nút Đặt lại bộ lọc (Reset All Filters)
    const isFiltered = (state.selectedSheet && state.selectedSheet !== 'all') ||
                       (state.selectedStatus && state.selectedStatus !== 'all') ||
                       (state.selectedDate && state.selectedDate !== 'all') ||
                       (state.searchQuery && state.searchQuery.trim() !== '');

    const btnReset = document.getElementById('btn-reset-filters');
    const btnCompactReset = document.getElementById('btn-compact-reset-filters');
    if (btnReset) {
        if (isFiltered) {
            btnReset.classList.remove('hidden');
            btnReset.classList.add('flex');
        } else {
            btnReset.classList.add('hidden');
            btnReset.classList.remove('flex');
        }
    }
    if (btnCompactReset) {
        if (isFiltered) {
            btnCompactReset.classList.remove('hidden');
            btnCompactReset.classList.add('flex');
        } else {
            btnCompactReset.classList.add('hidden');
            btnCompactReset.classList.remove('flex');
        }
    }

    // Lọc theo Hạng mục (Sheet)
    if (state.selectedSheet && state.selectedSheet !== 'all') {
        assemblies = assemblies.filter(a => a.sheet === state.selectedSheet);
    }

    // Lọc theo Tìm kiếm & Tự động mở rộng cấu kiện khớp BTP con
    if (state.searchQuery) {
        const q = state.searchQuery.toLowerCase();
        assemblies = assemblies.filter(a => {
            const matchAssy = a.assembly_no.toLowerCase().includes(q) || 
                              a.dwg.toLowerCase().includes(q) || 
                              a.size.toLowerCase().includes(q);
            const matchParts = a.parts && a.parts.some(p => 
                (p.part_no && p.part_no.toLowerCase().includes(q)) || 
                (p.part_cut && p.part_cut.toLowerCase().includes(q)) || 
                (p.size && p.size.toLowerCase().includes(q)) ||
                (p.material && p.material.toLowerCase().includes(q)) ||
                (p.ghi_chu && p.ghi_chu.toLowerCase().includes(q))
            );
            if (matchParts) {
                state.expandedAssemblies.add(a.id);
                return true;
            }
            return matchAssy;
        });
    }

    // Lọc theo trạng thái
    if (state.selectedStatus !== 'all') {
        if (state.selectedStatus === 'shape_issue') {
            assemblies = assemblies.filter(a => a.has_shape_issue);
        } else {
            assemblies = assemblies.filter(a => a.status === state.selectedStatus);
        }
    }

    // Lọc theo Ngày nhận
    if (state.selectedDate !== 'all') {
        assemblies = assemblies.filter(a => {
            return a.daily_received && a.daily_received[state.selectedDate] > 0;
        });
    }

    state.filteredAssemblies = assemblies;
    if (resetPagination) {
        state.visibleCount = 35;
    }

    const countElem = document.getElementById('filtered-assy-count');
    if (countElem) countElem.textContent = assemblies.length;

    renderSheetBreakdown();
    renderAssemblies();
    if (state.activeTab === 'dvg') renderDvgAnalytics();
}

// 7. Tạo HTML chi tiết bảng BTP con (Chỉ tạo khi người dùng bấm mở thẻ)
function buildPartsTableHtml(assy) {
    if (!assy.parts || assy.parts.length === 0) {
        return `<p class="p-4 text-xs text-slate-400 italic">Không có chi tiết BTP con nào.</p>`;
    }

    return `
        <!-- Chỉ báo vuốt ngang trên màn hình điện thoại -->
        <div class="sm:hidden flex items-center justify-between text-[11px] text-slate-500 font-medium px-1 mb-1.5">
            <span class="flex items-center gap-1 text-blue-600 font-bold">
                <span>👈</span> Vuốt ngang xem đủ 12 cột BTP <span>👉</span>
            </span>
            <span class="font-mono font-semibold text-slate-700">${assy.parts.length} BTP</span>
        </div>
        <div class="overflow-x-auto bg-white rounded-xl border border-slate-200 shadow-2xs">
            <table class="w-full text-left text-xs border-collapse">
                <thead>
                    <tr class="bg-slate-100 text-slate-700 border-b border-slate-200 uppercase font-bold text-[11px]">
                        <th class="py-2 px-3">Mã BTP (Chi tiết)</th>
                        <th class="py-2 px-3">Chủng Loại</th>
                        <th class="py-2 px-3">DVG</th>
                        <th class="py-2 px-3">Quy Cách (Size)</th>
                        <th class="py-2 px-3 text-right">Chiều Dài (mm)</th>
                        <th class="py-2 px-3 text-right">SL Thiết Kế</th>
                        <th class="py-2 px-3 text-right">Đã Nhận</th>
                        <th class="py-2 px-3 text-right">Còn Thiếu</th>
                        <th class="py-2 px-3">Tiến Độ Theo Ngày</th>
                        <th class="py-2 px-3 text-center">Ktra Nối</th>
                        <th class="py-2 px-3">Trạng Thái</th>
                        <th class="py-2 px-3">Ghi Chú</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-slate-200">
                    ${assy.parts.map(p => {
                        const sa = p.shape_analysis || {};
                        let chungLoaiBadge = '<span class="px-2 py-0.5 rounded text-[10px] bg-slate-100 text-slate-600 font-bold">Khác</span>';
                        if (p.chung_loai.toUpperCase() === 'PLATE') {
                            chungLoaiBadge = '<span class="px-2 py-0.5 rounded text-[10px] badge-plate font-bold">PLATE</span>';
                        } else if (sa.is_shape) {
                            chungLoaiBadge = '<span class="px-2 py-0.5 rounded text-[10px] badge-shape font-bold">SHAPE</span>';
                        } else if (p.chung_loai.toUpperCase().includes('PUR')) {
                            chungLoaiBadge = '<span class="px-2 py-0.5 rounded text-[10px] badge-purchasing font-bold">PURCHASING</span>';
                        }

                        const dateKeys = Object.keys(p.dates_received || {}).sort((a, b) => parseDateSortKey(a) - parseDateSortKey(b));
                        let datesHtml = '';
                        if (dateKeys.length > 0) {
                            datesHtml = dateKeys.map(d => {
                                const isHighlight = state.selectedDate === d;
                                return `<span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono mr-1 mb-1 font-bold ${isHighlight ? 'bg-blue-600 text-white' : 'bg-slate-100 text-blue-700 border border-slate-300'}">${formatDateDisplay(d)}: <strong>${p.dates_received[d]}</strong></span>`;
                            }).join('');
                        } else {
                            datesHtml = '<span class="text-slate-400 italic">Chưa có ngày</span>';
                        }

                        let shapeNotice = '';
                        if (sa.has_length_issue) {
                            shapeNotice = `
                                <div class="text-[11px] text-orange-800 bg-orange-50 border border-orange-200 rounded px-1.5 py-0.5 mt-1 font-medium inline-flex items-center gap-1">
                                    <span class="font-bold text-orange-600">⚠️</span> Chưa đủ chiều dài
                                </div>
                            `;
                        }

                        const ghiChu = p.ghi_chu || '';
                        let ghiChuHtml = '';
                        if (ghiChu) {
                            ghiChuHtml = `<span class="text-xs text-slate-700 font-medium">${highlightText(ghiChu, state.searchQuery)}</span>`;
                        } else if (p.ktra_noi) {
                            ghiChuHtml = `<span class="text-xs text-slate-700 font-medium">Ktra nối: ${highlightText(p.ktra_noi, state.searchQuery)}</span>`;
                        } else {
                            ghiChuHtml = '<span class="text-slate-300">-</span>';
                        }

                        const isDone = p.is_fully_received;
                        return `
                            <tr class="hover:bg-slate-50/80 transition ${isDone ? 'bg-emerald-50/40' : ''}">
                                <td class="py-2 px-3 font-bold text-slate-900 font-mono">${highlightText(p.display_name, state.searchQuery)}</td>
                                <td class="py-2 px-3">${chungLoaiBadge}</td>
                                <td class="py-2 px-3"><span class="px-2 py-0.5 rounded text-[10px] font-mono font-bold ${getDvgBadgeClass(p.dvg)}">${p.dvg || '-'}</span></td>
                                <td class="py-2 px-3 font-mono text-slate-700">${highlightText(p.size, state.searchQuery)}</td>
                                <td class="py-2 px-3 text-right font-mono font-medium">${p.length || '-'}</td>
                                <td class="py-2 px-3 text-right font-mono font-bold">${p.tqty}</td>
                                <td class="py-2 px-3 text-right font-mono font-bold text-blue-600">${p.da_nhan}</td>
                                <td class="py-2 px-3 text-right font-mono font-bold ${p.con_thieu > 0 ? 'text-red-600' : 'text-slate-400'}">${p.con_thieu}</td>
                                <td class="py-2 px-3">${datesHtml}</td>
                                <td class="py-2 px-3 text-center font-mono font-bold">
                                    ${p.ktra_noi 
                                        ? `<span class="inline-block px-2 py-0.5 rounded bg-blue-100 text-blue-800 border border-blue-200 font-bold">${highlightText(p.ktra_noi, state.searchQuery)}</span>`
                                        : '<span class="text-slate-300">-</span>'
                                    }
                                </td>
                                <td class="py-2 px-3">
                                    ${isDone 
                                        ? '<span class="inline-flex items-center gap-1 text-[11px] text-emerald-700 font-bold bg-emerald-100 px-2 py-0.5 rounded border border-emerald-200">Đã đủ</span>'
                                        : (p.da_nhan > 0 
                                            ? '<span class="inline-flex items-center gap-1 text-[11px] text-amber-700 font-bold bg-amber-100 px-2 py-0.5 rounded border border-amber-200">Đang về</span>'
                                            : '<span class="inline-flex items-center gap-1 text-[11px] text-red-700 font-bold bg-red-100 px-2 py-0.5 rounded border border-red-200">Chưa có</span>'
                                          )
                                    }
                                    ${shapeNotice}
                                </td>
                                <td class="py-2 px-3">
                                    ${ghiChuHtml}
                                </td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
        </div>
    `;
}

// 8. Hiển thị Cây Cấu kiện & BTP con (Tab 1 - Phân trang Batch Rendering siêu nhanh)
function renderAssemblies() {
    const container = document.getElementById('assemblies-container');
    if (!state.projectData || !container) return;

    if (state.scrollObserver) {
        state.scrollObserver.disconnect();
        state.scrollObserver = null;
    }

    const assemblies = state.filteredAssemblies;

    if (assemblies.length === 0) {
        container.innerHTML = `
            <div class="text-center py-12 bg-white border border-slate-200 rounded-2xl text-slate-500 shadow-xs">
                <i data-lucide="inbox" class="w-10 h-10 mx-auto mb-2 text-slate-400"></i>
                <p class="font-medium">Không có cấu kiện nào phù hợp với bộ lọc hiện tại.</p>
            </div>
        `;
        lucide.createIcons();
        return;
    }

    // Chỉ render danh sách visibleCount đầu tiên
    const visibleAssemblies = assemblies.slice(0, state.visibleCount);
    
    let htmlBuffer = visibleAssemblies.map(assy => {
        const isExpanded = state.expandedAssemblies.has(assy.id);
        const displayRate = assy.completion_rate;
        const displayReceivedParts = assy.received_parts_count;
        
        let dayNote = '';
        if (state.selectedDate !== 'all') {
            const qtyOnDay = assy.daily_received[state.selectedDate] || 0;
            dayNote = `<span class="px-2 py-0.5 rounded bg-blue-100 text-blue-800 font-bold text-xs border border-blue-200">Nhận ngày ${formatDateDisplay(state.selectedDate)}: ${qtyOnDay} cái</span>`;
        }

        let statusBadge = '';
        if (assy.status === 'completed') {
            statusBadge = `<span class="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1">${SVG_ICONS.check} Đủ 100%</span>`;
        } else if (assy.status === 'partial') {
            statusBadge = `<span class="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300 flex items-center gap-1">${SVG_ICONS.clock} Đang về</span>`;
        } else {
            statusBadge = `<span class="px-2.5 py-1 rounded-full text-xs font-bold bg-red-100 text-red-800 border border-red-300 flex items-center gap-1">${SVG_ICONS.x} Chưa có BTP</span>`;
        }

        const chevron = isExpanded ? SVG_ICONS.chevronDown : SVG_ICONS.chevronRight;
        const detailsContent = isExpanded ? buildPartsTableHtml(assy) : '';

        return `
            <div class="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs hover:border-slate-300 transition w-full max-w-full" id="card-${assy.id}">
                <!-- Assembly Header Row -->
                <div class="p-3 sm:p-4 flex flex-wrap items-center justify-between gap-3 cursor-pointer select-none assy-header bg-white hover:bg-slate-50/80 transition w-full max-w-full" data-id="${assy.id}">
                    <div class="flex items-center space-x-2 sm:space-x-3 min-w-0 max-w-full">
                        <button class="w-7 h-7 shrink-0 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-700 transition chevron-btn pointer-events-none">
                            <span class="chevron-icon">${chevron}</span>
                        </button>
                        <div class="min-w-0 max-w-full">
                            <div class="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                                <span class="text-sm sm:text-base font-extrabold text-slate-900 tracking-wide break-words">${highlightText(assy.assembly_no, state.searchQuery)}</span>
                                <span class="text-[11px] sm:text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-mono font-bold break-all">${highlightText(assy.dwg, state.searchQuery)}</span>
                                <span class="text-[11px] sm:text-xs text-slate-500 font-mono break-all">${highlightText(assy.size, state.searchQuery)}</span>
                            </div>
                            <p class="text-xs text-slate-500 mt-0.5 font-medium truncate">Sheet: <span class="text-blue-700 font-mono font-semibold">${assy.sheet}</span> • Gồm <strong class="text-slate-900">${assy.total_parts_count}</strong> BTP con</p>
                        </div>
                    </div>

                    <div class="flex items-center flex-wrap gap-2 sm:gap-3 w-full sm:w-auto justify-between sm:justify-end">
                        <div class="flex items-center gap-2 flex-wrap">
                            ${dayNote}
                            ${statusBadge}
                        </div>

                        <div class="w-28 sm:w-36 flex flex-col items-end gap-1 shrink-0">
                            <div class="flex justify-between w-full text-[11px] font-bold">
                                <span class="text-slate-500">${displayReceivedParts}/${assy.total_parts_count} BTP</span>
                                <span class="${displayRate === 100 ? 'text-emerald-600' : 'text-blue-600'}">${displayRate}%</span>
                            </div>
                            <div class="w-full bg-slate-100 rounded-full h-2 overflow-hidden border border-slate-200">
                                <div class="progress-bar-fill h-full rounded-full ${displayRate === 100 ? 'bg-emerald-500' : 'bg-blue-600'}" style="width: ${displayRate}%"></div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Child BTP Table (Lazy-rendered) -->
                <div class="assy-details border-t border-slate-200 bg-slate-50/50 p-2 sm:p-4 max-w-full overflow-hidden ${isExpanded ? '' : 'hidden'}" id="details-${assy.id}" ${isExpanded ? 'data-rendered="true"' : ''}>
                    ${detailsContent}
                </div>
            </div>
        `;
    }).join('');

    // Nếu còn cấu kiện chưa hiển thị, thêm thanh cuộn tự động / nút tải thêm
    if (state.visibleCount < assemblies.length) {
        const remaining = assemblies.length - state.visibleCount;
        htmlBuffer += `
            <div id="infinite-scroll-trigger" class="py-6 text-center">
                <button id="btn-load-more" class="px-6 py-2.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-xs border border-blue-200 shadow-xs transition cursor-pointer">
                    ⚡ Đang hiển thị ${state.visibleCount}/${assemblies.length} cấu kiện • Bấm hoặc cuộn xuống để xem thêm ${Math.min(remaining, 50)} cấu kiện
                </button>
            </div>
        `;
    }

    container.innerHTML = htmlBuffer;

    // Gắn sự kiện Click mở/đóng từng cấu kiện
    container.querySelectorAll('.assy-header').forEach(header => {
        header.addEventListener('click', function(e) {
            const id = this.dataset.id;
            const details = document.getElementById(`details-${id}`);
            const icon = this.querySelector('.chevron-icon');
            if (!details) return;

            const isCurrentlyHidden = details.classList.contains('hidden');
            if (isCurrentlyHidden) {
                state.expandedAssemblies.add(id);
                // Nếu chưa từng render nội dung table thì tạo ngay lúc này
                if (!details.dataset.rendered) {
                    const targetAssy = state.filteredAssemblies.find(a => a.id === id);
                    if (targetAssy) {
                        details.innerHTML = buildPartsTableHtml(targetAssy);
                        details.dataset.rendered = "true";
                    }
                }
                details.classList.remove('hidden');
                if (icon) icon.innerHTML = SVG_ICONS.chevronDown;
            } else {
                state.expandedAssemblies.delete(id);
                details.classList.add('hidden');
                if (icon) icon.innerHTML = SVG_ICONS.chevronRight;
            }
        });
    });

    // Cài đặt Nút Tải thêm & Cuộn vô tận (Infinite Scroll)
    const trigger = document.getElementById('infinite-scroll-trigger');
    if (trigger) {
        const btnMore = document.getElementById('btn-load-more');
        const loadNextBatch = () => {
            state.visibleCount += 50;
            renderAssemblies();
        };

        if (btnMore) btnMore.addEventListener('click', loadNextBatch);

        // Tự động load tiếp khi cuộn tới cuối trang
        if ('IntersectionObserver' in window) {
            state.scrollObserver = new IntersectionObserver((entries) => {
                if (entries[0].isIntersecting) {
                    loadNextBatch();
                }
            }, { rootMargin: '200px' });
            state.scrollObserver.observe(trigger);
        }
    }
}

// 9. Hiển thị Bảng nhận hàng theo ngày (Tab 2 - Sắp xếp theo Ngày/Tháng/Năm)
function renderDailyTimeline() {
    const container = document.getElementById('daily-matrix-container');
    if (!state.projectData || !container) return;

    const daily = state.projectData.daily_delivery || {};
    const sortedDates = Object.keys(daily).sort((a, b) => parseDateSortKey(b) - parseDateSortKey(a));

    if (sortedDates.length === 0) {
        container.innerHTML = `
            <div class="text-center py-12 bg-white border border-slate-200 rounded-2xl text-slate-500 shadow-xs">
                <i data-lucide="calendar-x" class="w-10 h-10 mx-auto mb-2 text-slate-400"></i>
                <p class="font-medium">Chưa có dữ liệu các cột ngày nhận trong sheet BTP của file này.</p>
            </div>
        `;
        lucide.createIcons();
        return;
    }

    container.innerHTML = '';
    sortedDates.forEach(d_str => {
        if (state.selectedDate !== 'all' && state.selectedDate !== d_str) return;

        const dData = daily[d_str];
        const card = document.createElement('div');
        card.className = "bg-white border border-slate-200 rounded-2xl p-5 space-y-3.5 shadow-xs";
        card.innerHTML = `
            <div class="flex items-center justify-between border-b border-slate-200 pb-3">
                <div class="flex items-center gap-2.5">
                    <span class="p-2.5 rounded-xl bg-blue-50 text-blue-600 border border-blue-100">
                        <i data-lucide="calendar" class="w-5 h-5"></i>
                    </span>
                    <div>
                        <h3 class="text-base font-extrabold text-slate-900">${formatDateDisplay(d_str)}</h3>
                        <p class="text-xs text-slate-500 font-medium">Ảnh hưởng đến <strong class="text-slate-800">${dData.assemblies_affected.length}</strong> cấu kiện</p>
                    </div>
                </div>
                <div class="text-right">
                    <span class="text-xl font-extrabold text-blue-600 font-mono">${dData.total_qty}</span>
                    <span class="text-xs text-slate-500 font-medium block">Tổng chi tiết nhận</span>
                </div>
            </div>

            <div class="flex flex-wrap gap-1.5 py-1">
                <span class="text-xs text-slate-500 font-bold mr-1">Cấu kiện nhận chi tiết:</span>
                ${dData.assemblies_affected.map(a => `<span class="px-2 py-0.5 rounded bg-slate-100 text-blue-700 font-mono text-xs font-bold border border-slate-200">${a}</span>`).join('')}
            </div>

            <div class="overflow-x-auto rounded-xl border border-slate-200 shadow-2xs">
                <table class="w-full text-left text-xs border-collapse">
                    <thead>
                        <tr class="bg-slate-100 text-slate-700 border-b border-slate-200 font-bold text-[11px]">
                            <th class="py-2 px-3">Cấu Kiện</th>
                            <th class="py-2 px-3">Bản Vẽ</th>
                            <th class="py-2 px-3">Mã BTP (Chi tiết)</th>
                            <th class="py-2 px-3">Quy Cách (Size)</th>
                            <th class="py-2 px-3">Chủng Loại</th>
                            <th class="py-2 px-3 text-right">SL Nhận Vào Ngày</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-200">
                        ${dData.parts_list.map(p => `
                            <tr class="hover:bg-slate-50">
                                <td class="py-2 px-3 font-bold text-slate-900 font-mono">${p.assembly_no}</td>
                                <td class="py-2 px-3 font-mono text-slate-600">${p.dwg}</td>
                                <td class="py-2 px-3 font-mono text-blue-700 font-bold">${p.part_name}</td>
                                <td class="py-2 px-3 font-mono text-slate-700">${p.size}</td>
                                <td class="py-2 px-3">${p.chung_loai}</td>
                                <td class="py-2 px-3 text-right font-mono font-bold text-blue-600">${p.qty_received}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
        container.appendChild(card);
    });
    lucide.createIcons();
}

// =============================================================================
// MODULE: DASHBOARD PHÂN TÍCH TIẾN ĐỘ & KHỐI LƯỢNG (DVG & ĐƠN VỊ GIAO)
// =============================================================================

const UNIT_PALETTE = [
    { bg: 'bg-blue-100 text-blue-800 border-blue-300', hex: '#2563eb' },
    { bg: 'bg-purple-100 text-purple-800 border-purple-300', hex: '#9333ea' },
    { bg: 'bg-indigo-100 text-indigo-800 border-indigo-300', hex: '#4f46e5' },
    { bg: 'bg-teal-100 text-teal-800 border-teal-300', hex: '#0d9488' },
    { bg: 'bg-emerald-100 text-emerald-800 border-emerald-300', hex: '#059669' },
    { bg: 'bg-amber-100 text-amber-800 border-amber-300', hex: '#d97706' },
    { bg: 'bg-cyan-100 text-cyan-800 border-cyan-300', hex: '#0891b2' },
    { bg: 'bg-rose-100 text-rose-800 border-rose-300', hex: '#e11d48' },
    { bg: 'bg-orange-100 text-orange-800 border-orange-300', hex: '#ea580c' },
    { bg: 'bg-slate-100 text-slate-700 border-slate-300', hex: '#64748b' }
];

function getUnitColor(unitName, index = 0) {
    const u = (unitName || '').toUpperCase().trim();
    if (u === 'MCC') return { bg: 'bg-blue-100 text-blue-800 border-blue-300', hex: '#2563eb' };
    if (u === 'PMC') return { bg: 'bg-purple-100 text-purple-800 border-purple-300', hex: '#9333ea' };
    if (u === 'FAC2') return { bg: 'bg-indigo-100 text-indigo-800 border-indigo-300', hex: '#4f46e5' };
    if (u === 'WTC') return { bg: 'bg-teal-100 text-teal-800 border-teal-300', hex: '#0d9488' };
    if (u === 'KHO') return { bg: 'bg-amber-100 text-amber-800 border-amber-300', hex: '#d97706' };
    if (u === 'S1') return { bg: 'bg-emerald-100 text-emerald-800 border-emerald-300', hex: '#059669' };
    if (u === 'S2') return { bg: 'bg-cyan-100 text-cyan-800 border-cyan-300', hex: '#0891b2' };
    if (u === 'S3') return { bg: 'bg-orange-100 text-orange-800 border-orange-300', hex: '#ea580c' };
    if (u === 'S4') return { bg: 'bg-rose-100 text-rose-800 border-rose-300', hex: '#e11d48' };
    if (u.includes('CHƯA') || u === 'KHÁC' || u === '-' || !u) return { bg: 'bg-slate-100 text-slate-700 border-slate-300', hex: '#94a3b8' };
    return UNIT_PALETTE[Math.abs(index) % UNIT_PALETTE.length];
}

function getDvgBadgeClass(dvg) {
    return getUnitColor(dvg).bg;
}

function formatWeightVal(weightKg) {
    if (weightKg === null || weightKg === undefined || isNaN(weightKg)) return '0 kg';
    const unit = state.dvgUnit || 'kg';
    if (unit === 'ton') {
        const tons = weightKg / 1000;
        return `${tons.toLocaleString('vi-VN', { minimumFractionDigits: 1, maximumFractionDigits: 3 })} Tấn`;
    }
    return `${Math.round(weightKg).toLocaleString('vi-VN')} kg`;
}

function computeDvgAnalyticsData() {
    if (!state.projectData || !state.projectData.assemblies) {
        return {
            byDvg: [],
            totals: {
                total_weight: 0,
                da_nhan_weight: 0,
                con_thieu_weight: 0,
                total_qty: 0,
                da_nhan_qty: 0,
                con_thieu_qty: 0,
                completion_rate_weight: 0,
                missing_rate_weight: 0,
                completion_rate_qty: 0,
                missing_rate_qty: 0
            },
            mode: state.analyticsMode || 'dvg'
        };
    }

    const mode = state.analyticsMode || 'dvg';
    const byDvgMap = {};
    const targetSheet = state.selectedSheet;

    state.projectData.assemblies.forEach(assy => {
        if (targetSheet && targetSheet !== 'all' && assy.sheet !== targetSheet) return;

        const assyGiao = (assy.don_vi_giao || '').trim().toUpperCase();

        (assy.parts || []).forEach(p => {
            const partDvg = (p.dvg || '').trim().toUpperCase();
            const partGiao = (p.don_vi_giao || assyGiao || '').trim().toUpperCase();

            let unitKey = '';
            if (mode === 'giao') {
                unitKey = partGiao;
                if (!unitKey || unitKey === '-' || unitKey === '0' || unitKey === 'NONE') {
                    unitKey = 'CHƯA PHÂN GIAO';
                }
            } else {
                unitKey = partDvg;
                if (!unitKey || unitKey === '-' || unitKey === '0' || unitKey === 'NONE') {
                    unitKey = 'KHÁC';
                }
            }

            if (!byDvgMap[unitKey]) {
                byDvgMap[unitKey] = {
                    dvg: unitKey,
                    total_qty: 0,
                    da_nhan_qty: 0,
                    con_thieu_qty: 0,
                    total_weight: 0,
                    da_nhan_weight: 0,
                    con_thieu_weight: 0,
                    parts_count: 0,
                    missing_parts_count: 0,
                    missing_parts: []
                };
            }

            const item = byDvgMap[unitKey];
            const tqty = Number(p.tqty) || 0;
            const daNhan = Number(p.da_nhan) || 0;
            const conThieu = p.con_thieu !== undefined ? Number(p.con_thieu) : Math.max(0, tqty - daNhan);
            const uweight = Number(p.uweight) || 0;
            const tweight = p.tweight !== undefined && p.tweight !== null ? Number(p.tweight) : (tqty * uweight);
            const daNhanWeight = p.da_nhan_weight !== undefined ? Number(p.da_nhan_weight) : (Math.min(daNhan, tqty) * uweight);
            const conThieuWeight = p.con_thieu_weight !== undefined ? Number(p.con_thieu_weight) : (Math.max(0, conThieu) * uweight);

            item.total_qty += tqty;
            item.da_nhan_qty += daNhan;
            item.con_thieu_qty += conThieu;
            item.total_weight += tweight;
            item.da_nhan_weight += daNhanWeight;
            item.con_thieu_weight += conThieuWeight;
            item.parts_count += 1;

            if (conThieu > 0) {
                item.missing_parts_count += 1;
                const rateMissing = tqty > 0 ? Math.round((conThieu / tqty) * 1000) / 10 : 0;
                item.missing_parts.push({
                    dvg: partDvg || 'KHÁC',
                    don_vi_giao: partGiao || 'CHƯA PHÂN GIAO',
                    sheet: assy.sheet || '',
                    assembly_no: assy.assembly_no || '',
                    dwg: assy.dwg || '',
                    part_no: p.part_no || '',
                    part_cut: p.part_cut || '',
                    display_name: p.display_name || p.part_cut || p.part_no,
                    size: p.size || '',
                    material: p.material || '',
                    tqty: tqty,
                    da_nhan: daNhan,
                    con_thieu: conThieu,
                    rate_missing: rateMissing,
                    uweight: uweight,
                    con_thieu_weight: conThieuWeight,
                    cutting_no: (p.shape_analysis && p.shape_analysis.cutting_no) || p.cutting_no || '',
                    ktra_noi: p.ktra_noi || '',
                    ghi_chu: p.ghi_chu || p.remark || ''
                });
            }
        });
    });

    const byDvgList = Object.values(byDvgMap);
    const grandTotalWeight = byDvgList.reduce((acc, x) => acc + x.total_weight, 0);
    const grandTotalQty = byDvgList.reduce((acc, x) => acc + x.total_qty, 0);
    const grandDaNhanWeight = byDvgList.reduce((acc, x) => acc + x.da_nhan_weight, 0);
    const grandConThieuWeight = byDvgList.reduce((acc, x) => acc + x.con_thieu_weight, 0);
    const grandDaNhanQty = byDvgList.reduce((acc, x) => acc + x.da_nhan_qty, 0);
    const grandConThieuQty = byDvgList.reduce((acc, x) => acc + x.con_thieu_qty, 0);

    byDvgList.forEach(d => {
        d.completion_rate_qty = d.total_qty > 0 ? Math.round((d.da_nhan_qty / d.total_qty) * 1000) / 10 : 0;
        d.missing_rate_qty = d.total_qty > 0 ? Math.round((d.con_thieu_qty / d.total_qty) * 1000) / 10 : 0;
        d.completion_rate_weight = d.total_weight > 0 ? Math.round((d.da_nhan_weight / d.total_weight) * 1000) / 10 : 0;
        d.missing_rate_weight = d.total_weight > 0 ? Math.round((d.con_thieu_weight / d.total_weight) * 1000) / 10 : 0;
        d.share_of_total_weight = grandTotalWeight > 0 ? Math.round((d.total_weight / grandTotalWeight) * 1000) / 10 : 0;
        d.missing_parts.sort((a, b) => b.con_thieu_weight - a.con_thieu_weight);
    });

    // Sắp xếp các đơn vị theo tổng khối lượng giảm dần
    byDvgList.sort((a, b) => b.total_weight - a.total_weight);

    const totals = {
        total_weight: grandTotalWeight,
        da_nhan_weight: grandDaNhanWeight,
        con_thieu_weight: grandConThieuWeight,
        total_qty: grandTotalQty,
        da_nhan_qty: grandDaNhanQty,
        con_thieu_qty: grandConThieuQty,
        completion_rate_weight: grandTotalWeight > 0 ? Math.round((grandDaNhanWeight / grandTotalWeight) * 1000) / 10 : 0,
        missing_rate_weight: grandTotalWeight > 0 ? Math.round((grandConThieuWeight / grandTotalWeight) * 1000) / 10 : 0,
        completion_rate_qty: grandTotalQty > 0 ? Math.round((grandDaNhanQty / grandTotalQty) * 1000) / 10 : 0,
        missing_rate_qty: grandTotalQty > 0 ? Math.round((grandConThieuQty / grandTotalQty) * 1000) / 10 : 0
    };

    return { byDvg: byDvgList, totals: totals, mode: mode };
}

// =============================================================================
// BIỂU ĐỒ ĐỒ HỌA TRỰC QUAN (CHART.JS: CỘT TIẾN ĐỘ & DONUT TỶ TRỌNG KÈM TỶ LỆ %)
// =============================================================================
function renderDvgGraphicCharts(byDvg, totals, mode) {
    if (typeof Chart === 'undefined') {
        setTimeout(() => renderDvgGraphicCharts(byDvg, totals, mode), 250);
        return;
    }

    const canvasBar = document.getElementById('chart-dvg-bar');
    const canvasDoughnut = document.getElementById('chart-dvg-doughnut');
    if (!canvasBar || !canvasDoughnut) return;

    const isMetricWeight = (state.chartMetric || 'weight') === 'weight';
    const isGiao = mode === 'giao';

    // Cập nhật trạng thái nút Metric (Khối Lượng vs Số Lượng)
    const btnMetricWeight = document.getElementById('btn-chart-metric-weight');
    const btnMetricQty = document.getElementById('btn-chart-metric-qty');
    if (btnMetricWeight && btnMetricQty) {
        if (isMetricWeight) {
            btnMetricWeight.className = 'px-2.5 py-1 rounded-md bg-white text-indigo-700 shadow-2xs cursor-pointer transition';
            btnMetricQty.className = 'px-2.5 py-1 rounded-md text-slate-600 hover:text-slate-900 cursor-pointer transition';
        } else {
            btnMetricQty.className = 'px-2.5 py-1 rounded-md bg-white text-indigo-700 shadow-2xs cursor-pointer transition';
            btnMetricWeight.className = 'px-2.5 py-1 rounded-md text-slate-600 hover:text-slate-900 cursor-pointer transition';
        }
    }

    // Tiêu đề biểu đồ
    const barHeading = document.getElementById('chart-bar-heading');
    const doughnutHeading = document.getElementById('chart-doughnut-heading');
    if (barHeading) {
        barHeading.innerHTML = `
            <i data-lucide="bar-chart-2" class="w-4 h-4 text-blue-600"></i>
            <span>Tiến Độ ${isMetricWeight ? 'Khối Lượng' : 'Số Lượng'} Từng ${isGiao ? 'Tổ Giao' : 'Đơn Vị'} (Đã Nhận vs Còn Thiếu & Tỷ Lệ %)</span>
        `;
    }
    if (doughnutHeading) {
        doughnutHeading.innerHTML = `
            <i data-lucide="pie-chart" class="w-4 h-4 text-indigo-600"></i>
            <span>Cơ Cấu Tỷ Trọng ${isMetricWeight ? 'Khối Lượng' : 'Số Lượng'} (%) Toàn Dự Án</span>
        `;
    }

    // Hủy các instance biểu đồ cũ nếu đã có
    if (chartDvgBarInstance) {
        chartDvgBarInstance.destroy();
        chartDvgBarInstance = null;
    }
    if (chartDvgDoughnutInstance) {
        chartDvgDoughnutInstance.destroy();
        chartDvgDoughnutInstance = null;
    }

    if (!byDvg || byDvg.length === 0) return;

    const labels = byDvg.map(d => d.dvg);
    const unitUnit = isMetricWeight ? (state.dvgUnit === 'ton' ? 'Tấn' : 'kg') : 'pcs';

    // Dữ liệu cho Bar Chart
    const recData = byDvg.map(d => {
        if (!isMetricWeight) return d.da_nhan_qty;
        return state.dvgUnit === 'ton' ? Math.round(d.da_nhan_weight / 100) / 10 : Math.round(d.da_nhan_weight);
    });
    const missData = byDvg.map(d => {
        if (!isMetricWeight) return d.con_thieu_qty;
        return state.dvgUnit === 'ton' ? Math.round(d.con_thieu_weight / 100) / 10 : Math.round(d.con_thieu_weight);
    });

    // 1. VẼ BAR CHART (Stacked hoặc Grouped)
    const ctxBar = canvasBar.getContext('2d');
    chartDvgBarInstance = new Chart(ctxBar, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: `Đã Nhận (${unitUnit})`,
                    data: recData,
                    backgroundColor: 'rgba(16, 185, 129, 0.85)',
                    borderColor: '#059669',
                    borderWidth: 1.5,
                    borderRadius: 6
                },
                {
                    label: `Còn Thiếu (${unitUnit})`,
                    data: missData,
                    backgroundColor: 'rgba(244, 63, 94, 0.85)',
                    borderColor: '#e11d48',
                    borderWidth: 1.5,
                    borderRadius: 6
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false
            },
            onClick: (evt, elements) => {
                if (elements && elements.length > 0) {
                    const idx = elements[0].index;
                    const clickedUnit = labels[idx];
                    state.activeDvgFilter = (state.activeDvgFilter === clickedUnit) ? 'all' : clickedUnit;
                    renderDvgAnalytics();
                    if (typeof window.switchDvgSubtab === 'function') window.switchDvgSubtab('table');
                    const section = document.getElementById('dvg-missing-parts-section');
                    if (section) section.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                }
            },
            plugins: {
                legend: {
                    position: 'top',
                    labels: {
                        boxWidth: 14,
                        padding: 12,
                        font: { size: 11, weight: 'bold', family: 'sans-serif' }
                    }
                },
                tooltip: {
                    backgroundColor: 'rgba(15, 23, 42, 0.95)',
                    titleFont: { size: 13, weight: 'bold' },
                    bodyFont: { size: 12 },
                    padding: 10,
                    cornerRadius: 10,
                    callbacks: {
                        label: function(context) {
                            const d = byDvg[context.dataIndex];
                            const isRec = context.datasetIndex === 0;
                            const rate = isMetricWeight 
                                ? (isRec ? d.completion_rate_weight : d.missing_rate_weight)
                                : (isRec ? d.completion_rate_qty : d.missing_rate_qty);
                            const valFormatted = isMetricWeight 
                                ? formatWeightVal(isRec ? d.da_nhan_weight : d.con_thieu_weight)
                                : `${(isRec ? d.da_nhan_qty : d.con_thieu_qty).toLocaleString('vi-VN')} pcs`;
                            return `${context.dataset.label}: ${valFormatted} (${rate}%)`;
                        },
                        afterBody: function(contexts) {
                            if (!contexts || contexts.length === 0) return '';
                            const d = byDvg[contexts[0].dataIndex];
                            return [
                                `---------------------------------`,
                                `Tổng: ${isMetricWeight ? formatWeightVal(d.total_weight) : d.total_qty.toLocaleString('vi-VN') + ' pcs'}`,
                                `Tỷ trọng dự án: ${d.share_of_total_weight}%`,
                                `Số chi tiết thiếu: ${d.missing_parts_count} BTP`
                            ];
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: {
                        font: { size: 11, weight: 'bold' },
                        color: '#334155'
                    }
                },
                y: {
                    beginAtZero: true,
                    grid: { color: 'rgba(226, 232, 240, 0.7)' },
                    ticks: {
                        font: { size: 10 },
                        color: '#64748b'
                    }
                }
            }
        }
    });

    // 2. VẼ DOUGHNUT CHART (Cơ cấu tỷ trọng)
    const ctxDoughnut = canvasDoughnut.getContext('2d');
    const doughnutData = byDvg.map(d => {
        if (!isMetricWeight) return d.total_qty;
        return Math.round(d.total_weight);
    });
    const doughnutColors = byDvg.map((d, idx) => getUnitColor(d.dvg, idx).hex);

    chartDvgDoughnutInstance = new Chart(ctxDoughnut, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: doughnutData,
                backgroundColor: doughnutColors,
                borderWidth: 2,
                borderColor: '#ffffff',
                hoverOffset: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '58%',
            onClick: (evt, elements) => {
                if (elements && elements.length > 0) {
                    const idx = elements[0].index;
                    const clickedUnit = labels[idx];
                    state.activeDvgFilter = (state.activeDvgFilter === clickedUnit) ? 'all' : clickedUnit;
                    renderDvgAnalytics();
                    if (typeof window.switchDvgSubtab === 'function') window.switchDvgSubtab('table');
                    const section = document.getElementById('dvg-missing-parts-section');
                    if (section) section.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                }
            },
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        boxWidth: 12,
                        padding: 8,
                        font: { size: 10, weight: 'bold' }
                    }
                },
                tooltip: {
                    backgroundColor: 'rgba(15, 23, 42, 0.95)',
                    titleFont: { size: 12, weight: 'bold' },
                    bodyFont: { size: 12 },
                    padding: 8,
                    cornerRadius: 8,
                    callbacks: {
                        label: function(context) {
                            const d = byDvg[context.dataIndex];
                            const valFormatted = isMetricWeight ? formatWeightVal(d.total_weight) : `${d.total_qty.toLocaleString('vi-VN')} pcs`;
                            return `${d.dvg}: ${valFormatted} (${d.share_of_total_weight}%)`;
                        }
                    }
                }
            }
        }
    });

    lucide.createIcons();
}

// Render Dashboard DVG & Đơn Vị Giao
function renderDvgAnalytics() {
    if (!state.projectData) return;
    const { byDvg, totals, mode } = computeDvgAnalyticsData();

    // 1. Cập nhật nhãn phạm vi lọc & Chế độ phân tích
    const filterBadge = document.getElementById('dvg-current-filter-badge');
    if (filterBadge) {
        filterBadge.textContent = state.selectedSheet === 'all' ? 'Tất cả hạng mục' : `Hạng mục: ${state.selectedSheet}`;
    }

    // Cập nhật giao diện nút chuyển chế độ (DVG vs Đơn Vị Giao)
    const btnModeDvg = document.getElementById('btn-mode-dvg');
    const btnModeGiao = document.getElementById('btn-mode-giao');
    const modeIndicator = document.getElementById('dvg-mode-indicator-text');
    const headerSubtitle = document.getElementById('dvg-header-subtitle');
    const chartTitle = document.getElementById('dvg-chart-section-title');
    const chartSubtitle = document.getElementById('dvg-chart-section-subtitle');
    const tableTitle = document.getElementById('dvg-table-title');
    const colUnitHeader = document.getElementById('dvg-summary-col-unit');
    const kpiUnitTitle = document.getElementById('kpi-dvg-units-title');
    const distribTitle = document.getElementById('dvg-distrib-title');
    const btnExportSumText = document.getElementById('btn-export-summary-text');

    const isGiao = mode === 'giao';
    if (btnModeDvg && btnModeGiao) {
        if (isGiao) {
            btnModeGiao.className = 'px-3.5 py-2 rounded-lg text-xs font-bold transition flex items-center gap-2 bg-indigo-600 text-white shadow-xs cursor-pointer';
            btnModeDvg.className = 'px-3.5 py-2 rounded-lg text-xs font-bold transition flex items-center gap-2 text-slate-600 hover:text-slate-900 cursor-pointer';
        } else {
            btnModeDvg.className = 'px-3.5 py-2 rounded-lg text-xs font-bold transition flex items-center gap-2 bg-indigo-600 text-white shadow-xs cursor-pointer';
            btnModeGiao.className = 'px-3.5 py-2 rounded-lg text-xs font-bold transition flex items-center gap-2 text-slate-600 hover:text-slate-900 cursor-pointer';
        }
    }

    const dvgModeLabel = document.getElementById('dvg-current-mode-label');
    if (dvgModeLabel) {
        dvgModeLabel.textContent = isGiao ? 'Đơn Vị Giao (Tổ Phân Giao)' : 'Đơn Vị Gia Công (DVG)';
    }
    const dvgBadgeCount = document.getElementById('dvg-badge-subview-count');
    if (dvgBadgeCount) {
        dvgBadgeCount.textContent = `${byDvg.length} Đơn Vị`;
    }

    if (modeIndicator) {
        modeIndicator.textContent = isGiao 
            ? 'Đang phân tích theo: Đơn Vị Giao (Phân Giao Tổ)' 
            : 'Đang phân tích theo: Đơn Vị Gia Công (DVG)';
    }
    if (headerSubtitle) {
        headerSubtitle.textContent = isGiao
            ? 'Phân tích chi tiết tiến độ, khối lượng và số lượng của các tổ giao nhận: S1, S2, S3, S4, KHO...'
            : 'Phân tích chi tiết tiến độ, khối lượng và số lượng của các đơn vị gia công: MCC, PMC, FAC2, WTC, KHO...';
    }
    if (chartTitle) {
        chartTitle.textContent = isGiao 
            ? 'Biểu Đồ Tiến Độ Khối Lượng & Số Lượng Từng Tổ Giao'
            : 'Biểu Đồ Tiến Độ Khối Lượng & Số Lượng Từng Đơn Vị Gia Công (DVG)';
    }
    if (chartSubtitle) {
        chartSubtitle.textContent = isGiao
            ? 'Thống kê so sánh khối lượng và số lượng đã nhận vs còn thiếu của từng tổ giao nhận'
            : 'Thống kê so sánh khối lượng và số lượng đã nhận vs còn thiếu của từng đơn vị gia công';
    }
    if (tableTitle) {
        tableTitle.textContent = isGiao
            ? 'Bảng Tổng Hợp Khối Lượng & Tỷ Lệ Từng Tổ Giao'
            : 'Bảng Tổng Hợp Khối Lượng & Tỷ Lệ Từng Đơn Vị (DVG)';
    }
    if (colUnitHeader) {
        colUnitHeader.textContent = isGiao ? 'Đơn Vị Giao (Tổ)' : 'Đơn Vị Gia Công (DVG)';
    }
    if (kpiUnitTitle) {
        kpiUnitTitle.textContent = isGiao ? 'Đơn Vị Giao (Tổ)' : 'Đơn Vị Gia Công (DVG)';
    }
    if (distribTitle) {
        distribTitle.textContent = isGiao
            ? 'Biểu Đồ Phân Bổ Tỷ Trọng Khối Lượng Theo Tổ Giao (%)'
            : 'Biểu Đồ Phân Bổ Tỷ Trọng Khối Lượng Theo Đơn Vị Gia Công (DVG) (%)';
    }
    if (btnExportSumText) {
        btnExportSumText.textContent = isGiao ? 'Xuất Báo Cáo Tổ Giao (.xlsx)' : 'Xuất Báo Cáo DVG (.xlsx)';
    }

    // 2. Cập nhật trạng thái nút đơn vị (kg / tấn)
    const btnUnitKg = document.getElementById('btn-dvg-unit-kg');
    const btnUnitTon = document.getElementById('btn-dvg-unit-ton');
    if (btnUnitKg && btnUnitTon) {
        if (state.dvgUnit === 'ton') {
            btnUnitTon.classList.add('bg-indigo-600', 'text-white', 'shadow-xs');
            btnUnitTon.classList.remove('text-slate-400');
            btnUnitKg.classList.remove('bg-indigo-600', 'text-white', 'shadow-xs');
            btnUnitKg.classList.add('text-slate-400');
        } else {
            btnUnitKg.classList.add('bg-indigo-600', 'text-white', 'shadow-xs');
            btnUnitKg.classList.remove('text-slate-400');
            btnUnitTon.classList.remove('bg-indigo-600', 'text-white', 'shadow-xs');
            btnUnitTon.classList.add('text-slate-400');
        }
    }

    // 3. Cập nhật 4 thẻ KPI
    const kpiTotalW = document.getElementById('kpi-dvg-total-weight');
    const kpiTotalQ = document.getElementById('kpi-dvg-total-qty');
    const kpiRecW = document.getElementById('kpi-dvg-received-weight');
    const kpiRecQ = document.getElementById('kpi-dvg-received-qty');
    const kpiWRate = document.getElementById('kpi-dvg-weight-rate');
    const kpiMissW = document.getElementById('kpi-dvg-missing-weight');
    const kpiMissQ = document.getElementById('kpi-dvg-missing-qty');
    const kpiMissRate = document.getElementById('kpi-dvg-missing-rate');
    const kpiUnitsCount = document.getElementById('kpi-dvg-units-count');
    const kpiUnitsDesc = document.getElementById('kpi-dvg-units-desc');

    if (kpiTotalW) kpiTotalW.textContent = formatWeightVal(totals.total_weight);
    if (kpiTotalQ) kpiTotalQ.textContent = `Tổng ${totals.total_qty.toLocaleString('vi-VN')} chi tiết (pcs)`;

    if (kpiRecW) kpiRecW.textContent = formatWeightVal(totals.da_nhan_weight);
    if (kpiRecQ) kpiRecQ.textContent = `Đã nhận ${totals.da_nhan_qty.toLocaleString('vi-VN')} pcs`;
    if (kpiWRate) kpiWRate.textContent = `${totals.completion_rate_weight}% hoàn thành`;

    if (kpiMissW) kpiMissW.textContent = formatWeightVal(totals.con_thieu_weight);
    if (kpiMissQ) kpiMissQ.textContent = `Còn thiếu ${totals.con_thieu_qty.toLocaleString('vi-VN')} pcs`;
    if (kpiMissRate) kpiMissRate.textContent = `${totals.missing_rate_weight}% còn thiếu`;

    if (kpiUnitsCount) kpiUnitsCount.textContent = byDvg.length;
    if (kpiUnitsDesc) {
        const topUnits = byDvg.slice(0, 4).map(d => d.dvg).join(', ');
        kpiUnitsDesc.textContent = topUnits ? `${topUnits}...` : (isGiao ? 'Chưa phân giao' : 'Chưa có DVG');
    }

    // 4. CẬP NHẬT BIỂU ĐỒ 1: BIỂU ĐỒ PHÂN BỔ TỶ TRỌNG TOÀN DỰ ÁN (%)
    const distribBar = document.getElementById('dvg-distribution-bar');
    const distribLegend = document.getElementById('dvg-distribution-legend');
    const distribTotalLbl = document.getElementById('dvg-distrib-total-lbl');

    if (distribTotalLbl) {
        distribTotalLbl.textContent = `Tổng: ${formatWeightVal(totals.total_weight)} (100%)`;
    }

    if (distribBar && distribLegend) {
        if (byDvg.length === 0 || totals.total_weight <= 0) {
            distribBar.innerHTML = `<div class="w-full h-full bg-slate-200 text-slate-500 text-xs flex items-center justify-center font-medium">Không có khối lượng</div>`;
            distribLegend.innerHTML = ``;
        } else {
            distribBar.innerHTML = byDvg.map((d, idx) => {
                const color = getUnitColor(d.dvg, idx);
                const pct = d.share_of_total_weight;
                const isSelected = state.activeDvgFilter === d.dvg;
                const opacityClass = (state.activeDvgFilter !== 'all' && !isSelected) ? 'opacity-30' : 'opacity-100';
                const showLabel = pct >= 4.5;
                return `
                    <div class="h-full transition-all duration-300 relative group cursor-pointer ${opacityClass} rounded-lg flex items-center justify-center overflow-hidden hover:brightness-110 select-none" 
                         style="width: ${Math.max(1.5, pct)}%; background-color: ${color.hex};" 
                         data-dvg="${d.dvg}"
                         title="${d.dvg}: ${formatWeightVal(d.total_weight)} (chiếm ${pct}% toàn dự án) - Bấm để lọc">
                        ${showLabel ? `<span class="text-[10px] font-extrabold text-white px-1 truncate drop-shadow-xs">${d.dvg} ${pct}%</span>` : ''}
                    </div>
                `;
            }).join('');

            distribLegend.innerHTML = byDvg.map((d, idx) => {
                const color = getUnitColor(d.dvg, idx);
                const isSelected = state.activeDvgFilter === d.dvg;
                const activeRing = isSelected ? 'ring-2 ring-indigo-500 scale-105 shadow-sm bg-indigo-50/50' : 'hover:bg-slate-50';
                return `
                    <button type="button" class="btn-legend-pill flex items-center gap-1.5 px-2.5 py-1 rounded-xl border border-slate-200 bg-white transition cursor-pointer text-xs font-semibold ${activeRing}" data-dvg="${d.dvg}">
                        <span class="w-2.5 h-2.5 rounded-full flex-shrink-0" style="background-color: ${color.hex};"></span>
                        <span class="font-bold text-slate-800">${d.dvg}</span>
                        <span class="font-mono text-indigo-700 font-extrabold">${d.share_of_total_weight}%</span>
                        <span class="text-[11px] text-slate-400 font-medium">(${formatWeightVal(d.total_weight)})</span>
                    </button>
                `;
            }).join('');

            const filterElements = [...distribBar.querySelectorAll('[data-dvg]'), ...distribLegend.querySelectorAll('.btn-legend-pill')];
            filterElements.forEach(el => {
                el.addEventListener('click', function() {
                    const unitName = this.dataset.dvg;
                    state.activeDvgFilter = (state.activeDvgFilter === unitName) ? 'all' : unitName;
                    renderDvgAnalytics();
                    if (typeof window.switchDvgSubtab === 'function') window.switchDvgSubtab('table');
                    const section = document.getElementById('dvg-missing-parts-section');
                    if (section) section.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                });
            });
        }
    }

    // 5. CẬP NHẬT THƯỚC ĐO TIẾN ĐỘ TỔNG THỂ TOÀN DỰ ÁN (Dual Progress Gauges)
    const gWeightText = document.getElementById('overall-gauge-weight-text');
    const gWeightRecBar = document.getElementById('overall-gauge-weight-rec-bar');
    const gWeightMissBar = document.getElementById('overall-gauge-weight-miss-bar');
    const gWeightRecDetail = document.getElementById('overall-gauge-weight-rec-detail');
    const gWeightMissDetail = document.getElementById('overall-gauge-weight-miss-detail');

    const gQtyText = document.getElementById('overall-gauge-qty-text');
    const gQtyRecBar = document.getElementById('overall-gauge-qty-rec-bar');
    const gQtyMissBar = document.getElementById('overall-gauge-qty-miss-bar');
    const gQtyRecDetail = document.getElementById('overall-gauge-qty-rec-detail');
    const gQtyMissDetail = document.getElementById('overall-gauge-qty-miss-detail');

    if (gWeightText) gWeightText.textContent = `${totals.completion_rate_weight}% Đã nhận | ${totals.missing_rate_weight}% Còn thiếu`;
    if (gWeightRecBar) {
        gWeightRecBar.style.width = `${totals.completion_rate_weight}%`;
        gWeightRecBar.textContent = totals.completion_rate_weight >= 12 ? `${totals.completion_rate_weight}%` : '';
    }
    if (gWeightMissBar) {
        gWeightMissBar.style.width = `${totals.missing_rate_weight}%`;
        gWeightMissBar.textContent = totals.missing_rate_weight >= 12 ? `${totals.missing_rate_weight}%` : '';
    }
    if (gWeightRecDetail) gWeightRecDetail.textContent = `Đã nhận: ${formatWeightVal(totals.da_nhan_weight)} (${totals.completion_rate_weight}%)`;
    if (gWeightMissDetail) gWeightMissDetail.textContent = `Còn thiếu: ${formatWeightVal(totals.con_thieu_weight)} (${totals.missing_rate_weight}%)`;

    if (gQtyText) gQtyText.textContent = `${totals.completion_rate_qty}% Đã nhận | ${totals.missing_rate_qty}% Còn thiếu`;
    if (gQtyRecBar) {
        gQtyRecBar.style.width = `${totals.completion_rate_qty}%`;
        gQtyRecBar.textContent = totals.completion_rate_qty >= 12 ? `${totals.completion_rate_qty}%` : '';
    }
    if (gQtyMissBar) {
        gQtyMissBar.style.width = `${totals.missing_rate_qty}%`;
        gQtyMissBar.textContent = totals.missing_rate_qty >= 12 ? `${totals.missing_rate_qty}%` : '';
    }
    if (gQtyRecDetail) gQtyRecDetail.textContent = `Đã nhận: ${totals.da_nhan_qty.toLocaleString('vi-VN')} pcs (${totals.completion_rate_qty}%)`;
    if (gQtyMissDetail) gQtyMissDetail.textContent = `Còn thiếu: ${totals.con_thieu_qty.toLocaleString('vi-VN')} pcs (${totals.missing_rate_qty}%)`;

    // 6. Cập nhật Thống kê phân tích vật tư thiếu trực quan (Strip)
    const stripSum = document.getElementById('dvg-strip-missing-summary');
    const stripTop = document.getElementById('dvg-strip-top-missing');
    if (stripSum) {
        stripSum.textContent = `${formatWeightVal(totals.con_thieu_weight)} (${totals.con_thieu_qty.toLocaleString('vi-VN')} chi tiết)`;
    }
    if (stripTop) {
        const missingUnits = [...byDvg].filter(d => d.con_thieu_weight > 0 || d.con_thieu_qty > 0)
                                       .sort((a, b) => b.con_thieu_weight - a.con_thieu_weight);
        if (missingUnits.length > 0) {
            const topM = missingUnits[0];
            const percentTop = totals.con_thieu_weight > 0 ? Math.round((topM.con_thieu_weight / totals.con_thieu_weight) * 1000) / 10 : 0;
            stripTop.textContent = `⚡ Đơn vị thiếu khối lượng nhiều nhất: ${topM.dvg} (thiếu ${formatWeightVal(topM.con_thieu_weight)}, chiếm ${percentTop}% tổng KL thiếu toàn dự án - ${topM.con_thieu_qty.toLocaleString('vi-VN')} pcs)`;
        } else {
            stripTop.textContent = `🎉 Toàn bộ các đơn vị đã bàn giao đủ 100% khối lượng và số lượng chi tiết!`;
        }
    }

    // 7. CẬP NHẬT BIỂU ĐỒ ĐỒ HỌA TRỰC QUAN (CHART.JS: CỘT TIẾN ĐỘ & DONUT TỶ TRỌNG CÓ ĐẦY ĐỦ TỶ LỆ %)
    renderDvgGraphicCharts(byDvg, totals, mode);

    // 8. Render Biểu đồ thẻ tiến độ & tỷ lệ từng đơn vị (Progress Cards)
    const progressContainer = document.getElementById('dvg-progress-bars-container');
    if (progressContainer) {
        if (byDvg.length === 0) {
            progressContainer.innerHTML = `<p class="text-xs text-slate-400 p-8 text-center col-span-2">Không có dữ liệu trong phạm vi lọc này.</p>`;
        } else {
            progressContainer.innerHTML = byDvg.map((d, idx) => {
                const color = getUnitColor(d.dvg, idx);
                const wRate = d.completion_rate_weight;
                const wMissRate = d.missing_rate_weight;
                const qRate = d.completion_rate_qty;
                const qMissRate = d.missing_rate_qty;
                const isSelected = state.activeDvgFilter === d.dvg;
                const borderClass = isSelected ? 'border-indigo-500 ring-2 ring-indigo-300 bg-indigo-50/40 shadow-xs' : 'border-slate-200 bg-white hover:border-slate-300';
                const rateColor = wRate >= 90 ? 'text-emerald-700 bg-emerald-50 border-emerald-200' : (wRate >= 50 ? 'text-amber-700 bg-amber-50 border-amber-200' : 'text-rose-700 bg-rose-50 border-rose-200');

                return `
                    <div class="dvg-progress-card p-4 rounded-2xl border ${borderClass} transition cursor-pointer hover:shadow-xs flex flex-col justify-between" data-dvg="${d.dvg}">
                        <div>
                            <!-- Header thẻ đơn vị -->
                            <div class="flex items-center justify-between gap-2 mb-3">
                                <div class="flex items-center gap-2 flex-wrap">
                                    <span class="px-2.5 py-1 rounded-lg text-xs font-extrabold font-mono border ${color.bg}">${d.dvg}</span>
                                    <span class="text-[11px] font-bold px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200">
                                        Chiếm ${d.share_of_total_weight}% KL dự án
                                    </span>
                                </div>
                                <span class="text-xs font-extrabold px-2.5 py-1 rounded-lg border font-mono ${rateColor}">
                                    ${wRate}% KL hoàn thành
                                </span>
                            </div>

                            <!-- 1. Thanh tỷ lệ KHỐI LƯỢNG (Trực quan 2 màu Đã Nhận & Còn Thiếu) -->
                            <div class="space-y-1.5 mt-2 bg-slate-50/80 p-2.5 rounded-xl border border-slate-200/80">
                                <div class="flex justify-between items-center text-xs font-bold">
                                    <span class="text-slate-700 flex items-center gap-1.5">
                                        <span class="w-2 h-2 rounded-full bg-emerald-500"></span>
                                        <span>Đã nhận: <strong class="text-emerald-700 font-mono">${formatWeightVal(d.da_nhan_weight)}</strong></span>
                                        <span class="text-[11px] text-emerald-600 font-mono font-extrabold">(${wRate}%)</span>
                                    </span>
                                    <span class="${d.con_thieu_weight > 0 ? 'text-rose-700 font-bold' : 'text-slate-400'} flex items-center gap-1.5">
                                        <span class="w-2 h-2 rounded-full ${d.con_thieu_weight > 0 ? 'bg-rose-500' : 'bg-slate-300'}"></span>
                                        <span>Thiếu: <strong class="font-mono">${formatWeightVal(d.con_thieu_weight)}</strong></span>
                                        <span class="text-[11px] text-rose-600 font-mono font-extrabold">(${wMissRate}%)</span>
                                    </span>
                                </div>
                                <!-- Dual Stacked Bar for Weight -->
                                <div class="w-full bg-slate-200 rounded-full h-3 overflow-hidden flex shadow-inner">
                                    <div class="bg-emerald-500 h-full transition-all duration-500 flex items-center justify-center text-[9px] font-extrabold text-white" style="width: ${Math.min(100, wRate)}%">
                                        ${wRate >= 15 ? `${wRate}%` : ''}
                                    </div>
                                    <div class="bg-rose-500 h-full transition-all duration-500 flex items-center justify-center text-[9px] font-extrabold text-white" style="width: ${Math.max(0, 100 - wRate)}%">
                                        ${wMissRate >= 15 ? `${wMissRate}%` : ''}
                                    </div>
                                </div>
                                <div class="text-[11px] text-slate-500 font-medium text-right">
                                    Tổng KL đơn vị: <strong class="text-slate-800 font-mono font-bold">${formatWeightVal(d.total_weight)}</strong>
                                </div>
                            </div>

                            <!-- 2. Thanh tỷ lệ SỐ LƯỢNG CHI TIẾT (Trực quan 2 màu Đã Nhận & Còn Thiếu) -->
                            <div class="space-y-1.5 mt-2 bg-slate-50/80 p-2.5 rounded-xl border border-slate-200/80">
                                <div class="flex justify-between items-center text-xs font-medium text-slate-600">
                                    <span class="flex items-center gap-1.5">
                                        <span class="w-2 h-2 rounded-full bg-blue-500"></span>
                                        <span>Đã nhận: <strong class="text-slate-900 font-mono font-bold">${d.da_nhan_qty.toLocaleString('vi-VN')}</strong> pcs</span>
                                        <span class="text-[11px] text-blue-700 font-mono font-extrabold">(${qRate}%)</span>
                                    </span>
                                    <span class="${d.con_thieu_qty > 0 ? 'text-rose-600 font-bold' : 'text-slate-400'} flex items-center gap-1.5">
                                        <span class="w-2 h-2 rounded-full ${d.con_thieu_qty > 0 ? 'bg-amber-500' : 'bg-slate-300'}"></span>
                                        <span>Thiếu: <strong class="font-mono">${d.con_thieu_qty.toLocaleString('vi-VN')}</strong> pcs</span>
                                        <span class="text-[11px] text-amber-700 font-mono font-extrabold">(${qMissRate}%)</span>
                                    </span>
                                </div>
                                <!-- Dual Stacked Bar for Quantity -->
                                <div class="w-full bg-slate-200 rounded-full h-2 overflow-hidden flex shadow-inner">
                                    <div class="bg-blue-600 h-full transition-all duration-500" style="width: ${Math.min(100, qRate)}%"></div>
                                    <div class="bg-amber-500 h-full transition-all duration-500" style="width: ${Math.max(0, 100 - qRate)}%"></div>
                                </div>
                                <div class="flex justify-between items-center text-[11px] text-slate-500 font-medium">
                                    <span>Số mã chi tiết: <strong class="text-slate-800 font-bold">${d.parts_count} mã</strong></span>
                                    <span>Tổng SL: <strong class="text-slate-800 font-mono font-bold">${d.total_qty.toLocaleString('vi-VN')} pcs</strong></span>
                                </div>
                            </div>
                        </div>

                        <!-- Thanh thao tác trên từng thẻ biểu đồ -->
                        <div class="mt-3 pt-2.5 border-t border-slate-200/80 flex items-center justify-between gap-2">
                            <span class="text-[11px] font-bold ${isSelected ? 'text-indigo-700' : 'text-slate-500'}">
                                ${isSelected ? '● Đang lọc chi tiết bên dưới' : '🔍 Bấm để lọc chi tiết'}
                            </span>
                            <button type="button" class="btn-card-export-missing flex items-center gap-1 px-2.5 py-1 bg-rose-50 hover:bg-rose-100 active:bg-rose-200 text-rose-700 border border-rose-200 rounded-lg text-[11px] font-bold transition shadow-2xs cursor-pointer active:scale-95" data-dvg="${d.dvg}" title="Xuất báo cáo phân tích vật tư thiếu của đơn vị ${d.dvg}">
                                <i data-lucide="download" class="w-3 h-3"></i>
                                <span>Báo Cáo Thiếu ${d.dvg}</span>
                            </button>
                        </div>
                    </div>
                `;
            }).join('');

            progressContainer.querySelectorAll('.dvg-progress-card').forEach(card => {
                card.addEventListener('click', function(e) {
                    if (e.target.closest('.btn-card-export-missing')) return;
                    const dvgName = this.dataset.dvg;
                    state.activeDvgFilter = (state.activeDvgFilter === dvgName) ? 'all' : dvgName;
                    renderDvgAnalytics();
                    if (typeof window.switchDvgSubtab === 'function') window.switchDvgSubtab('table');
                    const section = document.getElementById('dvg-missing-parts-section');
                    if (section) section.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                });
            });

            progressContainer.querySelectorAll('.btn-card-export-missing').forEach(btn => {
                btn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    const dvgName = this.dataset.dvg;
                    exportDvgMissingPartsExcel(dvgName);
                });
            });
        }
    }

    // 8. Render Bảng Tổng Hợp Khối Lượng & Tỷ Lệ Từng Đơn Vị (Table)
    const tbody = document.getElementById('dvg-summary-tbody');
    const tfoot = document.getElementById('dvg-summary-tfoot');
    if (tbody) {
        tbody.innerHTML = byDvg.map((d, idx) => {
            const color = getUnitColor(d.dvg, idx);
            const isSelected = state.activeDvgFilter === d.dvg;
            const rowClass = isSelected ? 'bg-indigo-50/70 font-semibold' : 'hover:bg-slate-50';
            const rateColor = d.completion_rate_weight >= 90 ? 'text-emerald-700 bg-emerald-50 border-emerald-200' : (d.completion_rate_weight >= 50 ? 'text-amber-700 bg-amber-50 border-amber-200' : 'text-rose-700 bg-rose-50 border-rose-200');
            const barFillColor = d.completion_rate_weight >= 90 ? 'bg-emerald-500' : (d.completion_rate_weight >= 50 ? 'bg-amber-500' : 'bg-rose-500');

            return `
                <tr class="${rowClass} transition">
                    <td class="py-2.5 px-3.5">
                        <span class="px-2.5 py-0.5 rounded text-xs font-mono font-bold border ${color.bg}">${d.dvg}</span>
                        ${isSelected ? '<span class="ml-1 text-[10px] text-indigo-600 font-bold">● Đang lọc</span>' : ''}
                    </td>
                    <td class="py-2.5 px-3 text-right font-mono font-bold text-slate-900">${formatWeightVal(d.total_weight)}</td>
                    <td class="py-2.5 px-3 text-center font-mono font-extrabold text-indigo-700 bg-indigo-50/40">${d.share_of_total_weight}%</td>
                    <td class="py-2.5 px-3 text-right font-mono font-bold text-emerald-600">${formatWeightVal(d.da_nhan_weight)}</td>
                    <td class="py-2.5 px-3 text-right font-mono font-bold text-rose-600">${formatWeightVal(d.con_thieu_weight)}</td>
                    <td class="py-2.5 px-3 text-center">
                        <div class="flex items-center gap-1.5 justify-center">
                            <div class="w-16 bg-slate-200 rounded-full h-2 overflow-hidden flex">
                                <div class="${barFillColor} h-full rounded-full" style="width: ${Math.min(100, d.completion_rate_weight)}%"></div>
                            </div>
                            <span class="text-[11px] font-mono font-bold px-1.5 py-0.2 rounded border ${rateColor}">${d.completion_rate_weight}%</span>
                        </div>
                    </td>
                    <td class="py-2.5 px-3 text-right font-mono text-slate-700">${d.total_qty.toLocaleString('vi-VN')}</td>
                    <td class="py-2.5 px-3 text-right font-mono text-emerald-600 font-bold">${d.da_nhan_qty.toLocaleString('vi-VN')}</td>
                    <td class="py-2.5 px-3 text-right font-mono text-rose-600 font-bold">${d.con_thieu_qty.toLocaleString('vi-VN')}</td>
                    <td class="py-2.5 px-3 text-center font-mono font-bold text-blue-700">${d.completion_rate_qty}%</td>
                    <td class="py-2.5 px-3 text-center">
                        <div class="flex items-center justify-center gap-1">
                            <button type="button" class="btn-filter-dvg-table px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-[11px] border border-indigo-200 transition cursor-pointer" data-dvg="${d.dvg}" title="Xem chi tiết các vật tư thiếu của ${d.dvg}">
                                👁️ Chi Tiết
                            </button>
                            <button type="button" class="btn-export-single-dvg px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold text-[11px] border border-emerald-200 transition cursor-pointer" data-dvg="${d.dvg}" title="Xuất file Excel vật tư thiếu của ${d.dvg}">
                                📥 Excel
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');

        tbody.querySelectorAll('.btn-filter-dvg-table').forEach(btn => {
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                const dvg = this.dataset.dvg;
                state.activeDvgFilter = (state.activeDvgFilter === dvg) ? 'all' : dvg;
                renderDvgAnalytics();
                const section = document.getElementById('dvg-missing-parts-section');
                if (section) section.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            });
        });

        tbody.querySelectorAll('.btn-export-single-dvg').forEach(btn => {
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                const dvg = this.dataset.dvg;
                exportDvgMissingPartsExcel(dvg);
            });
        });
    }

    if (tfoot) {
        tfoot.innerHTML = `
            <tr class="bg-slate-100/90 text-slate-900 border-t-2 border-slate-300">
                <td class="py-3 px-3.5 font-bold uppercase">TỔNG CỘNG (${byDvg.length} ${isGiao ? 'TỔ' : 'ĐƠN VỊ'})</td>
                <td class="py-3 px-3 text-right font-mono font-extrabold">${formatWeightVal(totals.total_weight)}</td>
                <td class="py-3 px-3 text-center font-mono font-extrabold text-indigo-700">100%</td>
                <td class="py-3 px-3 text-right font-mono font-extrabold text-emerald-700">${formatWeightVal(totals.da_nhan_weight)}</td>
                <td class="py-3 px-3 text-right font-mono font-extrabold text-rose-700">${formatWeightVal(totals.con_thieu_weight)}</td>
                <td class="py-3 px-3 text-center font-mono font-extrabold text-indigo-700">${totals.completion_rate_weight}% KL</td>
                <td class="py-3 px-3 text-right font-mono font-bold">${totals.total_qty.toLocaleString('vi-VN')}</td>
                <td class="py-3 px-3 text-right font-mono font-bold text-emerald-700">${totals.da_nhan_qty.toLocaleString('vi-VN')}</td>
                <td class="py-3 px-3 text-right font-mono font-bold text-rose-700">${totals.con_thieu_qty.toLocaleString('vi-VN')}</td>
                <td class="py-3 px-3 text-center font-mono font-bold text-blue-700">${totals.completion_rate_qty}% SL</td>
                <td class="py-3 px-3 text-center">
                    <button type="button" id="btn-tfoot-export-all" class="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[11px] transition shadow-2xs cursor-pointer" title="Xuất báo cáo tổng hợp">
                        📥 Xuất Tổng
                    </button>
                </td>
            </tr>
        `;
        const btnFootExport = document.getElementById('btn-tfoot-export-all');
        if (btnFootExport) {
            btnFootExport.addEventListener('click', exportDvgSummaryExcel);
        }
    }

    // 9. Render Danh Sách Chi Tiết Vật Tư Còn Thiếu
    renderDvgMissingPartsTable(byDvg);
    if (window.lucide) lucide.createIcons();
}

function renderDvgMissingPartsTable(byDvg) {
    const badge = document.getElementById('dvg-active-filter-badge');
    const tbody = document.getElementById('dvg-missing-tbody');
    if (!tbody) return;

    const mode = state.analyticsMode || 'dvg';
    const isGiao = mode === 'giao';

    if (badge) {
        badge.textContent = state.activeDvgFilter === 'all' 
            ? 'Tất Cả Đơn Vị' 
            : `${isGiao ? 'Tổ' : 'Đơn Vị'}: ${state.activeDvgFilter}`;
    }

    let allMissing = [];
    byDvg.forEach(d => {
        if (state.activeDvgFilter !== 'all' && d.dvg !== state.activeDvgFilter) return;
        allMissing.push(...d.missing_parts);
    });

    // Lọc theo từ khóa tìm kiếm trong bảng chi tiết nếu có
    const q = (state.dvgSearchQuery || '').trim().toLowerCase();
    if (q) {
        allMissing = allMissing.filter(p => {
            return (p.display_name || '').toLowerCase().includes(q) ||
                   (p.assembly_no || '').toLowerCase().includes(q) ||
                   (p.dwg || '').toLowerCase().includes(q) ||
                   (p.size || '').toLowerCase().includes(q) ||
                   (p.dvg || '').toLowerCase().includes(q) ||
                   (p.don_vi_giao || '').toLowerCase().includes(q) ||
                   (p.cutting_no || '').toLowerCase().includes(q);
        });
    }

    if (allMissing.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="14" class="py-8 text-center text-slate-400 italic">
                    ${q ? 'Không tìm thấy chi tiết vật tư nào khớp với từ khóa tìm kiếm.' : 'Không có chi tiết vật tư nào còn thiếu cho lựa chọn này!'}
                </td>
            </tr>
        `;
        return;
    }

    // Giới hạn hiển thị 100 chi tiết đầu tiên có khối lượng thiếu lớn nhất để màn hình siêu mượt
    const displayList = allMissing.slice(0, 100);

    tbody.innerHTML = displayList.map(p => {
        return `
            <tr class="hover:bg-slate-50">
                <td class="py-2.5 px-3">
                    <span class="px-2 py-0.5 rounded text-[10px] font-mono font-bold ${getDvgBadgeClass(p.dvg)}">${p.dvg || 'KHÁC'}</span>
                </td>
                <td class="py-2.5 px-3">
                    <span class="px-2 py-0.5 rounded text-[10px] font-mono font-bold ${getDvgBadgeClass(p.don_vi_giao)}">${p.don_vi_giao || '-'}</span>
                </td>
                <td class="py-2.5 px-3 font-mono font-bold text-slate-900">${p.assembly_no}</td>
                <td class="py-2.5 px-3 font-mono text-slate-600">${p.dwg}</td>
                <td class="py-2.5 px-3 font-mono font-bold text-blue-700">${p.display_name}</td>
                <td class="py-2.5 px-3 font-mono text-slate-700">${p.size}</td>
                <td class="py-2.5 px-3 text-right font-mono">${p.tqty}</td>
                <td class="py-2.5 px-3 text-right font-mono text-emerald-600 font-bold">${p.da_nhan}</td>
                <td class="py-2.5 px-3 text-right font-mono text-rose-600 font-extrabold bg-rose-50/50">${p.con_thieu}</td>
                <td class="py-2.5 px-3 text-center font-mono font-bold text-rose-600">${p.rate_missing}%</td>
                <td class="py-2.5 px-3 text-right font-mono text-slate-600">${p.uweight ? p.uweight.toFixed(1) : '-'} kg</td>
                <td class="py-2.5 px-3 text-right font-mono text-rose-700 font-extrabold">${formatWeightVal(p.con_thieu_weight)}</td>
                <td class="py-2.5 px-3 font-mono text-slate-700">${p.cutting_no || '-'}</td>
                <td class="py-2.5 px-3">${p.ktra_noi ? `<span class="px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 font-mono text-[10px] font-bold">${p.ktra_noi}</span>` : '-'}</td>
            </tr>
        `;
    }).join('');

    if (allMissing.length > 100) {
        tbody.innerHTML += `
            <tr>
                <td colspan="14" class="py-3 text-center bg-slate-50 text-slate-500 font-medium text-xs">
                    ⚡ Đang hiển thị 100 chi tiết có khối lượng thiếu lớn nhất trong tổng số ${allMissing.length} chi tiết thiếu. Bấm "Xuất Excel Danh Sách Này" để tải trọn bộ đầy đủ.
                </td>
            </tr>
        `;
    }
}

// Xuất file Excel Báo Cáo Tổng Hợp DVG / Tổ Giao
function exportDvgSummaryExcel() {
    if (!state.projectData) {
        alert("Chưa có dữ liệu dự án!");
        return;
    }
    const { byDvg, totals, mode } = computeDvgAnalyticsData();
    const projCode = state.currentProject || 'DuAn';
    const targetSheet = state.selectedSheet !== 'all' ? state.selectedSheet : 'TatCaHangMuc';
    const isGiao = mode === 'giao';

    const headers = [
        isGiao ? "Đơn Vị Giao (Tổ)" : "Đơn Vị Gia Công (DVG)",
        "Tổng Khối Lượng (kg)",
        "Tỷ Trọng Dự Án (%)",
        "Khối Lượng Đã Nhận (kg)",
        "Khối Lượng Còn Thiếu (kg)",
        "Tiến Độ Khối Lượng (%)",
        "Tỷ Lệ Còn Thiếu KL (%)",
        "Tổng Số Lượng (pcs)",
        "Số Lượng Đã Nhận (pcs)",
        "Số Lượng Còn Thiếu (pcs)",
        "Tiến Độ Số Lượng (%)",
        "Số Chủng Loại Chi Tiết",
        "Số Chi Tiết Đang Thiếu"
    ];

    const rows = byDvg.map(d => [
        d.dvg,
        Math.round(d.total_weight * 10) / 10,
        d.share_of_total_weight,
        Math.round(d.da_nhan_weight * 10) / 10,
        Math.round(d.con_thieu_weight * 10) / 10,
        d.completion_rate_weight,
        d.missing_rate_weight,
        d.total_qty,
        d.da_nhan_qty,
        d.con_thieu_qty,
        d.completion_rate_qty,
        d.parts_count,
        d.missing_parts_count
    ]);

    rows.push([
        "TỔNG CỘNG TOÀN BỘ",
        Math.round(totals.total_weight * 10) / 10,
        100,
        Math.round(totals.da_nhan_weight * 10) / 10,
        Math.round(totals.con_thieu_weight * 10) / 10,
        totals.completion_rate_weight,
        totals.missing_rate_weight,
        totals.total_qty,
        totals.da_nhan_qty,
        totals.con_thieu_qty,
        totals.completion_rate_qty,
        "-",
        "-"
    ]);

    if (window.XLSX) {
        const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
        
        const borderThin = {
            top: { style: 'thin', color: { rgb: 'CBD5E1' } },
            bottom: { style: 'thin', color: { rgb: 'CBD5E1' } },
            left: { style: 'thin', color: { rgb: 'CBD5E1' } },
            right: { style: 'thin', color: { rgb: 'CBD5E1' } }
        };

        // Format hàng tiêu đề (Navy/Indigo)
        for (let c = 0; c < headers.length; c++) {
            const addr = XLSX.utils.encode_cell({ r: 0, c });
            if (ws[addr]) {
                ws[addr].s = {
                    fill: { fgColor: { rgb: '312E81' } },
                    font: { name: 'Arial', sz: 10, bold: true, color: { rgb: 'FFFFFF' } },
                    alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
                    border: borderThin
                };
            }
        }

        // Format các hàng dữ liệu (Kẻ viền, định dạng số, xen kẽ màu)
        for (let r = 1; r <= rows.length; r++) {
            const isTotalRow = (r === rows.length);
            const isEven = (r % 2 === 0);
            const rowBg = isTotalRow ? 'FEF08A' : (isEven ? 'F8FAFC' : 'FFFFFF');

            for (let c = 0; c < headers.length; c++) {
                const addr = XLSX.utils.encode_cell({ r, c });
                if (!ws[addr]) ws[addr] = { t: 's', v: '' };

                const isNum = typeof ws[addr].v === 'number';
                const isWeight = [3, 4, 5, 6].includes(c);

                ws[addr].s = {
                    fill: { fgColor: { rgb: rowBg } },
                    font: { 
                        name: 'Arial', 
                        sz: 10, 
                        bold: isTotalRow, 
                        color: { rgb: isTotalRow ? '713F12' : '1E293B' } 
                    },
                    alignment: { 
                        horizontal: isNum ? 'right' : (c === 0 ? 'left' : 'center'), 
                        vertical: 'center' 
                    },
                    border: borderThin,
                    numFmt: isWeight ? '#,##0.0' : (isNum ? '#,##0' : undefined)
                };
            }
        }

        ws['!autofilter'] = { ref: `A1:M${rows.length + 1}` };
        ws['!freeze'] = { ySplit: 1 };
        ws['!rows'] = [{ hpt: 26 }, ...rows.map((_, idx) => ({ hpt: idx === rows.length - 1 ? 22 : 20 }))];
        ws['!cols'] = [
            { wch: 22 }, { wch: 18 }, { wch: 14 }, { wch: 18 }, { wch: 18 },
            { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 16 },
            { wch: 16 }, { wch: 16 }, { wch: 16 }
        ];
        const wb = XLSX.utils.book_new();
        const sheetName = isGiao ? "TongHop_DonViGiao" : "TongHop_DVG";
        XLSX.utils.book_append_sheet(wb, ws, sheetName);
        const fileName = isGiao 
            ? `BaoCao_DonViGiao_TongHop_${projCode}_${targetSheet}.xlsx`
            : `BaoCao_DVG_TongHop_${projCode}_${targetSheet}.xlsx`;
        XLSX.writeFile(wb, fileName);
    } else {
        alert("Thư viện xuất Excel đang khởi tạo, vui lòng thử lại sau vài giây!");
    }
}

// Xuất file Excel Báo Cáo Phân Tích Toàn Diện Vật Tư Còn Thiếu (Bao gồm Bảng Tổng Hợp + Bảng Chi Tiết)
function exportDvgMissingPartsExcel(dvgFilter = 'all') {
    if (!state.projectData) {
        alert("Chưa có dữ liệu dự án!");
        return;
    }
    const { byDvg, totals, mode } = computeDvgAnalyticsData();
    const projCode = state.currentProject || 'DuAn';
    const targetSheet = state.selectedSheet !== 'all' ? state.selectedSheet : 'TatCaHangMuc';
    const isGiao = mode === 'giao';

    const dvgTargetList = (dvgFilter && dvgFilter !== 'all') 
        ? byDvg.filter(d => d.dvg === dvgFilter) 
        : byDvg;

    // --- SHEET 1: BẢNG TỔNG HỢP PHÂN TÍCH SỐ LƯỢNG & KHỐI LƯỢNG THIẾU ---
    const s1Headers = [
        isGiao ? "Đơn Vị Giao (Tổ)" : "Đơn Vị Gia Công (DVG)",
        "Tỷ Trọng Dự Án (%)",
        "Tổng Khối Lượng (kg)",
        "KL Đã Nhận (kg)",
        "KL Còn Thiếu (kg)",
        "KL Còn Thiếu (Tấn)",
        "Tiến Độ KL (%)",
        "Tỷ Lệ Thiếu KL (%)",
        "Tổng SL Thiết Kế (pcs)",
        "SL Đã Nhận (pcs)",
        "SL Còn Thiếu (pcs)",
        "Tiến Độ SL (%)",
        "Số Chi Tiết BTP Thiếu",
        "Đánh Giá Tiến Độ"
    ];

    const s1Rows = [];
    dvgTargetList.forEach(d => {
        let evalText = "Đã giao đủ 100%";
        if (d.con_thieu_weight > 0) {
            evalText = d.completion_rate_weight >= 90 ? "Sắp hoàn thành" : (d.completion_rate_weight >= 50 ? "Đang tiến hành" : "Cần đôn đốc gấp");
        }

        s1Rows.push([
            d.dvg,
            d.share_of_total_weight,
            Math.round(d.total_weight * 10) / 10,
            Math.round(d.da_nhan_weight * 10) / 10,
            Math.round(d.con_thieu_weight * 10) / 10,
            Math.round(d.con_thieu_weight / 100) / 10,
            d.completion_rate_weight,
            d.missing_rate_weight,
            d.total_qty,
            d.da_nhan_qty,
            d.con_thieu_qty,
            d.completion_rate_qty,
            d.missing_parts_count,
            evalText
        ]);
    });

    // Dòng tổng cộng cho Sheet 1
    const subTotalWeight = dvgTargetList.reduce((a, b) => a + b.total_weight, 0);
    const subDaNhanWeight = dvgTargetList.reduce((a, b) => a + b.da_nhan_weight, 0);
    const subMissingWeight = dvgTargetList.reduce((a, b) => a + b.con_thieu_weight, 0);
    const subTotalQty = dvgTargetList.reduce((a, b) => a + b.total_qty, 0);
    const subDaNhanQty = dvgTargetList.reduce((a, b) => a + b.da_nhan_qty, 0);
    const subMissingQty = dvgTargetList.reduce((a, b) => a + b.con_thieu_qty, 0);
    const subMissingParts = dvgTargetList.reduce((a, b) => a + b.missing_parts_count, 0);

    const subRateQ = subTotalQty > 0 ? Math.round((subDaNhanQty / subTotalQty) * 1000) / 10 : 0;
    const subRateW = subTotalWeight > 0 ? Math.round((subDaNhanWeight / subTotalWeight) * 1000) / 10 : 0;
    const subMissRateW = subTotalWeight > 0 ? Math.round((subMissingWeight / subTotalWeight) * 1000) / 10 : 0;

    s1Rows.push([
        "TỔNG CỘNG",
        100,
        Math.round(subTotalWeight * 10) / 10,
        Math.round(subDaNhanWeight * 10) / 10,
        Math.round(subMissingWeight * 10) / 10,
        Math.round(subMissingWeight / 100) / 10,
        subRateW,
        subMissRateW,
        subTotalQty,
        subDaNhanQty,
        subMissingQty,
        subRateQ,
        subMissingParts,
        subMissingWeight > 0 ? `Thiếu ${Math.round(subMissingWeight / 100) / 10} Tấn` : "Đã giao đủ 100%"
    ]);

    // --- SHEET 2: CHI TIẾT CÁC VẬT TƯ BTP CÒN THIẾU ---
    const s2Headers = [
        "STT",
        "Đơn Vị Gia Công (DVG)",
        "Đơn Vị Giao (Tổ)",
        "Hạng Mục (Sheet)",
        "Cấu Kiện (Assembly No)",
        "Bản Vẽ (Drawing)",
        "Mã BTP (Chi Tiết)",
        "Quy Cách (Size)",
        "Vật Liệu",
        "SL Thiết Kế",
        "SL Đã Nhận",
        "SL Còn Thiếu",
        "Tỷ Lệ Thiếu (%)",
        "Đơn Trọng (kg)",
        "Khối Lượng Thiếu (kg)",
        "Khối Lượng Thiếu (Tấn)",
        "Kế Hoạch Cắt (Cutting No)",
        "Kiểm Tra Nối",
        "Ghi Chú"
    ];

    let allMissing = [];
    dvgTargetList.forEach(d => {
        allMissing.push(...d.missing_parts);
    });

    // Sắp xếp chi tiết thiếu theo khối lượng thiếu giảm dần
    allMissing.sort((a, b) => b.con_thieu_weight - a.con_thieu_weight);

    if (allMissing.length === 0) {
        alert("Không có chi tiết vật tư nào còn thiếu cho đơn vị này!");
        return;
    }

    const s2Rows = allMissing.map((p, idx) => [
        idx + 1,
        p.dvg,
        p.don_vi_giao,
        p.sheet,
        p.assembly_no,
        p.dwg,
        p.display_name,
        p.size,
        p.material,
        p.tqty,
        p.da_nhan,
        p.con_thieu,
        p.rate_missing,
        p.uweight ? Math.round(p.uweight * 100) / 100 : "-",
        Math.round(p.con_thieu_weight * 10) / 10,
        Math.round((p.con_thieu_weight / 1000) * 1000) / 1000,
        p.cutting_no || "-",
        p.ktra_noi || "-",
        p.ghi_chu || ""
    ]);

    s2Rows.push([
        "TỔNG",
        "-",
        "-",
        "-",
        "-",
        "-",
        `Tổng cộng ${allMissing.length} chi tiết thiếu`,
        "-",
        "-",
        subTotalQty,
        subDaNhanQty,
        subMissingQty,
        "-",
        "-",
        Math.round(subMissingWeight * 10) / 10,
        Math.round(subMissingWeight / 100) / 10,
        "-",
        "-",
        "-"
    ]);

    if (window.XLSX) {
        const wb = XLSX.utils.book_new();

        const borderThin = {
            top: { style: 'thin', color: { rgb: 'CBD5E1' } },
            bottom: { style: 'thin', color: { rgb: 'CBD5E1' } },
            left: { style: 'thin', color: { rgb: 'CBD5E1' } },
            right: { style: 'thin', color: { rgb: 'CBD5E1' } }
        };

        // Sheet 1: Bảng tổng hợp
        const ws1 = XLSX.utils.aoa_to_sheet([s1Headers, ...s1Rows]);
        for (let c = 0; c < s1Headers.length; c++) {
            const addr = XLSX.utils.encode_cell({ r: 0, c });
            if (ws1[addr]) {
                ws1[addr].s = {
                    fill: { fgColor: { rgb: '312E81' } },
                    font: { name: 'Arial', sz: 10, bold: true, color: { rgb: 'FFFFFF' } },
                    alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
                    border: borderThin
                };
            }
        }
        for (let r = 1; r <= s1Rows.length; r++) {
            const isTotalRow = (r === s1Rows.length);
            const isEven = (r % 2 === 0);
            const rowBg = isTotalRow ? 'FEF08A' : (isEven ? 'F8FAFC' : 'FFFFFF');
            for (let c = 0; c < s1Headers.length; c++) {
                const addr = XLSX.utils.encode_cell({ r, c });
                if (!ws1[addr]) ws1[addr] = { t: 's', v: '' };
                const isNum = typeof ws1[addr].v === 'number';
                ws1[addr].s = {
                    fill: { fgColor: { rgb: rowBg } },
                    font: { name: 'Arial', sz: 10, bold: isTotalRow, color: { rgb: isTotalRow ? '713F12' : '1E293B' } },
                    alignment: { horizontal: isNum ? 'right' : (c === 0 ? 'left' : 'center'), vertical: 'center' },
                    border: borderThin,
                    numFmt: isNum ? '#,##0' : undefined
                };
            }
        }
        ws1['!autofilter'] = { ref: `A1:N${s1Rows.length + 1}` };
        ws1['!freeze'] = { ySplit: 1 };
        ws1['!rows'] = [{ hpt: 26 }, ...s1Rows.map(() => ({ hpt: 20 }))];
        ws1['!cols'] = [
            { wch: 18 }, { wch: 18 }, { wch: 20 }, { wch: 18 }, { wch: 20 },
            { wch: 20 }, { wch: 16 }, { wch: 18 }, { wch: 22 }, { wch: 18 },
            { wch: 18 }, { wch: 16 }, { wch: 22 }, { wch: 20 }
        ];
        XLSX.utils.book_append_sheet(wb, ws1, "TongHop_PhanTich_Thieu");

        // Sheet 2: Danh sách chi tiết
        const ws2 = XLSX.utils.aoa_to_sheet([s2Headers, ...s2Rows]);
        for (let c = 0; c < s2Headers.length; c++) {
            const addr = XLSX.utils.encode_cell({ r: 0, c });
            if (ws2[addr]) {
                ws2[addr].s = {
                    fill: { fgColor: { rgb: '1E3A8A' } },
                    font: { name: 'Arial', sz: 10, bold: true, color: { rgb: 'FFFFFF' } },
                    alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
                    border: borderThin
                };
            }
        }
        for (let r = 1; r <= s2Rows.length; r++) {
            const isEven = (r % 2 === 0);
            const rowBg = isEven ? 'F8FAFC' : 'FFFFFF';
            const rowData = s2Rows[r - 1];
            const conThieuVal = rowData[11];

            for (let c = 0; c < s2Headers.length; c++) {
                const addr = XLSX.utils.encode_cell({ r, c });
                if (!ws2[addr]) ws2[addr] = { t: 's', v: '' };
                const isNum = typeof ws2[addr].v === 'number';
                let cellFill = rowBg;
                let cellFont = { name: 'Arial', sz: 10, color: { rgb: '1E293B' } };

                // Nổi bật cột còn thiếu
                if (c === 11 && conThieuVal > 0) {
                    cellFill = 'FEE2E2';
                    cellFont = { name: 'Arial', sz: 10, bold: true, color: { rgb: 'DC2626' } };
                }

                ws2[addr].s = {
                    fill: { fgColor: { rgb: cellFill } },
                    font: cellFont,
                    alignment: { horizontal: isNum ? 'right' : ([0, 1, 8, 17].includes(c) ? 'center' : 'left'), vertical: 'center' },
                    border: borderThin,
                    numFmt: isNum ? '#,##0' : undefined
                };
            }
        }
        ws2['!autofilter'] = { ref: `A1:S${s2Rows.length + 1}` };
        ws2['!freeze'] = { ySplit: 1 };
        ws2['!rows'] = [{ hpt: 26 }, ...s2Rows.map(() => ({ hpt: 20 }))];
        ws2['!cols'] = [
            { wch: 6 }, { wch: 16 }, { wch: 16 }, { wch: 18 }, { wch: 22 },
            { wch: 22 }, { wch: 20 }, { wch: 20 }, { wch: 14 }, { wch: 14 },
            { wch: 14 }, { wch: 14 }, { wch: 16 }, { wch: 14 }, { wch: 20 },
            { wch: 22 }, { wch: 22 }, { wch: 14 }, { wch: 30 }
        ];
        XLSX.utils.book_append_sheet(wb, ws2, "ChiTiet_VatTuThieu");

        const dvgLabel = dvgFilter === 'all' ? (isGiao ? 'TatCaDonViGiao' : 'TatCaDVG') : dvgFilter;
        XLSX.writeFile(wb, `BaoCao_PhanTich_VatTuThieu_${dvgLabel}_${projCode}_${targetSheet}.xlsx`);
    } else {
        alert("Thư viện xuất Excel đang khởi tạo, vui lòng thử lại sau vài giây!");
    }
}

// 11. Đăng ký sự kiện tương tác
function setupEventListeners() {
    // Đổi File Dự Án (Thanh Đầy Đủ)
    const selectProject = document.getElementById('select-project');
    if (selectProject) {
        selectProject.addEventListener('change', (e) => {
            if (e.target.value) {
                const compactSelectProj = document.getElementById('compact-select-project');
                if (compactSelectProj) compactSelectProj.value = e.target.value;
                loadProjectData(e.target.value);
            }
        });
    }

    // Đổi File Dự Án (Thanh Thu Gọn - Thao tác ngay khi thu gọn)
    const compactSelectProject = document.getElementById('compact-select-project');
    if (compactSelectProject) {
        compactSelectProject.addEventListener('change', (e) => {
            if (e.target.value) {
                const mainSelect = document.getElementById('select-project');
                if (mainSelect) mainSelect.value = e.target.value;
                loadProjectData(e.target.value);
            }
        });
    }

    // Đổi Hạng Mục (Sheet - Thanh Đầy Đủ)
    const selectSheet = document.getElementById('select-sheet');
    if (selectSheet) {
        selectSheet.addEventListener('change', (e) => {
            state.selectedSheet = e.target.value;
            const compactSelectSheet = document.getElementById('compact-select-sheet');
            if (compactSelectSheet) compactSelectSheet.value = e.target.value;
            const badge = document.getElementById('export-scope-badge');
            if (badge) {
                badge.textContent = state.selectedSheet === 'all' 
                    ? 'Tất cả các sheet' 
                    : `Hạng mục: ${state.selectedSheet}`;
            }
            updateCompactFilterBadges();
            applyFiltersAndRender(true);
        });
    }

    // Đổi Hạng Mục (Sheet - Thanh Thu Gọn - Thao tác ngay khi thu gọn)
    const compactSelectSheet = document.getElementById('compact-select-sheet');
    if (compactSelectSheet) {
        compactSelectSheet.addEventListener('change', (e) => {
            state.selectedSheet = e.target.value;
            const mainSelect = document.getElementById('select-sheet');
            if (mainSelect) mainSelect.value = e.target.value;
            const badge = document.getElementById('export-scope-badge');
            if (badge) {
                badge.textContent = state.selectedSheet === 'all' 
                    ? 'Tất cả các sheet' 
                    : `Hạng mục: ${state.selectedSheet}`;
            }
            updateCompactFilterBadges();
            applyFiltersAndRender(true);
        });
    }

    // Đổi Trạng Thái
    const selectStatus = document.getElementById('select-status');
    if (selectStatus) {
        selectStatus.addEventListener('change', (e) => {
            state.selectedStatus = e.target.value;
            applyFiltersAndRender(true);
        });
    }

    // Nút Thu Gọn / Mở Rộng Bảng Lọc
    const btnExpandFilter = document.getElementById('btn-expand-filter');
    const btnCompactCal = document.getElementById('btn-compact-calendar');

    document.querySelectorAll('.btn-toggle-filter, #btn-toggle-filter').forEach(btn => {
        btn.addEventListener('click', () => toggleFilterCollapse());
    });
    if (btnExpandFilter) {
        btnExpandFilter.addEventListener('click', () => toggleFilterCollapse(false));
    }
    if (btnCompactCal) {
        btnCompactCal.addEventListener('click', () => openCalendarModal());
    }

    // Nút Đặt lại toàn bộ bộ lọc (Reset All Filters)
    const handleResetFilters = () => {
        state.selectedSheet = 'all';
        state.selectedStatus = 'all';
        state.selectedDate = 'all';
        state.searchQuery = '';

        const selectSheet = document.getElementById('select-sheet');
        if (selectSheet) selectSheet.value = 'all';

        const compactSelectSheet = document.getElementById('compact-select-sheet');
        if (compactSelectSheet) compactSelectSheet.value = 'all';

        const selectStatus = document.getElementById('select-status');
        if (selectStatus) selectStatus.value = 'all';

        const selectDate = document.getElementById('select-date');
        if (selectDate) selectDate.value = 'all';

        const curDateLabel = document.getElementById('current-date-label');
        if (curDateLabel) curDateLabel.textContent = 'Tất cả ngày';

        const inputSearch = document.getElementById('input-search');
        if (inputSearch) inputSearch.value = '';

        const compactSearch = document.getElementById('compact-input-search');
        if (compactSearch) compactSearch.value = '';

        const badge = document.getElementById('export-scope-badge');
        if (badge) badge.textContent = 'Tất cả các sheet';

        updateCompactFilterBadges();
        applyFiltersAndRender(true);
    };

    const btnReset = document.getElementById('btn-reset-filters');
    if (btnReset) btnReset.addEventListener('click', handleResetFilters);

    const btnCompactReset = document.getElementById('btn-compact-reset-filters');
    if (btnCompactReset) btnCompactReset.addEventListener('click', handleResetFilters);

    // Tìm kiếm với Debounce 250ms (Đồng bộ 2 chiều giữa thanh Đầy đủ và thanh Thu gọn)
    let searchTimeout = null;
    const inputSearch = document.getElementById('input-search');
    const compactSearch = document.getElementById('compact-input-search');

    if (inputSearch) {
        inputSearch.addEventListener('input', (e) => {
            clearTimeout(searchTimeout);
            const val = e.target.value;
            if (compactSearch && compactSearch.value !== val) compactSearch.value = val;
            searchTimeout = setTimeout(() => {
                state.searchQuery = val.trim();
                applyFiltersAndRender(true);
            }, 250);
        });
    }

    if (compactSearch) {
        let compactTimeout = null;
        compactSearch.addEventListener('input', (e) => {
            clearTimeout(compactTimeout);
            const val = e.target.value;
            if (inputSearch && inputSearch.value !== val) inputSearch.value = val;
            compactTimeout = setTimeout(() => {
                state.searchQuery = val.trim();
                applyFiltersAndRender(true);
            }, 250);
        });
    }

    // Đọc trạng thái thu gọn trước đó nếu người dùng đã lưu
    if (localStorage.getItem('amecc_filter_collapsed') === 'true') {
        toggleFilterCollapse(true);
    }

    // Nút Tải lên file Excel mới (Dành cho cả Cloud & Local)
    const btnUpload = document.getElementById('btn-upload-excel');
    const fileInput = document.getElementById('excel-file-input');
    if (btnUpload && fileInput) {
        btnUpload.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const formData = new FormData();
            formData.append('file', file);

            const originalText = btnUpload.innerHTML;
            btnUpload.disabled = true;
            btnUpload.innerHTML = `<span>⏳ Đang tải lên...</span>`;

            try {
                const res = await fetch('/api/upload-excel', {
                    method: 'POST',
                    body: formData
                });
                const result = await res.json();
                if (!res.ok) throw new Error(result.detail || "Lỗi tải lên");

                alert(`🎉 ${result.message}`);
                await loadProjectsList();
            } catch (err) {
                alert(`❌ Lỗi tải lên: ${err.message}`);
            } finally {
                btnUpload.disabled = false;
                btnUpload.innerHTML = originalText;
                fileInput.value = '';
                lucide.createIcons();
            }
        });
    }

    // Nút Làm mới máy chủ (Chủ máy)
    const btnReload = document.getElementById('btn-reload-data');
    if (btnReload) {
        btnReload.addEventListener('click', async () => {
            const originalHtml = btnReload.innerHTML;
            btnReload.disabled = true;
            btnReload.innerHTML = `<i data-lucide="loader-2" class="w-3.5 h-3.5 animate-spin inline mr-1"></i><span>Đang nạp tất cả file PL...</span>`;
            if (window.lucide) lucide.createIcons();

            try {
                const curFile = document.getElementById('select-project') ? document.getElementById('select-project').value : null;
                const res = await fetch('/api/clear-cache', { method: 'POST' });
                const resData = await res.json();
                
                // Quét và nạp lại toàn bộ tất cả file PL trong thư mục Data
                await loadProjectsList(curFile);
                
                const count = resData.count || state.projects.length;
                alert(`Đã làm mới máy chủ thành công!\nĐã quét và nạp toàn bộ ${count} file PL trong thư mục Data vào RAM.`);
            } catch (err) {
                alert("Lỗi khi làm mới máy chủ: " + err.message);
            } finally {
                btnReload.disabled = false;
                btnReload.innerHTML = originalHtml;
                if (window.lucide) lucide.createIcons();
            }
        });
    }

    // Xuất file Excel & CSV
    function handleExport(mode) {
        const curFile = document.getElementById('select-project').value;
        if (!curFile) {
            alert("Vui lòng chọn một file dự án trước khi xuất file!");
            return;
        }

        const formatSelect = document.getElementById('select-export-format');
        const format = formatSelect ? formatSelect.value : 'xlsx';
        const formatLabel = format === 'csv' ? 'CSV' : 'Excel';

        const btn = mode === 'missing' 
            ? document.getElementById('btn-export-missing') 
            : document.getElementById('btn-export-full');

        const originalHtml = btn ? btn.innerHTML : '';
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 animate-spin inline mr-1"></i> Đang tạo file ${formatLabel}...`;
            lucide.createIcons();
        }

        if (state.isStaticMode) {
            exportClientSide(mode, format);
            setTimeout(() => {
                if (btn) {
                    btn.disabled = false;
                    btn.innerHTML = originalHtml;
                    lucide.createIcons();
                }
            }, 500);
            return;
        }

        const targetSheetParam = state.selectedSheet && state.selectedSheet !== 'all' 
            ? `&target_sheet=${encodeURIComponent(state.selectedSheet)}` 
            : '';

        const endpoint = format === 'csv' ? '/api/export-csv' : '/api/export-excel';
        const exportUrl = `${endpoint}?file_path=${encodeURIComponent(curFile)}&mode=${mode}${targetSheetParam}&format=${format}`;
        window.location.href = exportUrl;

        setTimeout(() => {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = originalHtml;
                lucide.createIcons();
            }
        }, 2500);
    }

    // Xuất file Client-side dành cho bản Online 24/24 (Không cần Python Server)
    function exportClientSide(mode, format) {
        if (!state.projectData || !state.projectData.assemblies) {
            alert("Chưa có dữ liệu để xuất file!");
            return;
        }
        const headers = [
            "Hạng Mục (Sheet)",
            "Cấu Kiện Mẹ (Assembly)",
            "Tên Cấu Kiện",
            "Số Lượng Mẹ",
            "Part No BTP (Marking)",
            "Chủng Loại",
            "Quy Cách / Chiều Dài",
            "SL Cấu Kiện (Qty / Assy)",
            "SL Thiết Kế (Total Qty)",
            "Đã Nhận",
            "Còn Thiếu",
            "Ktra Nối",
            "Kế Hoạch Cắt (CP No)",
            "Tình Trạng BTP",
            "Ghi Chú"
        ];

        const rows = [];
        const targetSheet = state.selectedSheet;

        state.projectData.assemblies.forEach(assy => {
            if (targetSheet && targetSheet !== 'all' && assy.sheet !== targetSheet) return;
            (assy.parts || []).forEach(p => {
                const conThieu = p.con_thieu !== undefined ? p.con_thieu : (p.total_qty - p.da_nhan);
                if (mode === 'missing' && conThieu <= 0) return;

                const sa = p.shape_analysis || {};
                let statusText = "Đã nhận đủ";
                if (conThieu > 0) {
                    statusText = sa.has_length_issue ? "Chưa đủ chiều dài" : `Còn thiếu ${conThieu}`;
                }

                const notes = [];
                if (p.ktra_noi) notes.push(`Ktra nối: ${p.ktra_noi}`);
                if (sa.has_length_issue) notes.push("Chưa đủ chiều dài");
                if (p.remark) notes.push(p.remark);
                const ghiChu = notes.join(" | ");

                rows.push([
                    assy.sheet || "",
                    assy.as_symbol || "",
                    assy.as_name || "",
                    assy.as_qty || 0,
                    p.part_no || "",
                    p.part_type || "",
                    p.spec || p.length || "",
                    p.qty_per_assy || 0,
                    p.total_qty || 0,
                    p.da_nhan || 0,
                    conThieu,
                    p.ktra_noi || "",
                    sa.cutting_no || p.cutting_no || "",
                    statusText,
                    ghiChu
                ]);
            });
        });

        const projCode = state.currentProject || "DuAn";
        const sheetSuffix = targetSheet && targetSheet !== 'all' ? `_${targetSheet}` : "_TatCaHangMuc";
        const modePrefix = mode === 'full' ? "BTP_FullTier" : "BTP_ConThieu";

        if (format === 'xlsx' && window.XLSX) {
            const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
            
            const borderThin = {
                top: { style: 'thin', color: { rgb: 'CBD5E1' } },
                bottom: { style: 'thin', color: { rgb: 'CBD5E1' } },
                left: { style: 'thin', color: { rgb: 'CBD5E1' } },
                right: { style: 'thin', color: { rgb: 'CBD5E1' } }
            };

            // Style Hàng 1: Tiêu đề Navy Blue AMECC chuyên nghiệp
            for (let c = 0; c < headers.length; c++) {
                const addr = XLSX.utils.encode_cell({ r: 0, c });
                if (ws[addr]) {
                    ws[addr].s = {
                        fill: { fgColor: { rgb: '1E3A8A' } },
                        font: { name: 'Arial', sz: 10, bold: true, color: { rgb: 'FFFFFF' } },
                        alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
                        border: borderThin
                    };
                }
            }

            // Style Hàng dữ liệu: Viền kẻ toàn bộ, căn lề, định dạng số, làm nổi bật chi tiết thiếu
            for (let r = 1; r <= rows.length; r++) {
                const isEven = (r % 2 === 0);
                const rowBg = isEven ? 'F8FAFC' : 'FFFFFF';
                const rowData = rows[r - 1];
                const conThieuVal = rowData[10];

                for (let c = 0; c < headers.length; c++) {
                    const addr = XLSX.utils.encode_cell({ r, c });
                    if (!ws[addr]) ws[addr] = { t: 's', v: '' };

                    const isNum = typeof ws[addr].v === 'number';
                    const isCenter = [5, 11].includes(c);
                    let cellFill = rowBg;
                    let cellFont = { name: 'Arial', sz: 10, color: { rgb: '1E293B' } };

                    // Nổi bật cột còn thiếu bằng màu đỏ cảnh báo
                    if (c === 10 && conThieuVal > 0) {
                        cellFill = 'FEE2E2';
                        cellFont = { name: 'Arial', sz: 10, bold: true, color: { rgb: 'DC2626' } };
                    }

                    ws[addr].s = {
                        fill: { fgColor: { rgb: cellFill } },
                        font: cellFont,
                        alignment: { 
                            horizontal: isNum ? 'right' : (isCenter ? 'center' : 'left'), 
                            vertical: 'center' 
                        },
                        border: borderThin,
                        numFmt: isNum ? '#,##0' : undefined
                    };
                }
            }

            ws['!autofilter'] = { ref: `A1:O${rows.length + 1}` };
            ws['!freeze'] = { ySplit: 1 };
            ws['!rows'] = [{ hpt: 28 }, ...rows.map(() => ({ hpt: 20 }))];
            ws['!cols'] = [
                { wch: 18 }, { wch: 22 }, { wch: 22 }, { wch: 14 }, { wch: 20 },
                { wch: 16 }, { wch: 22 }, { wch: 16 }, { wch: 16 }, { wch: 14 },
                { wch: 14 }, { wch: 16 }, { wch: 18 }, { wch: 18 }, { wch: 28 }
            ];
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "ChiTietBTP");
            XLSX.writeFile(wb, `${modePrefix}_${projCode}${sheetSuffix}.xlsx`);
        } else {
            // Xuất CSV UTF-8 với BOM mở ngay trên Excel tiếng Việt không lỗi font
            const csvRows = [headers, ...rows].map(r => 
                r.map(c => `"${String(c === null || c === undefined ? '' : c).replace(/"/g, '""')}"`).join(",")
            );
            const csvString = "\uFEFF" + csvRows.join("\r\n");
            const blob = new Blob([csvString], { type: "text/csv;charset=utf-8;" });
            const link = document.createElement("a");
            link.href = URL.createObjectURL(blob);
            link.download = `${modePrefix}_${projCode}${sheetSuffix}.csv`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
    }


    const btnExportMissing = document.getElementById('btn-export-missing');
    if (btnExportMissing) {
        btnExportMissing.addEventListener('click', () => handleExport('missing'));
    }

    const btnExportFull = document.getElementById('btn-export-full');
    if (btnExportFull) {
        btnExportFull.addEventListener('click', () => handleExport('full'));
    }

    // Copy link Wi-Fi / LAN
    const btnCopyIp = document.getElementById('btn-copy-ip');
    if (btnCopyIp) {
        btnCopyIp.addEventListener('click', () => {
            const url = document.getElementById('lan-ip-text').dataset.url || window.location.origin;
            navigator.clipboard.writeText(url).then(() => {
                alert(`Đã sao chép link mạng Wi-Fi:\n${url}\n\nĐồng nghiệp trong cùng mạng Wi-Fi có thể truy cập ngay!`);
            });
        });
    }

    // Copy link Mạng ngoài / 4G
    const btnCopyTunnel = document.getElementById('btn-copy-tunnel');
    if (btnCopyTunnel) {
        btnCopyTunnel.addEventListener('click', () => {
            const url = document.getElementById('tunnel-url-text').dataset.url;
            if (url) {
                navigator.clipboard.writeText(url).then(() => {
                    alert(`Đã sao chép link mạng ngoài (Cố định vĩnh viễn):\n${url}\n\nNgười dùng ở xa, dùng 4G hoặc ở nhà đều truy cập được!`);
                });
            } else {
                alert("Đường link mạng ngoài đang khởi tạo, bạn vui lòng đợi vài giây nhé!");
            }
        });
    }

    // Hàm chuyển Tab linh hoạt từ bất kỳ nút nào
    window.switchTab = function(tabName) {
        if (tabName === 'dashboard') {
            window.switchTab('qlda');
            if (typeof window.switchQldaSubtab === 'function') {
                window.switchQldaSubtab('charts');
            }
            return;
        }
        document.querySelectorAll('.nav-tab').forEach(t => {
            t.classList.remove('active', 'text-blue-600', 'border-blue-600');
            t.classList.add('text-slate-500', 'border-transparent');
        });
        const targetTabBtn = document.querySelector(`.nav-tab[data-tab="${tabName}"]`);
        if (targetTabBtn) {
            targetTabBtn.classList.add('active', 'text-blue-600', 'border-blue-600');
            targetTabBtn.classList.remove('text-slate-500', 'border-transparent');
        }

        state.activeTab = tabName;

        document.querySelectorAll('.tab-pane').forEach(p => p.classList.add('hidden'));
        const targetPane = document.getElementById(`tab-${tabName}-content`);
        if (targetPane) {
            targetPane.classList.remove('hidden');
        }

        // Ẩn thanh lọc BOM và KPI BOM khi chuyển sang tab QLDA hoặc DASHBOARD để tránh trùng lặp bộ lọc
        const bomFilterPanel = document.getElementById('sticky-control-panel');
        const bomKpiCards = document.getElementById('kpi-summary-cards');
        const bomSheetChips = document.getElementById('sheet-chips-section');
        if (tabName === 'qlda' || tabName === 'dashboard') {
            if (bomFilterPanel) bomFilterPanel.classList.add('hidden');
            if (bomKpiCards) bomKpiCards.classList.add('hidden');
            if (bomSheetChips) bomSheetChips.classList.add('hidden');
        } else {
            if (bomFilterPanel) bomFilterPanel.classList.remove('hidden');
            if (bomKpiCards) bomKpiCards.classList.remove('hidden');
            if (bomSheetChips) bomSheetChips.classList.remove('hidden');
        }

        if (tabName === 'timeline') renderDailyTimeline();
        if (tabName === 'dvg') renderDvgAnalytics();
        if (tabName === 'qlda') initOrRenderQlda();
        if (tabName === 'dashboard') initOrRenderDashboard();
    };

    // Hàm chuyển đổi Sub-tab trong Phân Tích DVG & Đơn Vị Giao: Bảng vs Biểu Đồ
    window.switchDvgSubtab = function(subtabName) {
        const btnTable = document.getElementById('btn-dvg-subtab-table');
        const btnCharts = document.getElementById('btn-dvg-subtab-charts');
        const paneTable = document.getElementById('dvg-pane-table');
        const paneCharts = document.getElementById('dvg-pane-charts');

        if (!paneTable || !paneCharts) return;

        if (subtabName === 'charts') {
            state.activeDvgSubtab = 'charts';
            paneTable.classList.add('hidden');
            paneCharts.classList.remove('hidden');

            if (btnCharts) {
                btnCharts.className = 'dvg-subtab-btn active flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition shadow-xs cursor-pointer bg-white text-blue-800';
            }
            if (btnTable) {
                btnTable.className = 'dvg-subtab-btn flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition cursor-pointer text-slate-600 hover:text-slate-900 hover:bg-white/60';
            }

            // Render lại biểu đồ DVG để Chart.js tính toán chính xác kích thước canvas
            if (state.projectData) {
                const { byDvg, totals } = computeDvgAnalyticsData();
                renderDvgGraphicCharts(byDvg, totals, state.analyticsMode || 'dvg');
            }
        } else {
            state.activeDvgSubtab = 'table';
            paneCharts.classList.add('hidden');
            paneTable.classList.remove('hidden');

            if (btnTable) {
                btnTable.className = 'dvg-subtab-btn active flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition shadow-xs cursor-pointer bg-white text-indigo-800';
            }
            if (btnCharts) {
                btnCharts.className = 'dvg-subtab-btn flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition cursor-pointer text-slate-600 hover:text-slate-900 hover:bg-white/60';
            }
        }
        if (window.lucide) lucide.createIcons();
    };

    // Hàm chuyển đổi Sub-tab trong Tiến Độ Công Đoạn: Ma Trận vs Biểu Đồ
    window.switchQldaSubtab = function(subtabName) {
        const btnMatrix = document.getElementById('btn-qlda-subtab-matrix');
        const btnCharts = document.getElementById('btn-qlda-subtab-charts');
        const paneMatrix = document.getElementById('qlda-pane-matrix');
        const paneCharts = document.getElementById('qlda-pane-charts');

        if (!paneMatrix || !paneCharts) return;

        if (subtabName === 'charts') {
            qldaState.activeSubtab = 'charts';
            paneMatrix.classList.add('hidden');
            paneCharts.classList.remove('hidden');

            if (btnCharts) {
                btnCharts.className = 'qlda-subtab-btn active flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition shadow-xs cursor-pointer bg-white text-purple-800';
            }
            if (btnMatrix) {
                btnMatrix.className = 'qlda-subtab-btn flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition cursor-pointer text-slate-600 hover:text-slate-900 hover:bg-white/60';
            }

            // Luôn đồng bộ dữ liệu QLDA sang dashboardState
            dashboardState.currentProjectId = qldaState.currentProjectId;
            dashboardState.currentProjectData = qldaState.currentProjectData;

            const dashBadge = document.getElementById('dash-project-badge');
            if (dashBadge && qldaState.currentProjectId) {
                dashBadge.textContent = `Dự Án: ${qldaState.currentProjectId}`;
            }

            if (!dashboardState.isInitialized) {
                setupDashboardEventListeners();
                dashboardState.isInitialized = true;
            }

            // Chờ DOM unhide hoàn tất để canvas có kích thước thực tế trước khi Chart.js tính toán và vẽ
            requestAnimationFrame(() => {
                const items = qldaState.filteredItems || (qldaState.currentProjectData ? qldaState.currentProjectData.items : []);
                renderDashboardAll(items);
            });
        } else {
            qldaState.activeSubtab = 'matrix';
            paneCharts.classList.add('hidden');
            paneMatrix.classList.remove('hidden');

            if (btnMatrix) {
                btnMatrix.className = 'qlda-subtab-btn active flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition shadow-xs cursor-pointer bg-white text-emerald-800';
            }
            if (btnCharts) {
                btnCharts.className = 'qlda-subtab-btn flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition cursor-pointer text-slate-600 hover:text-slate-900 hover:bg-white/60';
            }
        }
        if (window.lucide) lucide.createIcons();
    };

    // Chuyển Tab (Tải lười theo yêu cầu)
    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            const tabName = tab.dataset.tab;
            window.switchTab(tabName);
        });
    });

    // Nút chuyển nhanh sang DVG từ thanh tiêu đề & thanh thu gọn
    const btnSwitchDvg = document.getElementById('btn-switch-to-dvg');
    if (btnSwitchDvg) {
        btnSwitchDvg.addEventListener('click', () => {
            window.switchTab('dvg');
            const targetPane = document.getElementById('tab-dvg-content');
            if (targetPane) targetPane.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
    }

    const btnCompactSwitchDvg = document.getElementById('btn-compact-switch-to-dvg');
    if (btnCompactSwitchDvg) {
        btnCompactSwitchDvg.addEventListener('click', () => {
            window.switchTab('dvg');
            const targetPane = document.getElementById('tab-dvg-content');
            if (targetPane) targetPane.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
    }

    // Nút chuyển nhanh sang Tiến Độ Công Đoạn (QLDA) từ thanh tiêu đề & thanh thu gọn
    const btnSwitchQlda = document.getElementById('btn-switch-to-qlda');
    if (btnSwitchQlda) {
        btnSwitchQlda.addEventListener('click', () => {
            window.switchTab('qlda');
            const targetPane = document.getElementById('tab-qlda-content');
            if (targetPane) targetPane.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
    }

    const btnCompactSwitchQlda = document.getElementById('btn-compact-switch-to-qlda');
    if (btnCompactSwitchQlda) {
        btnCompactSwitchQlda.addEventListener('click', () => {
            window.switchTab('qlda');
            const targetPane = document.getElementById('tab-qlda-content');
            if (targetPane) targetPane.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
    }

    // Nút chuyển nhanh sang Dashboard từ thanh tiêu đề & thanh thu gọn
    const btnSwitchDash = document.getElementById('btn-switch-to-dashboard');
    if (btnSwitchDash) {
        btnSwitchDash.addEventListener('click', () => {
            window.switchTab('dashboard');
            const targetPane = document.getElementById('tab-dashboard-content');
            if (targetPane) targetPane.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
    }

    const btnCompactSwitchDash = document.getElementById('btn-compact-switch-to-dashboard');
    if (btnCompactSwitchDash) {
        btnCompactSwitchDash.addEventListener('click', () => {
            window.switchTab('dashboard');
            const targetPane = document.getElementById('tab-dashboard-content');
            if (targetPane) targetPane.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
    }

    // Thẻ KPI Tiến Độ Khối Lượng DVG trên trang chủ (Bấm mở Dashboard DVG)
    const kpiCardDvg = document.getElementById('kpi-card-dvg-link');
    if (kpiCardDvg) {
        kpiCardDvg.addEventListener('click', () => {
            window.switchTab('dvg');
            const targetPane = document.getElementById('tab-dvg-content');
            if (targetPane) targetPane.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
    }

    // Sự kiện chuyển Sub-tab giữa Bảng và Biểu Đồ trong Phân Tích DVG
    const btnDvgSubTable = document.getElementById('btn-dvg-subtab-table');
    if (btnDvgSubTable) {
        btnDvgSubTable.addEventListener('click', () => window.switchDvgSubtab('table'));
    }
    const btnDvgSubCharts = document.getElementById('btn-dvg-subtab-charts');
    if (btnDvgSubCharts) {
        btnDvgSubCharts.addEventListener('click', () => window.switchDvgSubtab('charts'));
    }

    // Chuyển chế độ phân tích: DVG vs Đơn Vị Giao
    const btnModeDvg = document.getElementById('btn-mode-dvg');
    if (btnModeDvg) {
        btnModeDvg.addEventListener('click', () => {
            if (state.analyticsMode === 'dvg') return;
            state.analyticsMode = 'dvg';
            state.activeDvgFilter = 'all';
            renderDvgAnalytics();
        });
    }
    const btnModeGiao = document.getElementById('btn-mode-giao');
    if (btnModeGiao) {
        btnModeGiao.addEventListener('click', () => {
            if (state.analyticsMode === 'giao') return;
            state.analyticsMode = 'giao';
            state.activeDvgFilter = 'all';
            renderDvgAnalytics();
        });
    }

    // Đổi đơn vị Kg / Tấn trên Dashboard DVG
    const btnUnitTon = document.getElementById('btn-dvg-unit-ton');
    if (btnUnitTon) {
        btnUnitTon.addEventListener('click', () => {
            state.dvgUnit = 'ton';
            renderDvgAnalytics();
        });
    }
    const btnUnitKg = document.getElementById('btn-dvg-unit-kg');
    if (btnUnitKg) {
        btnUnitKg.addEventListener('click', () => {
            state.dvgUnit = 'kg';
            renderDvgAnalytics();
        });
    }

    // Đổi chỉ số biểu đồ: Khối Lượng vs Số Lượng
    const btnChartWeight = document.getElementById('btn-chart-metric-weight');
    const btnChartQty = document.getElementById('btn-chart-metric-qty');
    if (btnChartWeight) {
        btnChartWeight.addEventListener('click', () => {
            if (state.chartMetric === 'weight') return;
            state.chartMetric = 'weight';
            renderDvgAnalytics();
        });
    }
    if (btnChartQty) {
        btnChartQty.addEventListener('click', () => {
            if (state.chartMetric === 'qty') return;
            state.chartMetric = 'qty';
            renderDvgAnalytics();
        });
    }

    // Nút xuất báo cáo từ biểu đồ số liệu
    const btnChartExportMiss = document.getElementById('btn-chart-export-missing');
    if (btnChartExportMiss) {
        btnChartExportMiss.addEventListener('click', () => {
            exportDvgMissingPartsExcel(state.activeDvgFilter || 'all');
        });
    }

    // Nút xuất báo cáo tổng hợp DVG
    const btnExportDvgSum = document.getElementById('btn-export-dvg-summary');
    if (btnExportDvgSum) {
        btnExportDvgSum.addEventListener('click', exportDvgSummaryExcel);
    }

    // Nút xuất toàn bộ chi tiết vật tư thiếu gom theo DVG
    const btnExportDvgAllMiss = document.getElementById('btn-export-dvg-all-missing');
    if (btnExportDvgAllMiss) {
        btnExportDvgAllMiss.addEventListener('click', () => exportDvgMissingPartsExcel('all'));
    }

    // Nút xuất chi tiết vật tư thiếu của DVG đang lọc
    const btnExportActiveDvgParts = document.getElementById('btn-export-active-dvg-parts');
    if (btnExportActiveDvgParts) {
        btnExportActiveDvgParts.addEventListener('click', () => exportDvgMissingPartsExcel(state.activeDvgFilter));
    }

    // Tìm kiếm trong bảng chi tiết vật tư thiếu DVG
    const dvgMissingSearch = document.getElementById('dvg-missing-search');
    if (dvgMissingSearch) {
        let dvgSearchTimer = null;
        dvgMissingSearch.addEventListener('input', (e) => {
            clearTimeout(dvgSearchTimer);
            dvgSearchTimer = setTimeout(() => {
                state.dvgSearchQuery = e.target.value;
                const { byDvg } = computeDvgAnalyticsData();
                renderDvgMissingPartsTable(byDvg);
            }, 200);
        });
    }

    // Mở rộng tất cả các cấu kiện đang hiển thị
    const btnExpandAll = document.getElementById('btn-expand-all');
    if (btnExpandAll) {
        btnExpandAll.addEventListener('click', () => {
            const visibleAssemblies = state.filteredAssemblies.slice(0, state.visibleCount);
            visibleAssemblies.forEach(a => {
                state.expandedAssemblies.add(a.id);
                const details = document.getElementById(`details-${a.id}`);
                const card = document.getElementById(`card-${a.id}`);
                if (details) {
                    if (!details.dataset.rendered) {
                        details.innerHTML = buildPartsTableHtml(a);
                        details.dataset.rendered = "true";
                    }
                    details.classList.remove('hidden');
                }
                if (card) {
                    const icon = card.querySelector('.chevron-icon');
                    if (icon) icon.innerHTML = SVG_ICONS.chevronDown;
                }
            });
        });
    }

    // Thu gọn tất cả
    const btnCollapseAll = document.getElementById('btn-collapse-all');
    if (btnCollapseAll) {
        btnCollapseAll.addEventListener('click', () => {
            state.expandedAssemblies.clear();
            document.querySelectorAll('.assy-details').forEach(d => d.classList.add('hidden'));
            document.querySelectorAll('.chevron-icon').forEach(icon => icon.innerHTML = SVG_ICONS.chevronRight);
        });
    }

    // Quản lý hiệu ứng Đóng Băng Dính Đỉnh (Sticky Freeze) & Nút Lên Đầu Trang khi cuộn
    const stickyPanel = document.getElementById('sticky-control-panel');
    const btnTop = document.getElementById('btn-back-to-top');

    window.addEventListener('scroll', () => {
        const scrollY = window.scrollY || window.pageYOffset || 0;
        
        // Thêm bóng đổ tinh tế khi bảng lọc được đóng băng dính đỉnh
        if (stickyPanel) {
            if (scrollY > 10) {
                stickyPanel.classList.add('is-scrolled');
            } else {
                stickyPanel.classList.remove('is-scrolled');
            }
        }

        // Hiện nút cuộn lên đầu trang khi cuộn quá 250px
        if (btnTop) {
            if (scrollY > 250) {
                btnTop.classList.remove('translate-y-20', 'opacity-0', 'pointer-events-none');
            } else {
                btnTop.classList.add('translate-y-20', 'opacity-0', 'pointer-events-none');
            }
        }
    }, { passive: true });

    if (btnTop) {
        btnTop.addEventListener('click', () => {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    }

    // Đăng ký toàn bộ sự kiện cho Tab Quản Lý Dự Án (QLDA)
    setupQldaEventListeners();
}

// =============================================================================
// MODULE TIẾN ĐỘ CÔNG ĐOẠN (QLDA) - 5 CÔNG ĐOẠN CHẾ TẠO CẤU KIỆN
// =============================================================================

const qldaState = {
    projectsList: [],
    currentProjectId: null,
    currentProjectData: null,
    rawItems: [],
    filteredItems: [],
    filterHangMuc: 'all',
    filterPhanGiao: 'all',
    filterStatus: 'all',
    searchQuery: '',
    currentPage: 1,
    pageSize: 50,
    isLoading: false,
    sortBy: 'stt_asc', // Mặc định: 'stt_asc' (Thứ tự file gốc chuẩn)
    sortCol: null,
    sortDir: 'asc'
};

const QLDA_STATUS_PRIORITY = {
    'CHUA_LAM': 1,
    'DANG_LAM': 2,
    'GA_LAP': 3,
    'HAN': 4,
    'TO_HOP_THU': 5,
    'NGHIEM_THU': 6,
    'BAN_GIAO': 7
};

const _qldaDataCache = {};

function escapeHtml(str) {
    if (!str && str !== 0) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// Khởi tạo hoặc render tab QLDA
function initOrRenderQlda() {
    if (!qldaState.projectsList || qldaState.projectsList.length === 0) {
        loadQldaProjectsList();
    } else {
        // Tự động kiểm tra và đồng bộ với dự án đang xem ở tab BTP
        if (state.currentProject) {
            const btpCode = String(state.currentProject).toUpperCase().replace('PL', '').replace('.XLSX', '').replace('.JSON', '').trim();
            const currentQldaId = (qldaState.currentProjectId || '').toUpperCase();
            
            if (!currentQldaId.startsWith(btpCode) && !btpCode.startsWith(currentQldaId)) {
                const matched = qldaState.projectsList.find(p => {
                    const pCode = p.project_id.toUpperCase();
                    return pCode === btpCode || pCode.startsWith(btpCode) || btpCode.startsWith(pCode);
                });
                if (matched && matched.project_id !== qldaState.currentProjectId) {
                    const selectElem = document.getElementById('select-qlda-project');
                    if (selectElem) selectElem.value = matched.project_id;
                    loadQldaProject(matched.project_id);
                    return;
                }
            }
        }

        if (!qldaState.currentProjectData && qldaState.currentProjectId) {
            loadQldaProject(qldaState.currentProjectId);
        }
    }
}

// Tải danh mục các dự án QLDA
async function loadQldaProjectsList() {
    const selectElem = document.getElementById('select-qlda-project');
    if (selectElem) {
        selectElem.innerHTML = '<option value="">Đang tải danh mục dự án QLDA...</option>';
    }

    try {
        let projects = [];
        if (state.isStaticMode) {
            const resp = await fetch(`data/qlda_projects.json?t=${Date.now()}`, { cache: 'no-store' });
            if (resp.ok) {
                const catalog = await resp.json();
                projects = catalog.projects || [];
            }
        } else {
            try {
                const resp = await fetch('/api/qlda/projects');
                if (resp.ok) {
                    const data = await resp.json();
                    projects = data.projects || [];
                }
            } catch (e) {
                console.warn("API QLDA server không phản hồi, thử nạp data/qlda_projects.json");
            }
            if (!projects || projects.length === 0) {
                const resp = await fetch(`data/qlda_projects.json?t=${Date.now()}`, { cache: 'no-store' });
                if (resp.ok) {
                    const catalog = await resp.json();
                    projects = catalog.projects || [];
                }
            }
        }

        qldaState.projectsList = projects;
        populateQldaProjectsDropdown();

        // Tự động chọn dự án phù hợp với BTP tab nếu có
        let targetProjId = null;
        if (state.currentProject) {
            const btpCode = String(state.currentProject).toUpperCase().replace('PL', '').replace('.XLSX', '').replace('.JSON', '').trim();
            const matched = projects.find(p => {
                const pCode = p.project_id.toUpperCase();
                return pCode === btpCode || pCode.startsWith(btpCode) || btpCode.startsWith(pCode);
            });
            if (matched) targetProjId = matched.project_id;
        }

        if (!targetProjId && projects.length > 0) {
            targetProjId = projects[0].project_id;
        }

        if (targetProjId) {
            if (selectElem) selectElem.value = targetProjId;
            await loadQldaProject(targetProjId);
        }
    } catch (err) {
        console.error("Lỗi nạp danh sách dự án QLDA:", err);
        if (selectElem) selectElem.innerHTML = '<option value="">Lỗi nạp danh mục dự án</option>';
    }
}

// Điền danh sách dự án vào dropdown
function populateQldaProjectsDropdown() {
    const selectElem = document.getElementById('select-qlda-project');
    if (!selectElem) return;

    selectElem.innerHTML = '';
    qldaState.projectsList.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.project_id;
        const tons = p.total_tons ? ` (${p.total_tons} tấn)` : '';
        const bgRate = p.kpis && p.kpis.ban_giao ? ` - BG: ${p.kpis.ban_giao.rate}%` : '';
        opt.textContent = `${p.project_id}${tons}${bgRate}`;
        selectElem.appendChild(opt);
    });
}

// Tải dữ liệu chi tiết của 1 dự án QLDA
async function loadQldaProject(projectId) {
    if (!projectId) return;
    qldaState.currentProjectId = projectId;
    qldaState.isLoading = true;

    const tbody = document.getElementById('qlda-assemblies-tbody');
    if (tbody) {
        tbody.innerHTML = `
            <tr>
                <td colspan="16" class="text-center py-12 text-slate-500 font-medium">
                    <div class="inline-block animate-spin text-emerald-600 mb-2">
                        <i data-lucide="loader-2" class="w-8 h-8"></i>
                    </div>
                    <p>Đang tải và xử lý tiến độ 5 công đoạn dự án ${projectId}...</p>
                </td>
            </tr>
        `;
        if (window.lucide) lucide.createIcons();
    }

    const badge = document.getElementById('qlda-project-badge');
    if (badge) badge.textContent = `Dự Án: ${projectId}`;

    try {
        let data = _qldaDataCache[projectId];
        if (!data) {
            if (state.isStaticMode) {
                const resp = await fetch(`data_qlda/${projectId}.json?t=${Date.now()}`, { cache: 'no-store' });
                if (!resp.ok) throw new Error(`Không tải được file data_qlda/${projectId}.json`);
                data = await resp.json();
            } else {
                try {
                    const resp = await fetch(`/api/qlda/project-data?project_id=${encodeURIComponent(projectId)}`);
                    if (resp.ok) {
                        data = await resp.json();
                    }
                } catch (e) {
                    console.warn("API server không khả dụng, đọc từ data_qlda");
                }
                if (!data) {
                    const resp = await fetch(`data_qlda/${projectId}.json?t=${Date.now()}`, { cache: 'no-store' });
                    if (!resp.ok) throw new Error(`Không tải được dữ liệu cho dự án ${projectId}`);
                    data = await resp.json();
                }
            }
            _qldaDataCache[projectId] = data;
        }

        qldaState.currentProjectData = data;
        qldaState.rawItems = data.items || [];
        qldaState.filterHangMuc = 'all';
        qldaState.filterPhanGiao = 'all';
        qldaState.filterStatus = 'all';
        qldaState.searchQuery = '';
        qldaState.currentPage = 1;

        // Cập nhật bộ chọn Hạng mục
        const hmSelect = document.getElementById('select-qlda-hangmuc');
        if (hmSelect) {
            hmSelect.innerHTML = '<option value="all">📂 Tất cả hạng mục</option>';
            (data.hang_mucs || []).forEach(hm => {
                const opt = document.createElement('option');
                opt.value = hm;
                opt.textContent = hm;
                hmSelect.appendChild(opt);
            });
            hmSelect.value = 'all';
        }

        // Cập nhật bộ chọn Tổ phân giao
        const pgSelect = document.getElementById('select-qlda-phangiao');
        if (pgSelect) {
            pgSelect.innerHTML = '<option value="all">👥 Tất cả tổ phân giao</option>';
            (data.phan_giaos || []).forEach(pg => {
                const opt = document.createElement('option');
                opt.value = pg;
                opt.textContent = `Tổ ${pg}`;
                pgSelect.appendChild(opt);
            });
            pgSelect.value = 'all';
        }

        const stSelect = document.getElementById('select-qlda-status');
        if (stSelect) stSelect.value = 'all';

        const sInput = document.getElementById('input-qlda-search');
        if (sInput) sInput.value = '';

        // Đồng bộ với Dashboard Tiến Độ Công Đoạn
        dashboardState.currentProjectId = projectId;
        dashboardState.currentProjectData = data;

        // Cập nhật ngay huy hiệu dự án trên thanh Dashboard Biểu Đồ
        const dashBadge = document.getElementById('dash-project-badge');
        if (dashBadge) dashBadge.textContent = `Dự Án: ${projectId}`;

        const dashScopeBadge = document.getElementById('dash-scope-badge');
        if (dashScopeBadge) dashScopeBadge.textContent = 'Hạng mục: Tất cả';

        if (!dashboardState.isInitialized) {
            setupDashboardEventListeners();
            dashboardState.isInitialized = true;
        }
        populateDashboardMonths(data.items || []);

        // Tải thêm dữ liệu BOM tương ứng bất đồng bộ cho bảng BTP nếu có
        (async () => {
            try {
                const bomNames = [`${projectId}PL.json`, `${projectId}.json`];
                let bom = null;
                for (let bName of bomNames) {
                    const resp = await fetch(`data/${bName}?t=${Date.now()}`);
                    if (resp.ok) {
                        bom = await resp.json();
                        break;
                    }
                }
                if (!bom && !state.isStaticMode) {
                    const resp = await fetch(`/api/project-data?project_id=${encodeURIComponent(projectId)}`);
                    if (resp.ok) bom = await resp.json();
                }
                dashboardState.bomData = bom;
                if (qldaState.activeSubtab === 'charts') {
                    renderDashboardBtpSection(qldaState.filteredItems || data.items || []);
                }
            } catch (e) {}
        })();

        renderQldaDashboard();
        filterQldaItems();

        // Nếu người dùng đang mở tab Biểu Đồ, vẽ lại biểu đồ ngay lập tức!
        if (qldaState.activeSubtab === 'charts') {
            requestAnimationFrame(() => {
                renderDashboardAll(qldaState.filteredItems || data.items || []);
            });
        }
    } catch (err) {
        console.error(`Lỗi tải dự án QLDA ${projectId}:`, err);
        if (tbody) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="16" class="text-center py-8 text-rose-600 font-bold">
                        <i data-lucide="alert-circle" class="w-6 h-6 inline mr-1 text-rose-600"></i>
                        Không thể nạp dữ liệu dự án ${projectId}: ${err.message}
                    </td>
                </tr>
            `;
            if (window.lucide) lucide.createIcons();
        }
    } finally {
        qldaState.isLoading = false;
    }
}

// Vẽ Dashboard KPI và 5 thanh tiến độ công đoạn (tự động tính động khi lọc)
function renderQldaDashboard(customItems = null) {
    const data = qldaState.currentProjectData;
    if (!data) return;

    const raw = qldaState.rawItems || data.items || [];
    const items = customItems !== null ? customItems : (qldaState.filteredItems || raw);
    const isFiltered = items.length !== raw.length;

    let totalItems = items.length;
    let totalQty = 0;
    let totalWeight = 0.0;
    let sumGaQty = 0, sumGaKl = 0.0;
    let sumHanQty = 0, sumHanKl = 0.0;
    let sumThQty = 0, sumThKl = 0.0;
    let sumNtQty = 0, sumNtKl = 0.0;
    let sumBgQty = 0, sumBgKl = 0.0;

    for (let i = 0; i < items.length; i++) {
        const it = items[i];
        totalQty += (it.tqty || 0);
        totalWeight += (it.tweight || 0);

        if (it.ga_lap) {
            sumGaQty += (it.ga_lap.sl || 0);
            sumGaKl += (it.ga_lap.kl || 0);
        }
        if (it.han) {
            sumHanQty += (it.han.sl || 0);
            sumHanKl += (it.han.kl || 0);
        }
        if (it.to_hop_thu) {
            sumThQty += (it.to_hop_thu.sl || 0);
            sumThKl += (it.to_hop_thu.kl || 0);
        }
        if (it.nghiem_thu) {
            sumNtQty += (it.nghiem_thu.sl || 0);
            sumNtKl += (it.nghiem_thu.kl || 0);
        }
        if (it.ban_giao) {
            sumBgQty += (it.ban_giao.sl || 0);
            sumBgKl += (it.ban_giao.kl || 0);
        }
    }

    const totalTons = Math.round(totalWeight / 100) / 10;
    const rawTotalWeight = data.total_weight || 1;
    const itemPct = raw.length > 0 ? Math.round(totalItems / raw.length * 100) : 100;
    const weightPct = rawTotalWeight > 0 ? Math.round(totalWeight / rawTotalWeight * 100) : 100;

    const rateGa = totalWeight > 0 ? Math.round((sumGaKl / totalWeight) * 1000) / 10 : 0.0;
    const rateHan = totalWeight > 0 ? Math.round((sumHanKl / totalWeight) * 1000) / 10 : 0.0;
    const rateTh = totalWeight > 0 ? Math.round((sumThKl / totalWeight) * 1000) / 10 : 0.0;
    const rateNt = totalWeight > 0 ? Math.round((sumNtKl / totalWeight) * 1000) / 10 : 0.0;
    const rateBg = totalWeight > 0 ? Math.round((sumBgKl / totalWeight) * 1000) / 10 : 0.0;

    const elTotalItems = document.getElementById('qlda-kpi-total-items');
    if (elTotalItems) elTotalItems.textContent = totalItems.toLocaleString();

    const elTotalQty = document.getElementById('qlda-kpi-total-qty');
    if (elTotalQty) {
        elTotalQty.textContent = `${totalQty.toLocaleString()} chi tiết (pcs)${isFiltered ? ` / ${raw.length} CK` : ''}`;
    }

    const elTotalTons = document.getElementById('qlda-kpi-total-tons');
    if (elTotalTons) elTotalTons.textContent = `${totalTons.toLocaleString()} Tấn`;

    const elTotalKg = document.getElementById('qlda-kpi-total-weight-kg');
    if (elTotalKg) elTotalKg.textContent = `${Math.round(totalWeight).toLocaleString()} kg`;

    const badgeItem = document.getElementById('qlda-badge-items-rate');
    if (badgeItem) {
        badgeItem.textContent = `${itemPct}%`;
        if (isFiltered) {
            badgeItem.className = 'text-xs font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded whitespace-nowrap';
        } else {
            badgeItem.className = 'text-xs font-bold text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded whitespace-nowrap';
        }
    }

    const barItems = document.getElementById('qlda-bar-items');
    if (barItems) {
        barItems.style.width = `${Math.min(100, Math.max(0, itemPct))}%`;
    }

    const badgeWeight = document.getElementById('qlda-badge-weight-rate');
    if (badgeWeight) {
        badgeWeight.textContent = `${weightPct}%`;
        if (isFiltered) {
            badgeWeight.className = 'text-xs font-bold text-indigo-700 bg-indigo-100 px-1.5 py-0.5 rounded whitespace-nowrap';
        } else {
            badgeWeight.className = 'text-xs font-bold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded whitespace-nowrap';
        }
    }

    const barWeight = document.getElementById('qlda-bar-weight');
    if (barWeight) {
        barWeight.style.width = `${Math.min(100, Math.max(0, weightPct))}%`;
    }

    setKpiStage('ga', { sl: sumGaQty, kl: sumGaKl, rate: rateGa });
    setKpiStage('han', { sl: sumHanQty, kl: sumHanKl, rate: rateHan });
    setKpiStage('th', { sl: sumThQty, kl: sumThKl, rate: rateTh });
    setKpiStage('nt', { sl: sumNtQty, kl: sumNtKl, rate: rateNt });
    setKpiStage('bg', { sl: sumBgQty, kl: sumBgKl, rate: rateBg });
}

function setKpiStage(prefix, stageData) {
    const rateEl = document.getElementById(`qlda-rate-${prefix}`);
    if (rateEl) rateEl.textContent = `${stageData.rate || 0}%`;

    const tonsEl = document.getElementById(`qlda-tons-${prefix}`);
    if (tonsEl) {
        const tons = Math.round((stageData.kl || 0) / 100) / 10;
        tonsEl.textContent = `${tons.toLocaleString()} Tấn`;
    }

    const barEl = document.getElementById(`qlda-bar-${prefix}`);
    if (barEl) {
        barEl.style.width = `${Math.min(100, Math.max(0, stageData.rate || 0))}%`;
    }

    const qtyEl = document.getElementById(`qlda-qty-${prefix}`);
    if (qtyEl) {
        qtyEl.textContent = `Đã làm: ${(stageData.sl || 0).toLocaleString()} pcs`;
    }
}

// Lọc và sắp xếp cấu kiện theo các tiêu chí
function filterQldaItems() {
    const raw = qldaState.rawItems || [];
    const hm = qldaState.filterHangMuc;
    const pg = qldaState.filterPhanGiao;
    const st = qldaState.filterStatus;
    const q = (qldaState.searchQuery || '').toLowerCase().trim();

    // 1. Lọc theo các tiêu chí
    let filtered = raw.filter(item => {
        if (hm !== 'all' && item.hang_muc !== hm) return false;
        if (pg !== 'all' && item.phan_giao !== pg) return false;
        if (st !== 'all' && item.status !== st) return false;

        if (q) {
            const matchSoChiTiet = item.so_chi_tiet && item.so_chi_tiet.toLowerCase().includes(q);
            const matchBanVe = item.ten_ban_ve && item.ten_ban_ve.toLowerCase().includes(q);
            const matchSize = item.size && item.size.toLowerCase().includes(q);
            const matchProfile = item.profile && item.profile.toLowerCase().includes(q);
            const matchHangMuc = item.hang_muc && item.hang_muc.toLowerCase().includes(q);
            const matchTổ = item.phan_giao && item.phan_giao.toLowerCase().includes(q);
            const matchNote = item.note && item.note.toLowerCase().includes(q);
            const matchBB = item.ban_giao?.so_bien_ban && item.ban_giao.so_bien_ban.toLowerCase().includes(q);
            const matchDV = item.ban_giao?.don_vi_nhan && item.ban_giao.don_vi_nhan.toLowerCase().includes(q);
            if (!matchSoChiTiet && !matchBanVe && !matchSize && !matchProfile && !matchHangMuc && !matchTổ && !matchNote && !matchBB && !matchDV) {
                return false;
            }
        }
        return true;
    });

    // 2. Sắp xếp dữ liệu (Sorting)
    const sortCol = qldaState.sortCol;
    const sortDir = qldaState.sortDir;

    if (sortCol) {
        // Sắp xếp khi người dùng click vào tiêu đề cột
        filtered.sort((a, b) => {
            let valA, valB;
            switch (sortCol) {
                case 'stt':
                    valA = a.stt || 0;
                    valB = b.stt || 0;
                    break;
                case 'so_chi_tiet':
                    valA = (a.so_chi_tiet || '').toLowerCase();
                    valB = (b.so_chi_tiet || '').toLowerCase();
                    break;
                case 'ten_ban_ve':
                    valA = (a.ten_ban_ve || '').toLowerCase();
                    valB = (b.ten_ban_ve || '').toLowerCase();
                    break;
                case 'hang_muc':
                    valA = (a.hang_muc || '').toLowerCase();
                    valB = (b.hang_muc || '').toLowerCase();
                    break;
                case 'phan_giao':
                    valA = (a.phan_giao || '').toLowerCase();
                    valB = (b.phan_giao || '').toLowerCase();
                    break;
                case 'size':
                    valA = (a.size || a.profile || '').toLowerCase();
                    valB = (b.size || b.profile || '').toLowerCase();
                    break;
                case 'tqty':
                    valA = a.tqty || 0;
                    valB = b.tqty || 0;
                    break;
                case 'uweight':
                    valA = a.uweight || 0;
                    valB = b.uweight || 0;
                    break;
                case 'tweight':
                    valA = a.tweight || 0;
                    valB = b.tweight || 0;
                    break;
                case 'status':
                    valA = QLDA_STATUS_PRIORITY[a.status] || 99;
                    valB = QLDA_STATUS_PRIORITY[b.status] || 99;
                    break;
                case 'ga_lap':
                    valA = a.ga_lap?.sl || 0;
                    valB = b.ga_lap?.sl || 0;
                    break;
                case 'han':
                    valA = a.han?.sl || 0;
                    valB = b.han?.sl || 0;
                    break;
                case 'to_hop_thu':
                    valA = a.to_hop_thu?.sl || 0;
                    valB = b.to_hop_thu?.sl || 0;
                    break;
                case 'nghiem_thu':
                    valA = a.nghiem_thu?.sl || 0;
                    valB = b.nghiem_thu?.sl || 0;
                    break;
                case 'ban_giao':
                    valA = a.ban_giao?.sl || 0;
                    valB = b.ban_giao?.sl || 0;
                    break;
                default:
                    valA = a.stt || 0;
                    valB = b.stt || 0;
            }

            if (valA < valB) return sortDir === 'asc' ? -1 : 1;
            if (valA > valB) return sortDir === 'asc' ? 1 : -1;
            return 0;
        });
    } else {
        // Sắp xếp theo lựa chọn trong Dropdown Sắp Xếp
        switch (qldaState.sortBy) {
            case 'stt_asc':
            default:
                // Thứ tự file gốc là mặc định chuẩn 100%
                filtered.sort((a, b) => (a.stt || 0) - (b.stt || 0));
                break;
            case 'incomplete_first':
                // Ưu tiên chưa xong lên đầu (Chưa làm -> Đang làm -> Gá -> Hàn -> TH Thử -> NT -> BG)
                filtered.sort((a, b) => {
                    const pA = QLDA_STATUS_PRIORITY[a.status] || 99;
                    const pB = QLDA_STATUS_PRIORITY[b.status] || 99;
                    if (pA !== pB) return pA - pB;
                    return (b.tweight || 0) - (a.tweight || 0);
                });
                break;
            case 'weight_desc':
                filtered.sort((a, b) => (b.tweight || 0) - (a.tweight || 0));
                break;
            case 'weight_asc':
                filtered.sort((a, b) => (a.tweight || 0) - (b.tweight || 0));
                break;
            case 'code_asc':
                filtered.sort((a, b) => (a.so_chi_tiet || '').localeCompare(b.so_chi_tiet || ''));
                break;
            case 'code_desc':
                filtered.sort((a, b) => (b.so_chi_tiet || '').localeCompare(a.so_chi_tiet || ''));
                break;
            case 'drawing_asc':
                filtered.sort((a, b) => (a.ten_ban_ve || '').localeCompare(b.ten_ban_ve || ''));
                break;
            case 'qty_desc':
                filtered.sort((a, b) => (b.tqty || 0) - (a.tqty || 0));
                break;
            case 'stt_asc':
                filtered.sort((a, b) => (a.stt || 0) - (b.stt || 0));
                break;
        }
    }

    qldaState.filteredItems = filtered;
    qldaState.currentPage = 1;

    qldaState.filteredItems = filtered;
    qldaState.currentPage = 1;

    const elFiltered = document.getElementById('qlda-filtered-count');
    if (elFiltered) elFiltered.textContent = qldaState.filteredItems.length.toLocaleString();
    const elTotal = document.getElementById('qlda-total-count');
    if (elTotal) elTotal.textContent = raw.length.toLocaleString();

    const isFiltering = (hm !== 'all' || pg !== 'all' || st !== 'all' || q !== '' || qldaState.sortBy !== 'incomplete_first' || qldaState.sortCol !== null);
    const btnReset = document.getElementById('btn-qlda-reset-filter');
    if (btnReset) {
        if (isFiltering) {
            btnReset.classList.remove('hidden');
            btnReset.classList.add('inline-flex');
        } else {
            btnReset.classList.add('hidden');
            btnReset.classList.remove('inline-flex');
        }
    }

    // Cập nhật số lượng hiển thị trên Sub-tab và Nhãn phạm vi đang lọc
    const badgeSub = document.getElementById('qlda-badge-subview-count');
    if (badgeSub) badgeSub.textContent = `${filtered.length.toLocaleString()} CK`;
    const scopeLabel = document.getElementById('qlda-current-scope-label');
    if (scopeLabel) {
        let label = hm === 'all' ? 'Tất cả hạng mục' : hm;
        if (pg !== 'all') label += ` • Tổ ${pg}`;
        if (st !== 'all') label += ` • ${st}`;
        scopeLabel.textContent = label;
    }

    // Đồng bộ nhãn phạm vi trên khung Biểu Đồ Dashboard
    const dashScopeBadge = document.getElementById('dash-scope-badge');
    if (dashScopeBadge) {
        let label = hm === 'all' ? 'Hạng mục: Tất cả' : `Hạng mục: ${hm}`;
        if (pg !== 'all') label += ` • Tổ ${pg}`;
        dashScopeBadge.textContent = label;
    }

    renderQldaActiveFilterTags();
    renderQldaDashboard(filtered); // Đồng bộ 7 thẻ KPI nhảy tự động theo danh sách cấu kiện đã lọc
    renderQldaTable();
    renderDashboardAll(filtered); // Đồng bộ toàn bộ biểu đồ Line, BTP, Gantt nhảy tự động theo hạng mục & bộ lọc
}

// Render các thẻ lọc (Filter Tags) đang kích hoạt
function renderQldaActiveFilterTags() {
    const container = document.getElementById('qlda-active-filter-tags');
    if (!container) return;

    const hm = qldaState.filterHangMuc;
    const pg = qldaState.filterPhanGiao;
    const st = qldaState.filterStatus;
    const q = (qldaState.searchQuery || '').trim();

    const statusNames = {
        'BAN_GIAO': 'Đã bàn giao 100%',
        'NGHIEM_THU': 'Đã nghiệm thu',
        'TO_HOP_THU': 'Đã tổ hợp thử',
        'HAN': 'Đã hàn',
        'GA_LAP': 'Đã gá lắp',
        'DANG_LAM': 'Đang làm dở dang',
        'CHUA_LAM': 'Chưa bắt đầu'
    };

    let tags = [];
    if (hm !== 'all') {
        tags.push({ key: 'hm', label: `Hạng mục: ${hm}`, action: () => {
            qldaState.filterHangMuc = 'all';
            const sel = document.getElementById('select-qlda-hangmuc');
            if (sel) sel.value = 'all';
            filterQldaItems();
        }});
    }
    if (pg !== 'all') {
        tags.push({ key: 'pg', label: `Tổ: ${pg}`, action: () => {
            qldaState.filterPhanGiao = 'all';
            const sel = document.getElementById('select-qlda-phangiao');
            if (sel) sel.value = 'all';
            filterQldaItems();
        }});
    }
    if (st !== 'all') {
        tags.push({ key: 'st', label: `Trạng thái: ${statusNames[st] || st}`, action: () => {
            qldaState.filterStatus = 'all';
            const sel = document.getElementById('select-qlda-status');
            if (sel) sel.value = 'all';
            filterQldaItems();
        }});
    }
    if (q !== '') {
        tags.push({ key: 'q', label: `Tìm kiếm: "${q}"`, action: () => {
            qldaState.searchQuery = '';
            const inp = document.getElementById('input-qlda-search');
            if (inp) inp.value = '';
            filterQldaItems();
        }});
    }

    if (tags.length === 0) {
        container.classList.add('hidden');
        container.classList.remove('flex');
        container.innerHTML = '';
        return;
    }

    container.classList.remove('hidden');
    container.classList.add('flex');
    container.innerHTML = `
        <span class="text-[11px] font-bold text-slate-400 uppercase tracking-wider mr-1">Đang lọc:</span>
        ${tags.map((t, idx) => `
            <span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] font-medium shadow-2xs">
                <span>${escapeHtml(t.label)}</span>
                <button type="button" class="btn-clear-qlda-tag text-emerald-600 hover:text-rose-700 font-bold ml-0.5 cursor-pointer" data-idx="${idx}" title="Bỏ lọc">✕</button>
            </span>
        `).join('')}
    `;

    container.querySelectorAll('.btn-clear-qlda-tag').forEach(btn => {
        btn.addEventListener('click', () => {
            const idx = parseInt(btn.dataset.idx, 10);
            if (tags[idx] && typeof tags[idx].action === 'function') {
                tags[idx].action();
            }
        });
    });
}

// Render bảng ma trận tiến độ cấu kiện (Tối ưu căn lề thẳng hàng không bị lệch dòng)
function renderQldaTable() {
    const tbody = document.getElementById('qlda-assemblies-tbody');
    if (!tbody) return;

    // Cập nhật mũi tên chỉ hướng sắp xếp trên tiêu đề cột
    document.querySelectorAll('th[data-qlda-sort]').forEach(th => {
        const col = th.dataset.qldaSort;
        const icon = th.querySelector('.qlda-sort-indicator');
        if (icon) {
            if (qldaState.sortCol === col) {
                icon.textContent = qldaState.sortDir === 'asc' ? '▲' : '▼';
                icon.className = 'qlda-sort-indicator text-[10px] text-blue-600 font-bold ml-0.5';
                th.classList.add('bg-blue-50');
            } else {
                icon.textContent = '↕';
                icon.className = 'qlda-sort-indicator text-[9px] text-slate-400 opacity-60 ml-0.5';
                th.classList.remove('bg-blue-50');
            }
        }
    });

    const items = qldaState.filteredItems || [];
    if (items.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="16" class="text-center py-12 text-slate-400">
                    <i data-lucide="inbox" class="w-8 h-8 mx-auto mb-2 text-slate-300"></i>
                    <p class="font-medium text-sm text-slate-600">Không tìm thấy cấu kiện nào phù hợp với điều kiện lọc</p>
                    <p class="text-xs text-slate-400 mt-1">Hãy thử chọn lại hạng mục, tổ phân giao hoặc xóa từ khóa tìm kiếm</p>
                </td>
            </tr>
        `;
        if (window.lucide) lucide.createIcons();
        renderQldaPagination();
        return;
    }

    const pageSize = qldaState.pageSize;
    const startIndex = (qldaState.currentPage - 1) * pageSize;
    const pageItems = items.slice(startIndex, startIndex + pageSize);

    let html = '';
    pageItems.forEach((item, idx) => {
        const stt = startIndex + idx + 1;
        const statusBadge = getStatusBadgeHtml(item.status);

        const gaDone = item.ga_lap.sl >= item.tqty && item.tqty > 0;
        const gaCell = formatStageCell(item.ga_lap, item.tqty, 'blue', gaDone);

        const hanDone = item.han.sl >= item.tqty && item.tqty > 0;
        const hanCell = formatStageCell(item.han, item.tqty, 'amber', hanDone);

        const thHasReq = item.to_hop_thu.sl > 0 || item.to_hop_thu.kl > 0;
        const thDone = thHasReq && item.to_hop_thu.sl >= item.tqty;
        const thCell = formatStageCell(item.to_hop_thu, item.tqty, 'purple', thDone);

        const ntDone = item.nghiem_thu.sl >= item.tqty && item.tqty > 0;
        const ntCell = formatStageCell(item.nghiem_thu, item.tqty, 'teal', ntDone);

        const bgDone = item.ban_giao.sl >= item.tqty && item.tqty > 0;
        const bgCell = formatHandoverCell(item.ban_giao, item.tqty, bgDone);

        html += `
            <tr class="hover:bg-slate-50/80 transition border-b border-slate-100 text-slate-800">
                <td class="py-2 px-2 text-center text-slate-400 font-mono text-[11px] align-top">
                    <div class="h-[18px] flex items-center justify-center">${stt}</div>
                </td>
                <td class="py-2 px-3 align-top min-w-[120px]">
                    <div class="h-[18px] flex items-center">
                        <button type="button" class="btn-qlda-item-detail text-left font-bold text-blue-700 hover:text-blue-900 hover:underline cursor-pointer flex items-center gap-1.5 truncate max-w-[150px]" data-idx="${item.stt}">
                            <span class="truncate">${escapeHtml(item.so_chi_tiet)}</span>
                            <i data-lucide="external-link" class="w-3 h-3 text-blue-400 flex-shrink-0"></i>
                        </button>
                    </div>
                </td>
                <td class="py-2 px-2.5 text-slate-700 font-mono text-[11px] align-top min-w-[110px]" title="${escapeHtml(item.ten_ban_ve)}">
                    <div class="h-[18px] flex items-center truncate max-w-[120px]">${escapeHtml(item.ten_ban_ve || '-')}</div>
                </td>
                <td class="py-2 px-2.5 text-slate-600 text-[11px] align-top min-w-[110px]" title="${escapeHtml(item.hang_muc)}">
                    <div class="h-[18px] flex items-center truncate max-w-[120px]">${escapeHtml(item.hang_muc)}</div>
                </td>
                <td class="py-2 px-2 text-center align-top w-12">
                    <div class="h-[18px] flex items-center justify-center">
                        <span class="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-bold text-[10px] whitespace-nowrap">${escapeHtml(item.phan_giao)}</span>
                    </div>
                </td>
                <td class="py-2 px-2.5 align-top min-w-[120px] max-w-[140px]">
                    <div class="h-[18px] flex items-center font-bold text-slate-800 text-[11px] truncate" title="${escapeHtml(item.size || item.dang_sp || '')}">${escapeHtml(item.size || item.dang_sp || '-')}</div>
                    ${item.profile ? `<div class="h-[16px] flex items-center text-[10px] text-slate-500 font-mono truncate" title="${escapeHtml(item.profile)}">${escapeHtml(item.profile)}</div>` : ''}
                </td>
                <td class="py-2 px-2 text-right font-bold text-slate-900 align-top min-w-[60px]">
                    <div class="h-[18px] flex items-center justify-end font-mono">${item.tqty}</div>
                </td>
                <td class="py-2 px-2 text-right text-slate-500 font-mono text-[11px] align-top min-w-[75px]">
                    <div class="h-[18px] flex items-center justify-end">${item.uweight ? item.uweight.toLocaleString() : '-'}</div>
                </td>
                <td class="py-2 px-2.5 text-right font-extrabold text-blue-900 font-mono whitespace-nowrap align-top min-w-[85px]">
                    <div class="h-[18px] flex items-center justify-end">${(item.tweight || 0).toLocaleString()}</div>
                </td>
                <td class="py-2 px-2 text-center whitespace-nowrap align-top min-w-[100px]">
                    <div class="h-[18px] flex items-center justify-center">${statusBadge}</div>
                </td>
                <td class="py-2 px-2 text-center bg-blue-50/20 border-l border-blue-100 align-top min-w-[85px]">${gaCell}</td>
                <td class="py-2 px-2 text-center bg-amber-50/20 border-l border-amber-100 align-top min-w-[85px]">${hanCell}</td>
                <td class="py-2 px-2 text-center bg-purple-50/20 border-l border-purple-100 align-top min-w-[85px]">${thCell}</td>
                <td class="py-2 px-2 text-center bg-teal-50/20 border-l border-teal-100 align-top min-w-[95px]">${ntCell}</td>
                <td class="py-2 px-2 text-center bg-emerald-50/30 border-l border-emerald-200 align-top min-w-[95px]">${bgCell}</td>
                <td class="py-2 px-2 text-center align-top w-12">
                    <div class="h-[18px] flex items-center justify-center">
                        <button type="button" class="btn-qlda-item-detail p-1 rounded-lg hover:bg-slate-200 text-slate-500 hover:text-slate-800 transition cursor-pointer" title="Xem chi tiết hành trình 5 công đoạn" data-idx="${item.stt}">
                            <i data-lucide="eye" class="w-3.5 h-3.5"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    });

    tbody.innerHTML = html;
    if (window.lucide) lucide.createIcons();

    tbody.querySelectorAll('.btn-qlda-item-detail').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const itemStt = parseInt(btn.dataset.idx, 10);
            const found = qldaState.rawItems.find(it => it.stt === itemStt);
            if (found) openQldaAssemblyDetail(found);
        });
    });

    renderQldaPagination();
}

function getStatusBadgeHtml(status) {
    const baseClass = "px-2.5 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap inline-flex items-center gap-1 shadow-2xs";
    switch (status) {
        case 'BAN_GIAO':
            return `<span class="${baseClass} bg-emerald-100 text-emerald-800 border border-emerald-300">🟢 Bàn giao</span>`;
        case 'NGHIEM_THU':
            return `<span class="${baseClass} bg-teal-100 text-teal-800 border border-teal-300">🔵 Nghiệm thu</span>`;
        case 'TO_HOP_THU':
            return `<span class="${baseClass} bg-purple-100 text-purple-800 border border-purple-300">🟣 TH Thử</span>`;
        case 'HAN':
            return `<span class="${baseClass} bg-amber-100 text-amber-800 border border-amber-300">🟡 Đã hàn</span>`;
        case 'GA_LAP':
            return `<span class="${baseClass} bg-blue-100 text-blue-800 border border-blue-300">🟠 Đã gá</span>`;
        case 'DANG_LAM':
            return `<span class="${baseClass} bg-indigo-100 text-indigo-800 border border-indigo-300">⏳ Đang làm</span>`;
        case 'CHUA_LAM':
        default:
            return `<span class="${baseClass} bg-slate-100 text-slate-500 border border-slate-200">⚪ Chưa làm</span>`;
    }
}

// Format ô công đoạn chuẩn chỉnh: 3 tầng độ cao cố định (18px - 16px - 15px) tuyệt đối không lệch hàng
function formatStageCell(stageObj, tqty, colorTheme, isDone) {
    if (!stageObj || (stageObj.sl === 0 && !stageObj.ngay)) {
        return `
            <div class="flex flex-col items-center justify-start select-none whitespace-nowrap min-w-[70px]">
                <span class="h-[18px] flex items-center justify-center text-slate-300 font-mono text-[11px]">-</span>
                <span class="h-[16px] flex items-center justify-center text-transparent font-mono text-[10px] select-none">-</span>
                <span class="h-[15px] flex items-center justify-center text-transparent font-mono text-[9px] select-none">-</span>
            </div>
        `;
    }
    const sl = stageObj.sl || 0;
    const kl = stageObj.kl || 0;
    const dateStr = stageObj.ngay || '';
    
    let textClass = 'text-slate-700 font-bold';
    if (colorTheme === 'blue' || colorTheme === 'sky') {
        textClass = isDone ? 'text-sky-800 font-extrabold' : 'text-sky-700 font-bold';
    } else if (colorTheme === 'amber') {
        textClass = isDone ? 'text-amber-800 font-extrabold' : 'text-amber-700 font-bold';
    } else if (colorTheme === 'purple') {
        textClass = isDone ? 'text-purple-800 font-extrabold' : 'text-purple-700 font-bold';
    } else if (colorTheme === 'teal') {
        textClass = isDone ? 'text-teal-800 font-extrabold' : 'text-teal-700 font-bold';
    } else if (colorTheme === 'emerald') {
        textClass = isDone ? 'text-emerald-800 font-extrabold' : 'text-emerald-700 font-bold';
    }

    return `
        <div class="flex flex-col items-center justify-start whitespace-nowrap min-w-[70px]">
            <span class="h-[18px] flex items-center justify-center ${textClass} text-[11px]">${sl}/${tqty}</span>
            <span class="h-[16px] flex items-center justify-center text-[10px] text-slate-500 font-mono">${kl > 0 ? `${kl.toLocaleString()}kg` : '-'}</span>
            <span class="h-[15px] flex items-center justify-center text-[9px] text-slate-400 font-mono">${dateStr || '-'}</span>
        </div>
    `;
}

// Format ô bàn giao chuẩn chỉnh: 3 dòng đầu khớp hoàn toàn các công đoạn khác, thông tin đơn vị & số BB hiển thị gọn bên dưới
function formatHandoverCell(bgObj, tqty, isDone) {
    if (!bgObj || (bgObj.sl === 0 && !bgObj.ngay)) {
        return `
            <div class="flex flex-col items-center justify-start select-none whitespace-nowrap min-w-[80px]">
                <span class="h-[18px] flex items-center justify-center text-slate-300 font-mono text-[11px]">-</span>
                <span class="h-[16px] flex items-center justify-center text-transparent font-mono text-[10px] select-none">-</span>
                <span class="h-[15px] flex items-center justify-center text-transparent font-mono text-[9px] select-none">-</span>
            </div>
        `;
    }
    const sl = bgObj.sl || 0;
    const kl = bgObj.kl || 0;
    const dateStr = bgObj.ngay || '';
    const textClass = isDone ? 'text-emerald-700 font-extrabold' : 'text-amber-700 font-bold';
    const donVi = bgObj.don_vi_nhan ? `<div class="text-[9px] text-emerald-800 font-semibold truncate max-w-[95px] mx-auto pt-0.5 border-t border-emerald-200/80 leading-tight" title="${escapeHtml(bgObj.don_vi_nhan)}">${escapeHtml(bgObj.don_vi_nhan)}</div>` : '';
    const soBB = bgObj.so_bien_ban ? `<div class="text-[9px] text-slate-500 font-mono truncate max-w-[95px] mx-auto leading-tight" title="${escapeHtml(bgObj.so_bien_ban)}">BB:${escapeHtml(bgObj.so_bien_ban)}</div>` : '';

    return `
        <div class="flex flex-col items-center justify-start whitespace-nowrap min-w-[80px]">
            <span class="h-[18px] flex items-center justify-center ${textClass} font-bold text-[11px]">${sl}/${tqty}</span>
            <span class="h-[16px] flex items-center justify-center text-[10px] text-slate-500 font-mono">${kl > 0 ? `${kl.toLocaleString()}kg` : '-'}</span>
            <span class="h-[15px] flex items-center justify-center text-[9px] text-slate-400 font-mono">${dateStr || '-'}</span>
            ${donVi}
            ${soBB}
        </div>
    `;
}


// Global Pagination Functions for QLDA
window.qldaGoPrev = function(scrollToTop = false) {
    if (qldaState.currentPage > 1) {
        qldaState.currentPage--;
        renderQldaTable();
        if (scrollToTop) {
            const tableCard = document.getElementById('qlda-matrix-card') || document.getElementById('qlda-assemblies-tbody');
            if (tableCard) tableCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }
};

window.qldaGoNext = function(scrollToTop = false) {
    const totalPages = Math.max(1, Math.ceil((qldaState.filteredItems || []).length / qldaState.pageSize));
    if (qldaState.currentPage < totalPages) {
        qldaState.currentPage++;
        renderQldaTable();
        if (scrollToTop) {
            const tableCard = document.getElementById('qlda-matrix-card') || document.getElementById('qlda-assemblies-tbody');
            if (tableCard) tableCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }
};

function renderQldaPagination() {
    const items = qldaState.filteredItems || [];
    const totalPages = Math.max(1, Math.ceil(items.length / qldaState.pageSize));
    const currentPage = Math.min(totalPages, Math.max(1, qldaState.currentPage));
    qldaState.currentPage = currentPage;

    const pageInfo = document.getElementById('qlda-page-info');
    if (pageInfo) pageInfo.textContent = `Trang ${currentPage} / ${totalPages}`;
    const pageInfoBottom = document.getElementById('qlda-page-info-bottom');
    if (pageInfoBottom) pageInfoBottom.textContent = `Trang ${currentPage} / ${totalPages}`;

    const btnPrev = document.getElementById('btn-qlda-prev-page');
    if (btnPrev) btnPrev.disabled = (currentPage <= 1);
    const btnPrevBottom = document.getElementById('btn-qlda-prev-page-bottom');
    if (btnPrevBottom) btnPrevBottom.disabled = (currentPage <= 1);

    const btnNext = document.getElementById('btn-qlda-next-page');
    if (btnNext) btnNext.disabled = (currentPage >= totalPages);
    const btnNextBottom = document.getElementById('btn-qlda-next-page-bottom');
    if (btnNextBottom) btnNextBottom.disabled = (currentPage >= totalPages);

    const statusEl = document.getElementById('qlda-pagination-status');
    if (statusEl) {
        if (items.length === 0) {
            statusEl.textContent = '0 cấu kiện';
        } else {
            const start = (currentPage - 1) * qldaState.pageSize + 1;
            const end = Math.min(items.length, currentPage * qldaState.pageSize);
            statusEl.textContent = `Hiển thị ${start} - ${end} trên tổng số ${items.length.toLocaleString()} cấu kiện`;
        }
    }
}

// Mở Modal chi tiết cấu kiện & lộ trình 5 công đoạn
function openQldaAssemblyDetail(item) {
    if (!item) return;

    const modal = document.getElementById('modal-qlda-detail');
    if (!modal) return;

    document.getElementById('modal-qlda-title').textContent = `Cấu Kiện: ${item.so_chi_tiet}`;
    const badge = document.getElementById('modal-qlda-status-badge');
    if (badge) badge.innerHTML = getStatusBadgeHtml(item.status);

    document.getElementById('modal-qlda-subtitle').textContent = `Dự Án: ${item.du_an} | Hạng Mục: ${item.hang_muc}`;
    document.getElementById('modal-qlda-drawing').textContent = item.ten_ban_ve || '-';
    document.getElementById('modal-qlda-size').textContent = item.size || '-';
    document.getElementById('modal-qlda-tqty').textContent = `${item.tqty} pcs`;
    document.getElementById('modal-qlda-tweight').textContent = `${(item.tweight || 0).toLocaleString()} kg`;
    document.getElementById('modal-qlda-phangiao').textContent = `Tổ ${item.phan_giao}`;
    document.getElementById('modal-qlda-wo-date').textContent = item.ngay_giao_wo || '-';
    document.getElementById('modal-qlda-profile').textContent = `${item.profile || '-'} / ${item.dang_sp || '-'}`;
    document.getElementById('modal-qlda-uweight').textContent = `${(item.uweight || 0).toLocaleString()} kg`;

    const timelineContainer = document.getElementById('modal-qlda-timeline-container');
    if (timelineContainer) {
        const stages = [
            {
                name: '1. Gá Lắp (Fit-up)',
                data: item.ga_lap,
                color: 'blue',
                icon: 'wrench'
            },
            {
                name: '2. Hàn (Welding)',
                data: item.han,
                color: 'amber',
                icon: 'flame'
            },
            {
                name: '3. Tổ Hợp Thử (Trial Assembly)',
                data: item.to_hop_thu,
                color: 'purple',
                icon: 'puzzle',
                isOptional: true
            },
            {
                name: '4. Nghiệm Thu (QC Inspection)',
                data: item.nghiem_thu,
                color: 'teal',
                icon: 'check-square'
            },
            {
                name: '5. Bàn Giao (Handover / Delivery)',
                data: item.ban_giao,
                color: 'emerald',
                icon: 'truck'
            }
        ];

        let html = '';
        stages.forEach((st, idx) => {
            const d = st.data || {};
            const sl = d.sl || 0;
            const kl = d.kl || 0;
            const ngay = d.ngay || null;
            const isDone = item.tqty > 0 && sl >= item.tqty;
            const isPartial = sl > 0 && sl < item.tqty;

            let statusLabel = '';
            let borderClass = 'border-slate-200 bg-white';
            let iconBg = 'bg-slate-100 text-slate-400';

            if (st.isOptional && sl === 0 && !ngay) {
                statusLabel = '<span class="text-[10px] text-slate-400 italic">Không yêu cầu tổ hợp thử</span>';
            } else if (isDone) {
                statusLabel = '<span class="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold border border-emerald-200">Đã Hoàn Thành 100%</span>';
                borderClass = 'border-emerald-300 bg-emerald-50/40';
                iconBg = 'bg-emerald-600 text-white';
            } else if (isPartial) {
                statusLabel = '<span class="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-bold border border-amber-200">Đang thực hiện dở dang</span>';
                borderClass = 'border-amber-300 bg-amber-50/40';
                iconBg = 'bg-amber-500 text-white';
            } else {
                statusLabel = '<span class="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 font-medium">Chưa thực hiện</span>';
            }

            let extraDetails = '';
            if (idx === 4 && (d.don_vi_nhan || d.so_bien_ban)) {
                extraDetails = `
                    <div class="mt-2 pt-2 border-t border-emerald-200/60 flex flex-wrap gap-3 text-xs text-emerald-950 font-medium">
                        ${d.don_vi_nhan ? `<span>🏢 <b>Đơn vị nhận:</b> ${escapeHtml(d.don_vi_nhan)}</span>` : ''}
                        ${d.so_bien_ban ? `<span>📄 <b>Số biên bản:</b> ${escapeHtml(d.so_bien_ban)}</span>` : ''}
                    </div>
                `;
            }

            html += `
                <div class="p-3 rounded-2xl border ${borderClass} shadow-2xs flex items-start gap-3 transition">
                    <div class="w-8 h-8 rounded-xl ${iconBg} flex items-center justify-center flex-shrink-0 shadow-2xs">
                        <i data-lucide="${st.icon}" class="w-4 h-4"></i>
                    </div>
                    <div class="flex-1">
                        <div class="flex items-center justify-between flex-wrap gap-1">
                            <h4 class="font-bold text-slate-900 text-xs">${st.name}</h4>
                            ${statusLabel}
                        </div>
                        <div class="grid grid-cols-3 gap-2 mt-1.5 text-[11px] text-slate-600">
                            <div><b>Số lượng:</b> <span class="font-mono ${isDone ? 'text-emerald-700 font-bold' : ''}">${sl} / ${item.tqty} pcs</span></div>
                            <div><b>Khối lượng:</b> <span class="font-mono font-bold">${kl.toLocaleString()} kg</span></div>
                            <div><b>Ngày thực hiện:</b> <span class="font-mono text-slate-800 font-bold">${ngay || '-'}</span></div>
                        </div>
                        ${extraDetails}
                    </div>
                </div>
            `;
        });

        timelineContainer.innerHTML = html;
        if (window.lucide) lucide.createIcons();
    }

    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

function closeQldaAssemblyDetail() {
    const modal = document.getElementById('modal-qlda-detail');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
}

// Xuất file Excel tiến độ công đoạn đúng chuẩn form mẫu của người dùng
async function exportQldaToExcel() {
    const items = qldaState.filteredItems || [];
    if (items.length === 0) {
        alert("Không có cấu kiện nào phù hợp để xuất Excel.");
        return;
    }

    const btn = document.getElementById('btn-qlda-export-excel');
    const originalText = btn ? btn.innerHTML : '';
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i data-lucide="loader-2" class="w-3.5 h-3.5 animate-spin"></i> Đang xuất...';
        if (window.lucide) lucide.createIcons();
    }

    try {
        const projId = qldaState.currentProjectId || "QLDA";

        // 1. Nếu đang chạy trên Server Python: Gọi endpoint xuất file chuẩn openpyxl
        if (!state.isStaticMode && qldaState.currentProjectId) {
            try {
                const params = new URLSearchParams({
                    project_id: qldaState.currentProjectId,
                    hang_muc: qldaState.filterHangMuc,
                    phan_giao: qldaState.filterPhanGiao,
                    status: qldaState.filterStatus,
                    q: qldaState.searchQuery
                });
                const res = await fetch(`/api/qlda/export-excel?${params.toString()}`);
                if (res.ok) {
                    const blob = await res.blob();
                    const url = window.URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    const disposition = res.headers.get('Content-Disposition') || '';
                    let filename = `QLDA_${projId}_TienDoCongDoan.xlsx`;
                    if (disposition.includes('filename*=')) {
                        filename = decodeURIComponent(disposition.split("filename*=UTF-8''")[1] || filename);
                    } else if (disposition.includes('filename=')) {
                        filename = disposition.split('filename=')[1].replace(/"/g, '');
                    }
                    a.download = filename;
                    document.body.appendChild(a);
                    a.click();
                    a.remove();
                    window.URL.revokeObjectURL(url);
                    return;
                }
            } catch (errServer) {
                console.warn("Không tải được file từ server, chuyển sang xuất client-side SheetJS:", errServer);
            }
        }

        // 2. Fallback: Xuất bằng SheetJS trên Client-side (Đồng bộ cho bản Online GitHub Pages)
        if (typeof XLSX === 'undefined') {
            alert("Thư viện SheetJS chưa sẵn sàng, vui lòng thử lại sau vài giây.");
            return;
        }
        
        // Hàng 1: Tiêu đề gộp nhóm phân theo công đoạn (chuẩn xác 33 cột theo form mẫu)
        const row1 = [
            `DỰ ÁN:${projId}`, "", "", "", "", "", "", "", "", "", "", // 1..11: Thông tin cấu kiện
            "Gá lắp", "", "",         // 12..14: Gá lắp
            "Hàn", "", "",            // 15..17: Hàn
            "Tổ hợp thử", "", "",     // 18..20: Tổ hợp thử
            "Nghiệm thu", "", "",     // 21..23: Nghiệm thu
            "Bàn giao", "", "", "", "" // 24..28: Bàn giao
        ];

        // Hàng 2: Hàng Tổng Hợp Subtotal / Summary (theo form mẫu gốc)
        let totalQty = 0;
        let totalWeight = 0;
        let totalGaQty = 0, totalGaWeight = 0;
        let totalHanQty = 0, totalHanWeight = 0;
        let totalThQty = 0, totalThWeight = 0;
        let totalNtQty = 0, totalNtWeight = 0;
        let totalBgQty = 0, totalBgWeight = 0;

        items.forEach(it => {
            totalQty += (it.tqty || 0);
            totalWeight += (it.tweight || 0);
            totalGaQty += (it.ga_lap?.sl || 0);
            totalGaWeight += (it.ga_lap?.kl || 0);
            totalHanQty += (it.han?.sl || 0);
            totalHanWeight += (it.han?.kl || 0);
            totalThQty += (it.to_hop_thu?.sl || 0);
            totalThWeight += (it.to_hop_thu?.kl || 0);
            totalNtQty += (it.nghiem_thu?.sl || 0);
            totalNtWeight += (it.nghiem_thu?.kl || 0);
            totalBgQty += (it.ban_giao?.sl || 0);
            totalBgWeight += (it.ban_giao?.kl || 0);
        });

        const row2 = new Array(28).fill("");
        row2[0] = "Information ID";
        row2[2] = "Information Item";
        row2[5] = totalQty;
        row2[7] = Math.round(totalWeight * 10) / 10;
        row2[10] = new Date().toLocaleDateString('vi-VN');
        row2[12] = totalGaQty;
        row2[13] = Math.round(totalGaWeight * 10) / 10;
        row2[15] = totalHanQty;
        row2[16] = Math.round(totalHanWeight * 10) / 10;
        row2[18] = totalThQty;
        row2[19] = Math.round(totalThWeight * 10) / 10;
        row2[21] = totalNtQty;
        row2[22] = Math.round(totalNtWeight * 10) / 10;
        row2[24] = totalBgQty;
        row2[25] = Math.round(totalBgWeight * 10) / 10;
        row2[27] = `${projId}-`;

        // Hàng 3: Tên cột chuẩn mẫu theo file gốc (đã loại bỏ A, C, D, T..AI, AS, BB..end - đúng 33 cột)
        const row3 = [
            "Số Dự Án", "Hạng mục",
            "Tên bản vẽ", "Số chi tiết", "Size", "T'Qty", "U.Weight", "T.Weight", "Profile", "ID", "Note",
            "Ngày Gá", "SL Gá", "KL Gá",
            "Ngày Hàn", "SL Hàn", "KL Hàn",
            "Ngày TH", "SL TH", "KL TH",
            "Ngày NT", "SL NT", "KL NT",
            "Ngày BG", "SL BG", "KL BG", "Đơn vị nhận", "Số biên bản"
        ];

        // Hàng 4+: Dữ liệu cấu kiện đúng 33 cột
        const dataRows = items.map(it => [
            it.du_an || projId,
            it.hang_muc || "",
            it.ten_ban_ve || "",
            it.so_chi_tiet || "",
            it.size || "",
            it.tqty || 0,
            it.uweight || 0,
            it.tweight || 0,
            it.profile || "",
            it.id || "",
            it.note || "",
            it.ga_lap?.ngay || "",
            it.ga_lap?.sl || 0,
            it.ga_lap?.kl || 0,
            it.han?.ngay || "",
            it.han?.sl || 0,
            it.han?.kl || 0,
            it.to_hop_thu?.ngay || "",
            it.to_hop_thu?.sl || 0,
            it.to_hop_thu?.kl || 0,
            it.nghiem_thu?.ngay || "",
            it.nghiem_thu?.sl || 0,
            it.nghiem_thu?.kl || 0,
            it.ban_giao?.ngay || "",
            it.ban_giao?.sl || 0,
            it.ban_giao?.kl || 0,
            it.ban_giao?.don_vi_nhan || "",
            it.ban_giao?.so_bien_ban || ""
        ]);

        const ws = XLSX.utils.aoa_to_sheet([row1, row2, row3, ...dataRows]);

        // Cấu hình gộp ô cho dòng 1
        ws['!merges'] = [
            { s: { r: 0, c: 0 }, e: { r: 0, c: 10 } },  // A1:K1 - Thông tin cấu kiện
            { s: { r: 0, c: 11 }, e: { r: 0, c: 13 } }, // L1:N1 - Gá lắp
            { s: { r: 0, c: 14 }, e: { r: 0, c: 16 } }, // O1:Q1 - Hàn
            { s: { r: 0, c: 17 }, e: { r: 0, c: 19 } }, // R1:T1 - Tổ hợp thử
            { s: { r: 0, c: 20 }, e: { r: 0, c: 22 } }, // U1:W1 - Nghiệm thu
            { s: { r: 0, c: 23 }, e: { r: 0, c: 27 } }  // X1:AB1 - Bàn giao
        ];

        const endRow = 3 + dataRows.length;
        ws['!autofilter'] = { ref: `A3:AB${endRow}` };
        ws['!freeze'] = { ySplit: 3 };

        // Áp dụng định dạng bảng, màu sắc công đoạn, viền kẻ bảng và bộ lọc chuyên nghiệp
        const borderThin = {
            top: { style: 'thin', color: { rgb: 'CBD5E1' } },
            bottom: { style: 'thin', color: { rgb: 'CBD5E1' } },
            left: { style: 'thin', color: { rgb: 'CBD5E1' } },
            right: { style: 'thin', color: { rgb: 'CBD5E1' } }
        };
        const borderSubtotal = {
            top: { style: 'thin', color: { rgb: '94A3B8' } },
            bottom: { style: 'thin', color: { rgb: '94A3B8' } },
            left: { style: 'thin', color: { rgb: 'CBD5E1' } },
            right: { style: 'thin', color: { rgb: 'CBD5E1' } }
        };

        // Hàng 1: Phân nhóm 5 công đoạn với màu sắc nhận diện chuẩn form mẫu gốc
        const groupsDef = [
            { start: 0, end: 10, fill: '2D3748', color: 'FFFFFF' }, // Thông tin cấu kiện
            { start: 11, end: 13, fill: 'BEE3F8', color: '2B6CB0' }, // Gá lắp
            { start: 14, end: 16, fill: 'FEEBC8', color: 'C05621' }, // Hàn
            { start: 17, end: 19, fill: 'E9D8FD', color: '6B46C1' }, // Tổ hợp thử
            { start: 20, end: 22, fill: 'C6F6D5', color: '22543D' }, // Nghiệm thu
            { start: 23, end: 27, fill: 'B2F5EA', color: '234E52' }  // Bàn giao
        ];

        groupsDef.forEach(g => {
            for (let c = g.start; c <= g.end; c++) {
                const addr = XLSX.utils.encode_cell({ r: 0, c });
                if (!ws[addr]) ws[addr] = { t: 's', v: '' };
                ws[addr].s = {
                    fill: { fgColor: { rgb: g.fill } },
                    font: { name: 'Arial', sz: 11, bold: true, color: { rgb: g.color } },
                    alignment: { horizontal: 'center', vertical: 'center' },
                    border: borderThin
                };
            }
        });

        // Hàng 2: Hàng Tổng Hợp Subtotal
        for (let c = 0; c < 28; c++) {
            const addr = XLSX.utils.encode_cell({ r: 1, c });
            if (!ws[addr]) ws[addr] = { t: 's', v: '' };
            const isNum = typeof ws[addr].v === 'number';
            const isWeight = [7, 13, 16, 19, 22, 25].includes(c);
            ws[addr].s = {
                fill: { fgColor: { rgb: 'EDF2F7' } },
                font: { name: 'Arial', sz: 10, bold: true, color: { rgb: '1A202C' } },
                alignment: { horizontal: isNum ? 'right' : 'center', vertical: 'center' },
                border: borderSubtotal,
                numFmt: isWeight ? '#,##0.0' : (isNum ? '#,##0' : undefined)
            };
        }

        // Hàng 3: Tiêu đề cột
        for (let c = 0; c < 28; c++) {
            const addr = XLSX.utils.encode_cell({ r: 2, c });
            if (!ws[addr]) ws[addr] = { t: 's', v: '' };
            ws[addr].s = {
                fill: { fgColor: { rgb: 'E2E8F0' } },
                font: { name: 'Arial', sz: 10, bold: true, color: { rgb: '1E293B' } },
                alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
                border: borderThin
            };
        }

        // Hàng 4+: Dữ liệu chi tiết từng cấu kiện (Kẻ viền, định dạng số, xen kẽ màu)
        for (let r = 3; r < 3 + dataRows.length; r++) {
            const rowIdx = r - 3;
            const isEven = (rowIdx % 2 === 0);
            const rowBg = isEven ? 'FFFFFF' : 'F8FAFC';

            for (let c = 0; c < 28; c++) {
                const addr = XLSX.utils.encode_cell({ r, c });
                if (!ws[addr]) ws[addr] = { t: 's', v: '' };

                const isNum = typeof ws[addr].v === 'number';
                const isWeight = [6, 7, 13, 16, 19, 22, 25].includes(c);
                const isCenter = [0, 1, 2, 9, 11, 14, 17, 20, 23].includes(c);

                ws[addr].s = {
                    fill: { fgColor: { rgb: rowBg } },
                    font: { name: 'Arial', sz: 10, color: { rgb: '1E293B' } },
                    alignment: { 
                        horizontal: isNum ? 'right' : (isCenter ? 'center' : 'left'), 
                        vertical: 'center' 
                    },
                    border: borderThin,
                    numFmt: isWeight ? '#,##0.0' : (isNum ? '#,##0' : undefined)
                };
            }
        }

        // Đặt chiều cao dòng chuẩn
        ws['!rows'] = [
            { hpt: 26 }, // Hàng 1
            { hpt: 22 }, // Hàng 2
            { hpt: 26 }, // Hàng 3
            ...dataRows.map(() => ({ hpt: 20 }))
        ];

        // Độ rộng 28 cột (đã bỏ C->G: MH, Ngày giao WO, Dạng SP, Phân loại, Phân giao)
        ws['!cols'] = [
            { wch: 12 }, { wch: 22 },
            { wch: 24 }, { wch: 16 }, { wch: 16 }, { wch: 10 }, { wch: 12 },
            { wch: 14 }, { wch: 22 }, { wch: 10 }, { wch: 16 },
            { wch: 14 }, { wch: 10 }, { wch: 12 },
            { wch: 14 }, { wch: 10 }, { wch: 12 },
            { wch: 14 }, { wch: 10 }, { wch: 12 },
            { wch: 14 }, { wch: 10 }, { wch: 12 },
            { wch: 14 }, { wch: 10 }, { wch: 12 }, { wch: 18 }, { wch: 18 }
        ];

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Progress");

        const hmSuffix = qldaState.filterHangMuc !== 'all' ? `_${qldaState.filterHangMuc}` : '';
        const fileName = `QLDA_${projId}${hmSuffix}_TienDoCongDoan.xlsx`;
        XLSX.writeFile(wb, fileName);
    } catch (err) {
        console.error("Lỗi xuất Excel QLDA:", err);
        alert(`Lỗi xuất Excel: ${err.message}`);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = originalText;
            if (window.lucide) lucide.createIcons();
        }
    }
}

// Đăng ký sự kiện tương tác của QLDA
function setupQldaEventListeners() {
    // 1. Thay đổi dự án
    const selectProject = document.getElementById('select-qlda-project');
    if (selectProject) {
        selectProject.addEventListener('change', (e) => {
            if (e.target.value) {
                loadQldaProject(e.target.value);
            }
        });
    }

    // 2. Lọc Hạng Mục
    const selectHangMuc = document.getElementById('select-qlda-hangmuc');
    if (selectHangMuc) {
        selectHangMuc.addEventListener('change', (e) => {
            qldaState.filterHangMuc = e.target.value;
            filterQldaItems();
        });
    }

    // 3. Lọc Tổ Phân Giao
    const selectPhanGiao = document.getElementById('select-qlda-phangiao');
    if (selectPhanGiao) {
        selectPhanGiao.addEventListener('change', (e) => {
            qldaState.filterPhanGiao = e.target.value;
            filterQldaItems();
        });
    }

    // 4. Lọc Trạng Thái
    const selectStatus = document.getElementById('select-qlda-status');
    if (selectStatus) {
        selectStatus.addEventListener('change', (e) => {
            qldaState.filterStatus = e.target.value;
            filterQldaItems();
        });
    }

    // 5. Sắp Xếp Dữ Liệu từ Dropdown
    const selectSort = document.getElementById('select-qlda-sort');
    if (selectSort) {
        selectSort.addEventListener('change', (e) => {
            qldaState.sortBy = e.target.value;
            qldaState.sortCol = null; // Xóa sắp xếp theo cột khi chọn dropdown
            filterQldaItems();
        });
    }

    // 6. Bấm tiêu đề cột để sắp xếp trực tiếp (Sortable table headers)
    document.querySelectorAll('th[data-qlda-sort]').forEach(th => {
        th.addEventListener('click', () => {
            const col = th.dataset.qldaSort;
            if (!col) return;
            if (qldaState.sortCol === col) {
                // Đảo chiều sắp xếp
                qldaState.sortDir = qldaState.sortDir === 'asc' ? 'desc' : 'asc';
            } else {
                qldaState.sortCol = col;
                // Mặc định giảm dần cho số lượng và khối lượng, tăng dần cho chữ
                const descFirstCols = ['tweight', 'tqty', 'uweight', 'ga_lap', 'han', 'to_hop_thu', 'nghiem_thu', 'ban_giao'];
                qldaState.sortDir = descFirstCols.includes(col) ? 'desc' : 'asc';
            }
            filterQldaItems();
        });
    });

    // 7. Tìm kiếm với Debounce 250ms
    let qldaSearchTimeout = null;
    const inputSearch = document.getElementById('input-qlda-search');
    if (inputSearch) {
        inputSearch.addEventListener('input', (e) => {
            clearTimeout(qldaSearchTimeout);
            const val = e.target.value;
            qldaSearchTimeout = setTimeout(() => {
                qldaState.searchQuery = val.trim();
                filterQldaItems();
            }, 250);
        });
    }

    // 8. Nút Đặt lại bộ lọc QLDA
    const btnResetFilter = document.getElementById('btn-qlda-reset-filter');
    if (btnResetFilter) {
        btnResetFilter.addEventListener('click', () => {
            qldaState.filterHangMuc = 'all';
            qldaState.filterPhanGiao = 'all';
            qldaState.filterStatus = 'all';
            qldaState.searchQuery = '';
            qldaState.sortBy = 'stt_asc';
            qldaState.sortCol = null;
            qldaState.sortDir = 'asc';
            
            const hm = document.getElementById('select-qlda-hangmuc');
            if (hm) hm.value = 'all';
            const pg = document.getElementById('select-qlda-phangiao');
            if (pg) pg.value = 'all';
            const st = document.getElementById('select-qlda-status');
            if (st) st.value = 'all';
            const so = document.getElementById('select-qlda-sort');
            if (so) so.value = 'stt_asc';
            const sq = document.getElementById('input-qlda-search');
            if (sq) sq.value = '';

            filterQldaItems();
        });
    }

    // 9. Nút Xuất Excel
    const btnExportExcel = document.getElementById('btn-qlda-export-excel');
    if (btnExportExcel) {
        btnExportExcel.addEventListener('click', exportQldaToExcel);
    }

    // 10. Tải lên file QLDA Excel (Host Admin)
    const btnUploadQlda = document.getElementById('btn-upload-qlda-excel');
    const inputUploadQlda = document.getElementById('excel-qlda-input');
    if (btnUploadQlda && inputUploadQlda) {
        btnUploadQlda.addEventListener('click', () => inputUploadQlda.click());
        inputUploadQlda.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const originalText = btnUploadQlda.innerHTML;
            btnUploadQlda.disabled = true;
            btnUploadQlda.innerHTML = '<span>⏳ Đang tải file...</span>';

            try {
                const formData = new FormData();
                formData.append('file', file);
                const res = await fetch('/api/upload-qlda-excel', {
                    method: 'POST',
                    body: formData
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.detail || 'Tải file thất bại');
                alert(`Thành công: ${data.message}`);
                await loadQldaProjectsList();
            } catch (err) {
                console.error(err);
                alert(`Lỗi tải file QLDA: ${err.message}`);
            } finally {
                btnUploadQlda.disabled = false;
                btnUploadQlda.innerHTML = originalText;
                inputUploadQlda.value = '';
                if (window.lucide) lucide.createIcons();
            }
        });
    }

    // 11. Phân trang: Trang trước / Trang sau (Cả trên đỉnh và dưới đáy bảng)
    function qldaGoPrev(scrollToTop = false) {
        if (qldaState.currentPage > 1) {
            qldaState.currentPage--;
            renderQldaTable();
            if (scrollToTop) {
                const matrixEl = document.getElementById('qlda-assemblies-tbody');
                if (matrixEl) matrixEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        }
    }

    function qldaGoNext(scrollToTop = false) {
        const totalPages = Math.ceil((qldaState.filteredItems || []).length / qldaState.pageSize);
        if (qldaState.currentPage < totalPages) {
            qldaState.currentPage++;
            renderQldaTable();
            if (scrollToTop) {
                const matrixEl = document.getElementById('qlda-assemblies-tbody');
                if (matrixEl) matrixEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        }
    }

    const btnPrevPage = document.getElementById('btn-qlda-prev-page');
    if (btnPrevPage) btnPrevPage.addEventListener('click', () => qldaGoPrev(false));

    const btnPrevPageBottom = document.getElementById('btn-qlda-prev-page-bottom');
    if (btnPrevPageBottom) btnPrevPageBottom.addEventListener('click', () => qldaGoPrev(true));

    const btnNextPage = document.getElementById('btn-qlda-next-page');
    if (btnNextPage) btnNextPage.addEventListener('click', () => qldaGoNext(false));

    const btnNextPageBottom = document.getElementById('btn-qlda-next-page-bottom');
    if (btnNextPageBottom) btnNextPageBottom.addEventListener('click', () => qldaGoNext(true));

    // 12. Kích thước trang (Page Size)
    const selectPageSize = document.getElementById('select-qlda-page-size');
    if (selectPageSize) {
        selectPageSize.addEventListener('change', (e) => {
            qldaState.pageSize = parseInt(e.target.value, 10) || 50;
            qldaState.currentPage = 1;
            renderQldaTable();
        });
    }

    // 13. Đóng Modal chi tiết cấu kiện
    const btnCloseModal = document.getElementById('btn-close-qlda-modal');
    if (btnCloseModal) btnCloseModal.addEventListener('click', closeQldaAssemblyDetail);

    const btnCloseBottom = document.getElementById('btn-close-qlda-bottom');
    if (btnCloseBottom) btnCloseBottom.addEventListener('click', closeQldaAssemblyDetail);

    const modal = document.getElementById('modal-qlda-detail');
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeQldaAssemblyDetail();
        });
    }

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeQldaAssemblyDetail();
        }
    });

    // 14. Sự kiện chuyển Sub-tab giữa Ma Trận Tiến Độ Chi Tiết và Biểu Đồ Tiến Độ Công Đoạn
    const btnSubMatrix = document.getElementById('btn-qlda-subtab-matrix');
    if (btnSubMatrix) {
        btnSubMatrix.addEventListener('click', () => window.switchQldaSubtab('matrix'));
    }
    const btnSubCharts = document.getElementById('btn-qlda-subtab-charts');
    if (btnSubCharts) {
        btnSubCharts.addEventListener('click', () => window.switchQldaSubtab('charts'));
    }
}

// =========================================================================
// TAB 5: DASHBOARD PHÂN TÍCH TIẾN ĐỘ CHẾ TẠO (LINE CHART, BTP, GANTT)
// =========================================================================

const dashboardState = {
    isInitialized: false,
    isLoading: false,
    projects: [],
    currentProjectId: null,
    currentProjectData: null,
    bomData: null,
    selectedMonth: 'all',
    selectedHangMuc: 'all',
    selectedPhanGiao: 'all',
    chartMode: 'scurve', // 'scurve' | 'daily'
    targetTons: 50,
    lineChartInstance: null,
    btpDoughnutInstance: null,
    btpBarInstance: null,
    isDayTableOpen: false,
    ganttSearchQuery: '',
    ganttFilterStage: 'all',
    btpSearchQuery: ''
};

// Khởi tạo hoặc vẽ lại Dashboard
async function initOrRenderDashboard() {
    if (!dashboardState.isInitialized) {
        setupDashboardEventListeners();
        dashboardState.isInitialized = true;
    }

    const projSelect = document.getElementById('dash-select-project');
    if (projSelect && projSelect.options.length === 0) {
        await populateDashboardProjectCatalog();
    }

    let targetProj = dashboardState.currentProjectId || qldaState.currentProjectId || state.currentProject || 'A320';
    if (projSelect && projSelect.options.length > 0) {
        let found = false;
        for (let opt of projSelect.options) {
            if (opt.value === targetProj) {
                found = true;
                break;
            }
        }
        if (!found) targetProj = projSelect.options[0].value;
        projSelect.value = targetProj;
    }

    if (targetProj && targetProj !== dashboardState.currentProjectId) {
        await loadDashboardProject(targetProj);
    } else if (dashboardState.currentProjectData) {
        renderDashboardAll();
    }
}

// Nạp danh mục dự án QLDA cho Dashboard
async function populateDashboardProjectCatalog() {
    const projSelect = document.getElementById('dash-select-project');
    if (!projSelect) return;

    try {
        let list = [];
        if (state.isStaticMode) {
            const resp = await fetch('data/qlda_projects.json');
            if (resp.ok) {
                const catalog = await resp.json();
                list = catalog.projects || [];
            }
        } else {
            try {
                const resp = await fetch('/api/qlda/projects');
                if (resp.ok) {
                    const catalog = await resp.json();
                    list = catalog.projects || [];
                }
            } catch (e) {}
            if (list.length === 0) {
                const resp = await fetch('data/qlda_projects.json');
                if (resp.ok) {
                    const catalog = await resp.json();
                    list = catalog.projects || [];
                }
            }
        }

        dashboardState.projects = list;
        projSelect.innerHTML = '';
        list.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p.project_id;
            opt.textContent = `${p.project_id} (${p.total_tons || 0} tấn - ${p.total_items || 0} CK)`;
            projSelect.appendChild(opt);
        });
    } catch (err) {
        console.error("Lỗi nạp danh mục dự án cho Dashboard:", err);
    }
}

// Tải dữ liệu dự án cho Dashboard
async function loadDashboardProject(projectId) {
    if (!projectId) return;
    dashboardState.isLoading = true;
    dashboardState.currentProjectId = projectId;

    const badge = document.getElementById('dash-project-badge');
    if (badge) badge.textContent = `Dự Án: ${projectId}`;

    try {
        // 1. Nạp dữ liệu QLDA (ưu tiên từ bộ nhớ cache)
        let data = _qldaDataCache[projectId];
        if (!data) {
            if (state.isStaticMode) {
                const resp = await fetch(`data_qlda/${projectId}.json`);
                if (!resp.ok) throw new Error(`Không tìm thấy data_qlda/${projectId}.json`);
                data = await resp.json();
            } else {
                try {
                    const resp = await fetch(`/api/qlda/project-data?project_id=${encodeURIComponent(projectId)}`);
                    if (resp.ok) data = await resp.json();
                } catch (e) {}
                if (!data) {
                    const resp = await fetch(`data_qlda/${projectId}.json`);
                    if (resp.ok) data = await resp.json();
                }
            }
            if (data) _qldaDataCache[projectId] = data;
        }

        dashboardState.currentProjectData = data;

        // 2. Nạp thêm dữ liệu BOM tương ứng nếu có để đối chiếu BTP
        let bom = null;
        try {
            const bomNames = [`${projectId}PL.json`, `${projectId}.json`];
            for (let bName of bomNames) {
                const resp = await fetch(`data/${bName}`);
                if (resp.ok) {
                    bom = await resp.json();
                    break;
                }
            }
        } catch (e) {}
        dashboardState.bomData = bom;

        populateDashboardDropdowns();
        renderDashboardAll();
    } catch (err) {
        console.error(`Lỗi tải dữ liệu Dashboard cho dự án ${projectId}:`, err);
    } finally {
        dashboardState.isLoading = false;
    }
}

// Nạp danh sách các Tháng có sản lượng vào bộ lọc biểu đồ Line
function populateDashboardMonths(items) {
    const monthSelect = document.getElementById('dash-select-month');
    if (!monthSelect) return;

    const list = items || (dashboardState.currentProjectData ? dashboardState.currentProjectData.items : []) || [];
    const monthSet = new Set();
    list.forEach(it => {
        ['ga_lap', 'han', 'to_hop_thu', 'nghiem_thu', 'ban_giao'].forEach(stg => {
            const dStr = it[stg]?.ngay;
            if (dStr) {
                const parts = dStr.split('/');
                if (parts.length === 3) monthSet.add(`${parts[1]}/${parts[2]}`);
            }
        });
        if (it.ngay_giao_wo) {
            const parts = it.ngay_giao_wo.split('/');
            if (parts.length === 3) monthSet.add(`${parts[1]}/${parts[2]}`);
        }
    });

    const sortedMonths = Array.from(monthSet).sort((a, b) => {
        const [mA, yA] = a.split('/').map(Number);
        const [mB, yB] = b.split('/').map(Number);
        return (yA * 100 + mA) - (yB * 100 + mB);
    });

    monthSelect.innerHTML = '';
    const optAll = document.createElement('option');
    optAll.value = 'all';
    optAll.textContent = '📅 Toàn bộ các tháng dự án';
    monthSelect.appendChild(optAll);

    sortedMonths.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m;
        opt.textContent = `📅 Tháng ${m}`;
        monthSelect.appendChild(opt);
    });

    if (dashboardState.selectedMonth && (dashboardState.selectedMonth === 'all' || sortedMonths.includes(dashboardState.selectedMonth))) {
        monthSelect.value = dashboardState.selectedMonth;
    } else if (sortedMonths.length > 0) {
        dashboardState.selectedMonth = sortedMonths[sortedMonths.length - 1];
        monthSelect.value = dashboardState.selectedMonth;
    } else {
        dashboardState.selectedMonth = 'all';
        monthSelect.value = 'all';
    }
}
function populateDashboardDropdowns() {
    populateDashboardMonths(dashboardState.currentProjectData?.items || []);
}

// Vẽ toàn bộ các thành phần của Dashboard (Nhảy tự động theo hạng mục & danh sách cấu kiện đã lọc)
function renderDashboardAll(customItems = null) {
    const data = qldaState.currentProjectData || dashboardState.currentProjectData;
    if (!data) return;

    const items = customItems !== null ? customItems : (qldaState.filteredItems || data.items || []);
    renderDashboardKPIsAndLineChart(items);
    renderDashboardBtpSection(items);
    renderDashboardGantt(items);
}

// PHẦN 1: TÍNH TOÁN KPI & VẼ BIỂU ĐỒ LINE SO SÁNH THỰC TẾ / KẾ HOẠCH GÁ & HÀN THEO NGÀY
function renderDashboardKPIsAndLineChart(customItems = null) {
    const data = qldaState.currentProjectData || dashboardState.currentProjectData;
    if (!data) return;

    let items = customItems !== null ? customItems : (qldaState.filteredItems || data.items || []);
    const selMonth = dashboardState.selectedMonth || 'all';

    // Cập nhật nhãn dự án trên khung Biểu Đồ
    const curPid = qldaState.currentProjectId || dashboardState.currentProjectId;
    if (curPid) {
        const dashBadge = document.getElementById('dash-project-badge');
        if (dashBadge) dashBadge.textContent = `Dự Án: ${curPid}`;
    }

    // Cập nhật tiêu đề tháng trên biểu đồ
    const monthTitleEl = document.getElementById('dash-chart-month-title');
    if (monthTitleEl) {
        monthTitleEl.textContent = selMonth === 'all' ? 'Toàn Dự Án' : `Tháng ${selMonth}`;
    }

    // 2. Xác định các ngày trong tháng (hoặc tất cả các ngày ghi nhận nếu chọn 'all')
    let dayLabels = [];
    let daysCount = 31;
    let targetMonthNum = 0;
    let targetYearNum = 0;

    if (selMonth !== 'all' && selMonth.includes('/')) {
        const [mStr, yStr] = selMonth.split('/');
        targetMonthNum = parseInt(mStr, 10);
        targetYearNum = parseInt(yStr, 10);
        daysCount = new Date(targetYearNum, targetMonthNum, 0).getDate();
        for (let d = 1; d <= daysCount; d++) {
            const dStr = d < 10 ? `0${d}` : `${d}`;
            dayLabels.push(`${dStr}/${mStr}`);
        }
    } else {
        // Lấy tất cả các ngày phát sinh trong dự án
        const allDates = new Set();
        items.forEach(it => {
            ['ga_lap', 'han', 'nghiem_thu', 'ban_giao'].forEach(stg => {
                if (it[stg]?.ngay) allDates.add(it[stg].ngay.substring(0, 5));
            });
        });
        dayLabels = Array.from(allDates).sort((a, b) => {
            const [dA, mA] = a.split('/').map(Number);
            const [dB, mB] = b.split('/').map(Number);
            return (mA * 100 + dA) - (mB * 100 + dB);
        });
        if (dayLabels.length === 0) {
            dayLabels = ['01', '05', '10', '15', '20', '25', '30'];
        }
    }

    // 3. Gom sản lượng thực tế Gá và Hàn theo từng ngày
    const dailyGaActual = new Array(dayLabels.length).fill(0);
    const dailyHanActual = new Array(dayLabels.length).fill(0);
    const dailyNtActual = new Array(dayLabels.length).fill(0);
    const dailyBgActual = new Array(dayLabels.length).fill(0);

    let totalMonthGaTons = 0;
    let totalMonthHanTons = 0;
    let totalMonthNtTons = 0;
    let totalMonthBgTons = 0;
    let totalMonthGaPcs = 0;
    let totalMonthHanPcs = 0;

    items.forEach(it => {
        // Gá lắp
        if (it.ga_lap?.ngay) {
            const matchMonth = selMonth === 'all' || it.ga_lap.ngay.includes(selMonth);
            if (matchMonth) {
                const dayTag = it.ga_lap.ngay.substring(0, 5);
                const idx = dayLabels.indexOf(dayTag);
                const tons = (it.ga_lap.kl || 0) / 1000;
                if (idx >= 0) dailyGaActual[idx] += tons;
                totalMonthGaTons += tons;
                totalMonthGaPcs += (it.ga_lap.sl || 0);
            }
        }
        // Hàn
        if (it.han?.ngay) {
            const matchMonth = selMonth === 'all' || it.han.ngay.includes(selMonth);
            if (matchMonth) {
                const dayTag = it.han.ngay.substring(0, 5);
                const idx = dayLabels.indexOf(dayTag);
                const tons = (it.han.kl || 0) / 1000;
                if (idx >= 0) dailyHanActual[idx] += tons;
                totalMonthHanTons += tons;
                totalMonthHanPcs += (it.han.sl || 0);
            }
        }
        // Nghiệm thu
        if (it.nghiem_thu?.ngay) {
            const matchMonth = selMonth === 'all' || it.nghiem_thu.ngay.includes(selMonth);
            if (matchMonth) {
                const dayTag = it.nghiem_thu.ngay.substring(0, 5);
                const idx = dayLabels.indexOf(dayTag);
                const tons = (it.nghiem_thu.kl || 0) / 1000;
                if (idx >= 0) dailyNtActual[idx] += tons;
                totalMonthNtTons += tons;
            }
        }
        // Bàn giao
        if (it.ban_giao?.ngay) {
            const matchMonth = selMonth === 'all' || it.ban_giao.ngay.includes(selMonth);
            if (matchMonth) {
                const dayTag = it.ban_giao.ngay.substring(0, 5);
                const idx = dayLabels.indexOf(dayTag);
                const tons = (it.ban_giao.kl || 0) / 1000;
                if (idx >= 0) dailyBgActual[idx] += tons;
                totalMonthBgTons += tons;
            }
        }
    });

    totalMonthGaTons = Math.round(totalMonthGaTons * 100) / 100;
    totalMonthHanTons = Math.round(totalMonthHanTons * 100) / 100;
    totalMonthNtTons = Math.round(totalMonthNtTons * 100) / 100;
    totalMonthBgTons = Math.round(totalMonthBgTons * 100) / 100;

    // 4. Tính toán Kế Hoạch Phân Bổ (Plan Target)
    // Nếu người dùng không nhập mục tiêu riêng, tự động lấy mục tiêu = Max(Sản lượng thực tế, 50 tấn)
    let planTargetTons = dashboardState.targetTons || 50;
    if (planTargetTons <= 0) planTargetTons = Math.max(totalMonthGaTons, totalMonthHanTons, 30);

    const inputTarget = document.getElementById('dash-input-target-tons');
    if (inputTarget && !document.activeElement.isSameNode(inputTarget)) {
        inputTarget.value = Math.round(planTargetTons);
    }

    const workingDays = Math.max(1, Math.min(26, dayLabels.length));
    const dailyPlanRate = planTargetTons / workingDays;

    // Tính đường kế hoạch và lũy kế
    let cumGaActual = [];
    let cumHanActual = [];
    let cumPlanGa = [];
    let cumPlanHan = [];
    let dailyPlanGa = [];
    let dailyPlanHan = [];

    let runGa = 0, runHan = 0, runPlan = 0;

    for (let i = 0; i < dayLabels.length; i++) {
        runGa += dailyGaActual[i];
        runHan += dailyHanActual[i];

        cumGaActual.push(Math.round(runGa * 100) / 100);
        cumHanActual.push(Math.round(runHan * 100) / 100);

        // Kế hoạch phân bổ (Dạng S-curve hoặc tuyến tính dốc theo ngày)
        const progressFrac = (i + 1) / dayLabels.length;
        // Đường cong S-Curve mượt mà: f(x) = x^1.3
        const sFactor = Math.pow(progressFrac, 1.25);
        const planVal = Math.round(planTargetTons * sFactor * 100) / 100;

        cumPlanGa.push(planVal);
        cumPlanHan.push(Math.round(planVal * 0.95 * 100) / 100); // Hàn sau gá khoảng 5%

        dailyPlanGa.push(Math.round(dailyPlanRate * 100) / 100);
        dailyPlanHan.push(Math.round(dailyPlanRate * 100) / 100);
    }

    // 5. Cập Nhật 4 Thẻ KPI Trên Cùng
    const gaRate = planTargetTons > 0 ? Math.round((totalMonthGaTons / planTargetTons) * 100) : 0;
    const hanRate = planTargetTons > 0 ? Math.round((totalMonthHanTons / planTargetTons) * 100) : 0;

    const elGaActual = document.getElementById('dash-kpi-ga-actual');
    if (elGaActual) elGaActual.textContent = totalMonthGaTons.toLocaleString();
    const elGaPlan = document.getElementById('dash-kpi-ga-plan');
    if (elGaPlan) elGaPlan.textContent = `${planTargetTons} Tấn`;
    const elGaPcs = document.getElementById('dash-kpi-ga-pcs');
    if (elGaPcs) elGaPcs.textContent = `${totalMonthGaPcs} pcs`;
    const elGaRate = document.getElementById('dash-kpi-ga-rate');
    if (elGaRate) elGaRate.textContent = `${gaRate}% KH`;
    const elGaBar = document.getElementById('dash-kpi-ga-bar');
    if (elGaBar) elGaBar.style.width = `${Math.min(100, gaRate)}%`;

    const elHanActual = document.getElementById('dash-kpi-han-actual');
    if (elHanActual) elHanActual.textContent = totalMonthHanTons.toLocaleString();
    const elHanPlan = document.getElementById('dash-kpi-han-plan');
    if (elHanPlan) elHanPlan.textContent = `${planTargetTons} Tấn`;
    const elHanPcs = document.getElementById('dash-kpi-han-pcs');
    if (elHanPcs) elHanPcs.textContent = `${totalMonthHanPcs} pcs`;
    const elHanRate = document.getElementById('dash-kpi-han-rate');
    if (elHanRate) elHanRate.textContent = `${hanRate}% KH`;
    const elHanBar = document.getElementById('dash-kpi-han-bar');
    if (elHanBar) elHanBar.style.width = `${Math.min(100, hanRate)}%`;

    const elBgActual = document.getElementById('dash-kpi-bg-actual');
    if (elBgActual) elBgActual.textContent = totalMonthBgTons.toLocaleString();
    const elNtTons = document.getElementById('dash-kpi-nt-tons');
    if (elNtTons) elNtTons.textContent = `${totalMonthNtTons} Tấn`;

    // Tìm hạn giao hàng WO gần nhất
    let nearestWo = '--/--/----';
    const woDates = items.map(it => it.ngay_giao_wo).filter(Boolean);
    if (woDates.length > 0) nearestWo = woDates[0];
    const elWoDate = document.getElementById('dash-kpi-wo-date');
    if (elWoDate) elWoDate.textContent = nearestWo;

    const totalFilteredWeightKg = items.reduce((sum, it) => sum + (it.tweight || 0), 0);
    const bgRateTotal = totalFilteredWeightKg > 0 ? Math.round((totalMonthBgTons * 1000 / totalFilteredWeightKg) * 100) : (data.kpis?.ban_giao?.rate || 0);
    const elBgRate = document.getElementById('dash-kpi-bg-rate');
    if (elBgRate) elBgRate.textContent = `${bgRateTotal}% Bàn Giao`;
    const elBgBar = document.getElementById('dash-kpi-bg-bar');
    if (elBgBar) elBgBar.style.width = `${Math.min(100, bgRateTotal)}%`;

    // 6. Vẽ Biểu Đồ Line Bằng Chart.js
    const canvas = document.getElementById('dash-line-chart');
    if (canvas) {
        const isScurve = dashboardState.chartMode === 'scurve';

        const datasetGaActual = {
            label: isScurve ? 'Lũy Kế Gá Lắp (Tấn)' : 'Gá Lắp Hàng Ngày (Tấn)',
            data: isScurve ? cumGaActual : dailyGaActual.map(v => Math.round(v * 100) / 100),
            borderColor: '#2563eb',
            backgroundColor: 'rgba(37, 99, 235, 0.08)',
            borderWidth: 2.5,
            fill: isScurve,
            tension: 0.3,
            pointRadius: isScurve ? 2 : 4,
            pointHoverRadius: 6,
            pointBackgroundColor: '#2563eb'
        };

        const datasetGaPlan = {
            label: isScurve ? 'Kế Hoạch Gá Lắp (Tấn)' : 'Kế Hoạch Gá Phân Bổ (Tấn/ngày)',
            data: isScurve ? cumPlanGa : dailyPlanGa,
            borderColor: '#93c5fd',
            borderWidth: 2,
            borderDash: [5, 4],
            fill: false,
            tension: 0.2,
            pointRadius: 0,
            pointHoverRadius: 4
        };

        const datasetHanActual = {
            label: isScurve ? 'Lũy Kế Hàn (Tấn)' : 'Hàn Hàng Ngày (Tấn)',
            data: isScurve ? cumHanActual : dailyHanActual.map(v => Math.round(v * 100) / 100),
            borderColor: '#d97706',
            backgroundColor: 'rgba(217, 119, 6, 0.08)',
            borderWidth: 2.5,
            fill: isScurve,
            tension: 0.3,
            pointRadius: isScurve ? 2 : 4,
            pointHoverRadius: 6,
            pointBackgroundColor: '#d97706'
        };

        const datasetHanPlan = {
            label: isScurve ? 'Kế Hoạch Hàn (Tấn)' : 'Kế Hoạch Hàn Phân Bổ (Tấn/ngày)',
            data: isScurve ? cumPlanHan : dailyPlanHan,
            borderColor: '#fcd34d',
            borderWidth: 2,
            borderDash: [5, 4],
            fill: false,
            tension: 0.2,
            pointRadius: 0,
            pointHoverRadius: 4
        };

        if (dashboardState.lineChartInstance) {
            dashboardState.lineChartInstance.destroy();
        }

        dashboardState.lineChartInstance = new Chart(canvas, {
            type: 'line',
            data: {
                labels: dayLabels,
                datasets: [datasetGaActual, datasetGaPlan, datasetHanActual, datasetHanPlan]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    mode: 'index',
                    intersect: false
                },
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        backgroundColor: 'rgba(15, 23, 42, 0.92)',
                        titleColor: '#fff',
                        bodyColor: '#cbd5e1',
                        padding: 10,
                        cornerRadius: 10,
                        callbacks: {
                            label: function(context) {
                                return ` ${context.dataset.label}: ${context.parsed.y.toLocaleString()} Tấn`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        grid: {
                            display: false
                        },
                        ticks: {
                            font: { size: 10, weight: 'bold' },
                            color: '#64748b'
                        }
                    },
                    y: {
                        beginAtZero: true,
                        grid: {
                            color: 'rgba(226, 232, 240, 0.8)'
                        },
                        ticks: {
                            font: { size: 11, family: 'monospace' },
                            color: '#64748b',
                            callback: function(value) {
                                return value + ' T';
                            }
                        }
                    }
                }
            }
        });
    }

    // 7. Thống Kê Điểm Nhấn Dưới Chân Biểu Đồ
    let peakGaVal = 0, peakGaDay = '--';
    let peakHanVal = 0, peakHanDay = '--';

    for (let i = 0; i < dayLabels.length; i++) {
        if (dailyGaActual[i] > peakGaVal) {
            peakGaVal = dailyGaActual[i];
            peakGaDay = `${dayLabels[i]} (${Math.round(peakGaVal * 10) / 10}T)`;
        }
        if (dailyHanActual[i] > peakHanVal) {
            peakHanVal = dailyHanActual[i];
            peakHanDay = `${dayLabels[i]} (${Math.round(peakHanVal * 10) / 10}T)`;
        }
    }

    const elPeakGa = document.getElementById('dash-peak-ga');
    if (elPeakGa) elPeakGa.textContent = peakGaDay;

    const elPeakHan = document.getElementById('dash-peak-han');
    if (elPeakHan) elPeakHan.textContent = peakHanDay;

    const avgDaily = workingDays > 0 ? Math.round((totalMonthGaTons + totalMonthHanTons) / 2 / workingDays * 10) / 10 : 0;
    const elAvg = document.getElementById('dash-avg-daily');
    if (elAvg) elAvg.textContent = `${avgDaily} Tấn/ngày`;

    const elStatus = document.getElementById('dash-status-eval');
    if (elStatus) {
        if (gaRate >= 100 && hanRate >= 100) {
            elStatus.textContent = '🌟 Vượt Kế Hoạch';
            elStatus.className = 'font-extrabold text-emerald-700 font-mono text-xs sm:text-sm';
        } else if (gaRate >= 80 || hanRate >= 80) {
            elStatus.textContent = '🟢 Bám Sát Tiến Độ';
            elStatus.className = 'font-extrabold text-blue-700 font-mono text-xs sm:text-sm';
        } else if (totalMonthGaTons > 0 || totalMonthHanTons > 0) {
            elStatus.textContent = '⚡ Cần Tăng Tốc';
            elStatus.className = 'font-extrabold text-amber-700 font-mono text-xs sm:text-sm';
        } else {
            elStatus.textContent = 'Chưa Triển Khai';
            elStatus.className = 'font-extrabold text-slate-500 font-mono text-xs sm:text-sm';
        }
    }

    // 8. Đổ Dữ Liệu Vào Bảng Chi Tiết Từng Ngày
    renderDashboardDayTable(dayLabels, dailyGaActual, cumGaActual, dailyHanActual, cumHanActual, cumPlanGa, dailyNtActual, dailyBgActual);
}

// Bảng chi tiết sản lượng gá hàn theo từng ngày
function renderDashboardDayTable(labels, gaActual, cumGa, hanActual, cumHan, plan, ntActual, bgActual) {
    const tbody = document.getElementById('dash-day-table-tbody');
    const summaryEl = document.getElementById('dash-day-table-summary');
    if (!tbody) return;

    let activeDaysCount = 0;
    let html = '';

    for (let i = 0; i < labels.length; i++) {
        const ga = Math.round(gaActual[i] * 100) / 100;
        const han = Math.round(hanActual[i] * 100) / 100;
        const nt = Math.round(ntActual[i] * 100) / 100;
        const bg = Math.round(bgActual[i] * 100) / 100;
        const pl = Math.round(plan[i] * 100) / 100;

        if (ga > 0 || han > 0 || nt > 0 || bg > 0) activeDaysCount++;

        const isTodayOrActive = (ga > 0 || han > 0);
        const rowBg = isTodayOrActive ? 'bg-blue-50/20 hover:bg-blue-50/50' : 'hover:bg-slate-50';

        const diff = Math.round((cumGa[i] - pl) * 100) / 100;
        let evalBadge = `<span class="text-slate-400 text-[10px]">--</span>`;
        if (diff > 0) {
            evalBadge = `<span class="px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800 text-[10px] font-bold">+${diff}T</span>`;
        } else if (diff < 0) {
            evalBadge = `<span class="px-1.5 py-0.2 rounded bg-rose-100 text-rose-800 text-[10px] font-bold">${diff}T</span>`;
        }

        html += `
            <tr class="${rowBg} transition">
                <td class="py-2 px-3 font-bold text-slate-800">${labels[i]}</td>
                <td class="py-2 px-3 text-right text-blue-700 font-bold">${ga > 0 ? ga.toLocaleString() : '-'}</td>
                <td class="py-2 px-3 text-right text-blue-900">${cumGa[i].toLocaleString()}</td>
                <td class="py-2 px-3 text-right text-amber-700 font-bold">${han > 0 ? han.toLocaleString() : '-'}</td>
                <td class="py-2 px-3 text-right text-amber-900">${cumHan[i].toLocaleString()}</td>
                <td class="py-2 px-3 text-right text-slate-600">${pl.toLocaleString()}</td>
                <td class="py-2 px-3 text-right text-teal-700">${nt > 0 ? nt.toLocaleString() : '-'}</td>
                <td class="py-2 px-3 text-right text-emerald-700 font-bold">${bg > 0 ? bg.toLocaleString() : '-'}</td>
                <td class="py-2 px-3 text-center">${evalBadge}</td>
            </tr>
        `;
    }

    tbody.innerHTML = html;
    if (summaryEl) summaryEl.textContent = `${activeDaysCount} / ${labels.length} ngày ghi nhận`;
}

// PHẦN 2: TÌNH TRẠNG NHẬN BÁN THÀNH PHẨM (BTP)
function renderDashboardBtpSection(customItems = null) {
    const data = qldaState.currentProjectData || dashboardState.currentProjectData;
    if (!data) return;

    const items = customItems !== null ? customItems : (qldaState.filteredItems || data.items || []);
    let countReady = 0;
    let countMissing = 0;
    let countZero = 0;

    let totalWeightTons = 0;
    let receivedWeightTons = 0;
    let missingWeightTons = 0;

    // Nhóm theo Hạng mục
    const hmMap = {};

    items.forEach(it => {
        const wKg = it.tweight || 0;
        const wTons = wKg / 1000;
        totalWeightTons += wTons;

        const hm = it.hang_muc || 'Khác';
        if (!hmMap[hm]) {
            hmMap[hm] = { total: 0, received: 0, missing: 0 };
        }
        hmMap[hm].total += wTons;

        // Đánh giá tỷ lệ phôi & BTP
        const phoiRate = it.nhan_phoi?.rate || 0;
        const phoiKl = (it.nhan_phoi?.kl || 0) / 1000;

        if (phoiRate >= 95 || it.status === 'BAN_GIAO' || it.status === 'NGHIEM_THU' || it.status === 'TO_HOP_THU') {
            countReady++;
            receivedWeightTons += wTons;
            hmMap[hm].received += wTons;
        } else if (phoiRate > 0 || phoiKl > 0 || it.ga_lap?.sl > 0) {
            countMissing++;
            const recTons = phoiKl > 0 ? phoiKl : (wTons * phoiRate / 100);
            receivedWeightTons += recTons;
            missingWeightTons += Math.max(0, wTons - recTons);
            hmMap[hm].received += recTons;
            hmMap[hm].missing += Math.max(0, wTons - recTons);
        } else {
            countZero++;
            missingWeightTons += wTons;
            hmMap[hm].missing += wTons;
        }
    });

    totalWeightTons = Math.round(totalWeightTons * 10) / 10;
    receivedWeightTons = Math.round(receivedWeightTons * 10) / 10;
    missingWeightTons = Math.round(missingWeightTons * 10) / 10;

    const readyPct = items.length > 0 ? Math.round(countReady / items.length * 100) : 0;
    const recPct = totalWeightTons > 0 ? Math.round(receivedWeightTons / totalWeightTons * 100) : 0;

    // Cập nhật thẻ KPI BTP
    const elBtpRec = document.getElementById('dash-kpi-btp-received');
    if (elBtpRec) elBtpRec.textContent = receivedWeightTons.toLocaleString();

    const elBtpMiss = document.getElementById('dash-kpi-btp-missing');
    if (elBtpMiss) elBtpMiss.textContent = `${missingWeightTons.toLocaleString()} Tấn`;

    const elBtpReady = document.getElementById('dash-kpi-btp-ready');
    if (elBtpReady) elBtpReady.textContent = `${countReady} CK đủ 100%`;

    const elBtpRate = document.getElementById('dash-kpi-btp-rate');
    if (elBtpRate) elBtpRate.textContent = `${recPct}% Đã Về`;

    const elBtpBar = document.getElementById('dash-kpi-btp-bar');
    if (elBtpBar) elBtpBar.style.width = `${Math.min(100, recPct)}%`;

    // Cập nhật số liệu chi tiết trong box Doughnut
    const elCenterPct = document.getElementById('dash-btp-center-pct');
    if (elCenterPct) elCenterPct.textContent = `${readyPct}%`;

    const elTotalBadge = document.getElementById('dash-btp-total-badge');
    if (elTotalBadge) elTotalBadge.textContent = `${items.length} CK`;

    const elCountReady = document.getElementById('dash-btp-count-ready');
    if (elCountReady) elCountReady.textContent = `${countReady} CK (${readyPct}%)`;

    const elCountMissing = document.getElementById('dash-btp-count-missing');
    if (elCountMissing) elCountMissing.textContent = `${countMissing} CK`;

    const elCountZero = document.getElementById('dash-btp-count-zero');
    if (elCountZero) elCountZero.textContent = `${countZero} CK`;

    // 1. Vẽ Biểu Đồ Doughnut BTP
    const doughnutCanvas = document.getElementById('dash-btp-doughnut');
    if (doughnutCanvas) {
        if (dashboardState.btpDoughnutInstance) dashboardState.btpDoughnutInstance.destroy();
        dashboardState.btpDoughnutInstance = new Chart(doughnutCanvas, {
            type: 'doughnut',
            data: {
                labels: ['Đủ 100% BTP', 'Đang thiếu BTP', 'Chưa có BTP'],
                datasets: [{
                    data: [countReady, countMissing, countZero],
                    backgroundColor: ['#10b981', '#f59e0b', '#f43f5e'],
                    borderWidth: 2,
                    borderColor: '#ffffff',
                    hoverOffset: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '72%',
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: function(ctx) {
                                const total = countReady + countMissing + countZero;
                                const pct = total > 0 ? Math.round(ctx.parsed / total * 100) : 0;
                                return ` ${ctx.label}: ${ctx.parsed} cấu kiện (${pct}%)`;
                            }
                        }
                    }
                }
            }
        });
    }

    // 2. Vẽ Biểu Đồ Stacked Bar Theo Hạng Mục
    const barCanvas = document.getElementById('dash-btp-bar');
    if (barCanvas) {
        const hmLabels = Object.keys(hmMap);
        const hmRec = hmLabels.map(hm => Math.round(hmMap[hm].received * 10) / 10);
        const hmMiss = hmLabels.map(hm => Math.round(hmMap[hm].missing * 10) / 10);

        if (dashboardState.btpBarInstance) dashboardState.btpBarInstance.destroy();
        dashboardState.btpBarInstance = new Chart(barCanvas, {
            type: 'bar',
            data: {
                labels: hmLabels.map(lbl => lbl.length > 18 ? lbl.substring(0, 16) + '...' : lbl),
                datasets: [
                    {
                        label: 'Đã nhận (Tấn)',
                        data: hmRec,
                        backgroundColor: '#10b981',
                        borderRadius: 6,
                        stack: 'Stack 0'
                    },
                    {
                        label: 'Còn thiếu (Tấn)',
                        data: hmMiss,
                        backgroundColor: '#f87171',
                        borderRadius: 6,
                        stack: 'Stack 0'
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: {
                        stacked: true,
                        grid: { display: false },
                        ticks: { font: { size: 10 }, color: '#64748b' }
                    },
                    y: {
                        stacked: true,
                        beginAtZero: true,
                        grid: { color: 'rgba(226, 232, 240, 0.8)' },
                        ticks: {
                            font: { size: 10, family: 'monospace' },
                            callback: v => v + ' T'
                        }
                    }
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        mode: 'index',
                        intersect: false
                    }
                }
            }
        });

        const totalBarEl = document.getElementById('dash-btp-bar-total');
        if (totalBarEl) totalBarEl.textContent = `Tổng: ${totalWeightTons} Tấn`;
    }

    // 3. Đổ Danh Sách BTP
    renderDashboardBtpTable(items);
}

// Bảng chi tiết tình trạng nhận BTP của cấu kiện
function renderDashboardBtpTable(customItems = null) {
    const data = qldaState.currentProjectData || dashboardState.currentProjectData;
    if (!data) return;

    const tbody = document.getElementById('dash-btp-table-tbody');
    if (!tbody) return;

    const raw = customItems !== null ? customItems : (qldaState.filteredItems || data.items || []);
    const q = (dashboardState.btpSearchQuery || '').toLowerCase().trim();

    let items = raw;
    if (q) {
        items = raw.filter(it => 
            (it.so_chi_tiet && it.so_chi_tiet.toLowerCase().includes(q)) ||
            (it.ten_ban_ve && it.ten_ban_ve.toLowerCase().includes(q)) ||
            (it.hang_muc && it.hang_muc.toLowerCase().includes(q))
        );
    }

    // Ưu tiên hiển thị cấu kiện đang thiếu BTP trước
    const displayList = items.slice(0, 50);

    let html = '';
    displayList.forEach((it, idx) => {
        const pRate = it.nhan_phoi?.rate || 0;
        const wTons = Math.round((it.tweight || 0) / 10) / 100;

        let btpBadge = `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">Chưa có BTP</span>`;
        if (pRate >= 95) {
            btpBadge = `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">Đủ 100% BTP</span>`;
        } else if (pRate > 0) {
            btpBadge = `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">Đang nhận (${pRate}%)</span>`;
        }

        let stageBadge = `<span class="text-slate-400 text-[10px]">Chưa làm</span>`;
        if (it.ban_giao?.sl > 0) stageBadge = `<span class="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px] font-bold">5. Bàn giao</span>`;
        else if (it.nghiem_thu?.sl > 0) stageBadge = `<span class="px-2 py-0.5 rounded bg-teal-100 text-teal-800 text-[10px] font-bold">4. Nghiệm thu</span>`;
        else if (it.to_hop_thu?.sl > 0) stageBadge = `<span class="px-2 py-0.5 rounded bg-purple-100 text-purple-800 text-[10px] font-bold">3. TH thử</span>`;
        else if (it.han?.sl > 0) stageBadge = `<span class="px-2 py-0.5 rounded bg-amber-100 text-amber-800 text-[10px] font-bold">2. Đã hàn</span>`;
        else if (it.ga_lap?.sl > 0) stageBadge = `<span class="px-2 py-0.5 rounded bg-blue-100 text-blue-800 text-[10px] font-bold">1. Đã gá</span>`;

        html += `
            <tr class="hover:bg-slate-50 transition">
                <td class="py-2 px-3 text-slate-400 font-mono text-[11px]">${idx + 1}</td>
                <td class="py-2 px-3 font-bold text-slate-900 font-mono">${it.so_chi_tiet || '-'}</td>
                <td class="py-2 px-3 text-slate-700 font-mono">${it.ten_ban_ve || '-'}</td>
                <td class="py-2 px-3 text-slate-600 text-xs">${it.hang_muc || '-'}</td>
                <td class="py-2 px-3 text-slate-600 font-medium">Tổ ${it.phan_giao || '-'}</td>
                <td class="py-2 px-3 text-right font-mono font-bold">${it.tqty || 1}</td>
                <td class="py-2 px-3 text-right font-mono font-bold text-blue-700">${wTons} T</td>
                <td class="py-2 px-3 text-center">
                    <div class="flex items-center justify-center gap-1.5">
                        <div class="w-14 bg-slate-200 rounded-full h-1.5 overflow-hidden">
                            <div class="bg-emerald-500 h-1.5 rounded-full" style="width: ${Math.min(100, pRate)}%"></div>
                        </div>
                        <span class="text-[10px] font-mono font-bold text-slate-600">${pRate}%</span>
                    </div>
                </td>
                <td class="py-2 px-3 text-center">${btpBadge}</td>
                <td class="py-2 px-3 text-center">${stageBadge}</td>
            </tr>
        `;
    });

    if (html === '') {
        html = `<tr><td colspan="10" class="text-center py-6 text-slate-400">Không tìm thấy cấu kiện phù hợp</td></tr>`;
    }

    tbody.innerHTML = html;
}

// PHẦN 3: BIỂU ĐỒ GRANT TIẾN ĐỘ (GANTT TIMELINE CHART)
function renderDashboardGantt(customItems = null) {
    const data = qldaState.currentProjectData || dashboardState.currentProjectData;
    const container = document.getElementById('dash-gantt-container');
    if (!data || !container) return;

    const raw = customItems !== null ? customItems : (qldaState.filteredItems || data.items || []);
    const q = (dashboardState.ganttSearchQuery || '').toLowerCase().trim();
    const stageFilter = dashboardState.ganttFilterStage;

    // 1. Lọc cấu kiện
    let items = raw.filter(it => {
        if (stageFilter === 'ga' && (!it.ga_lap?.sl)) return false;
        if (stageFilter === 'han' && (!it.han?.sl)) return false;
        if (stageFilter === 'th' && (!it.to_hop_thu?.sl)) return false;
        if (stageFilter === 'nt' && (!it.nghiem_thu?.sl)) return false;
        if (stageFilter === 'bg' && (!it.ban_giao?.sl)) return false;

        if (q) {
            const matchCode = it.so_chi_tiet && it.so_chi_tiet.toLowerCase().includes(q);
            const matchDraw = it.ten_ban_ve && it.ten_ban_ve.toLowerCase().includes(q);
            const matchHm = it.hang_muc && it.hang_muc.toLowerCase().includes(q);
            if (!matchCode && !matchDraw && !matchHm) return false;
        }
        return true;
    });

    // 2. Thu thập ngày bắt đầu và kết thúc toàn bộ để lập Timeline Scale
    function parseDate(dStr) {
        if (!dStr) return null;
        const parts = dStr.split('/');
        if (parts.length === 3) {
            return new Date(parseInt(parts[2], 10), parseInt(parts[1], 10) - 1, parseInt(parts[0], 10));
        }
        return null;
    }

    let minTime = Infinity;
    let maxTime = -Infinity;

    items.forEach(it => {
        ['ga_lap', 'han', 'to_hop_thu', 'nghiem_thu', 'ban_giao'].forEach(stg => {
            const dt = parseDate(it[stg]?.ngay);
            if (dt) {
                const t = dt.getTime();
                if (t < minTime) minTime = t;
                if (t > maxTime) maxTime = t;
            }
        });
        const dtWo = parseDate(it.ngay_giao_wo);
        if (dtWo) {
            const t = dtWo.getTime();
            if (t > maxTime) maxTime = t;
            if (t < minTime) minTime = t;
        }
    });

    if (minTime === Infinity || maxTime === -Infinity || minTime >= maxTime) {
        // Dự phòng mốc thời gian mặc định
        const now = new Date();
        minTime = new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime();
        maxTime = new Date(now.getFullYear(), now.getMonth() + 2, 1).getTime();
    } else {
        // Mở rộng lề 3 ngày trước và sau
        minTime -= 3 * 86400000;
        maxTime += 5 * 86400000;
    }

    const totalDuration = maxTime - minTime;

    // 3. Tạo các mốc trục thời gian (Timeline Axis Ticks - Khoảng 8 - 12 mốc)
    const tickCount = 8;
    const ticks = [];
    for (let i = 0; i <= tickCount; i++) {
        const t = minTime + (totalDuration * i / tickCount);
        const dt = new Date(t);
        const d = dt.getDate() < 10 ? `0${dt.getDate()}` : dt.getDate();
        const m = (dt.getMonth() + 1) < 10 ? `0${dt.getMonth() + 1}` : (dt.getMonth() + 1);
        ticks.push({
            percent: (i / tickCount) * 100,
            label: `${d}/${m}`
        });
    }

    // Lấy tối đa 40 cấu kiện để biểu diễn Gantt tối ưu hiệu năng
    const displayItems = items.slice(0, 40);

    let html = `
        <div class="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-2xs">
            <!-- Timeline Header -->
            <div class="flex items-center bg-slate-100 border-b border-slate-200 text-xs font-bold text-slate-700 py-2.5">
                <div class="w-64 sm:w-80 px-3 shrink-0 border-r border-slate-200 uppercase tracking-wide text-[11px]">
                    Cấu Kiện & Thông Tin Chế Tạo
                </div>
                <div class="flex-1 relative h-6">
                    ${ticks.map(tk => `
                        <div class="absolute -translate-x-1/2 text-[10px] font-mono text-slate-500 font-bold" style="left: ${tk.percent}%">
                            ${tk.label}
                        </div>
                    `).join('')}
                </div>
            </div>

            <!-- Timeline Rows -->
            <div class="divide-y divide-slate-100 text-xs">
    `;

    if (displayItems.length === 0) {
        html += `
            <div class="py-12 text-center text-slate-400 font-medium">
                Không có cấu kiện nào phù hợp điều kiện lọc Gantt
            </div>
        `;
    } else {
        displayItems.forEach((it, idx) => {
            const dtGa = parseDate(it.ga_lap?.ngay);
            const dtHan = parseDate(it.han?.ngay);
            const dtTh = parseDate(it.to_hop_thu?.ngay);
            const dtNt = parseDate(it.nghiem_thu?.ngay);
            const dtBg = parseDate(it.ban_giao?.ngay);
            const dtWo = parseDate(it.ngay_giao_wo);

            const wTons = Math.round((it.tweight || 0) / 10) / 100;

            function calcPos(dt) {
                if (!dt) return null;
                return Math.max(0, Math.min(100, ((dt.getTime() - minTime) / totalDuration) * 100));
            }

            const pGa = calcPos(dtGa);
            const pHan = calcPos(dtHan);
            const pTh = calcPos(dtTh);
            const pNt = calcPos(dtNt);
            const pBg = calcPos(dtBg);
            const pWo = calcPos(dtWo);

            html += `
                <div class="flex items-center hover:bg-slate-50/80 transition py-2 group">
                    <!-- Cột thông tin cấu kiện -->
                    <div class="w-64 sm:w-80 px-3 shrink-0 border-r border-slate-200">
                        <div class="flex items-center justify-between">
                            <span class="font-bold text-slate-900 font-mono text-xs truncate" title="${it.so_chi_tiet}">${it.so_chi_tiet}</span>
                            <span class="font-bold font-mono text-blue-700 text-[11px]">${wTons} T</span>
                        </div>
                        <div class="flex items-center justify-between text-[11px] text-slate-500 mt-0.5 truncate">
                            <span class="truncate">${it.ten_ban_ve || it.hang_muc}</span>
                            <span class="text-slate-400 shrink-0 ml-1">Tổ ${it.phan_giao}</span>
                        </div>
                    </div>

                    <!-- Đường dải màu Gantt -->
                    <div class="flex-1 relative h-7 mx-2 bg-slate-50/50 rounded-lg overflow-hidden flex items-center">
                        <!-- Grid vạch mờ thẳng đứng -->
                        ${ticks.map(tk => `
                            <div class="absolute top-0 bottom-0 w-px bg-slate-200/60 pointer-events-none" style="left: ${tk.percent}%"></div>
                        `).join('')}

                        <!-- Thanh Gá Lắp -->
                        ${pGa !== null ? `
                            <div class="absolute h-4 rounded bg-blue-600 shadow-2xs cursor-pointer hover:scale-110 transition flex items-center justify-center text-[9px] text-white font-bold px-1" 
                                style="left: ${pGa}%; width: ${Math.max(2.5, (pHan !== null && pHan > pGa) ? (pHan - pGa) : 3)}%"
                                title="Gá Lắp: ${it.ga_lap?.ngay} • ${it.ga_lap?.kl || 0} kg">
                                Gá
                            </div>
                        ` : ''}

                        <!-- Điểm / Thanh Hàn -->
                        ${pHan !== null ? `
                            <div class="absolute h-4 rounded bg-amber-500 shadow-2xs cursor-pointer hover:scale-110 transition flex items-center justify-center text-[9px] text-white font-bold px-1" 
                                style="left: ${pHan}%; width: ${Math.max(2.5, (pNt !== null && pNt > pHan) ? Math.min(6, pNt - pHan) : 3)}%"
                                title="Hàn: ${it.han?.ngay} • ${it.han?.kl || 0} kg">
                                Hàn
                            </div>
                        ` : ''}

                        <!-- Điểm Tổ Hợp Thử -->
                        ${pTh !== null ? `
                            <div class="absolute h-4 w-4 rounded-full bg-purple-600 border border-white shadow-2xs cursor-pointer hover:scale-125 transition flex items-center justify-center text-[8px] text-white font-extrabold -ml-2" 
                                style="left: ${pTh}%"
                                title="Tổ Hợp Thử: ${it.to_hop_thu?.ngay}">
                                TH
                            </div>
                        ` : ''}

                        <!-- Điểm Nghiệm Thu -->
                        ${pNt !== null ? `
                            <div class="absolute h-4 w-4 rounded-full bg-teal-600 border border-white shadow-2xs cursor-pointer hover:scale-125 transition flex items-center justify-center text-[8px] text-white font-extrabold -ml-2" 
                                style="left: ${pNt}%"
                                title="Nghiệm Thu: ${it.nghiem_thu?.ngay}">
                                NT
                            </div>
                        ` : ''}

                        <!-- Điểm Bàn Giao -->
                        ${pBg !== null ? `
                            <div class="absolute h-4 w-4 rounded-full bg-emerald-600 border border-white shadow-2xs cursor-pointer hover:scale-125 transition flex items-center justify-center text-[8px] text-white font-extrabold -ml-2" 
                                style="left: ${pBg}%"
                                title="Bàn Giao: ${it.ban_giao?.ngay} • ĐV: ${it.ban_giao?.don_vi_nhan || 'AMECC'}">
                                BG
                            </div>
                        ` : ''}

                        <!-- Cột cờ hạn WO Deadline -->
                        ${pWo !== null ? `
                            <div class="absolute top-0 bottom-0 w-0.5 bg-rose-500 z-10 cursor-pointer" 
                                style="left: ${pWo}%"
                                title="Hạn Giao Hàng WO: ${it.ngay_giao_wo}">
                                <div class="w-2.5 h-2.5 rounded-full bg-rose-600 -ml-1 -top-1 absolute border border-white"></div>
                            </div>
                        ` : ''}
                    </div>
                </div>
            `;
        });
    }

    html += `
            </div>
            ${items.length > 40 ? `
                <div class="px-4 py-2.5 bg-slate-50 text-center text-xs text-slate-500 font-medium border-t border-slate-200">
                    Đang hiển thị 40 / ${items.length} cấu kiện • Sử dụng ô tìm kiếm phía trên để tra cứu từng cấu kiện cụ thể
                </div>
            ` : ''}
        </div>
    `;

    container.innerHTML = html;
}

// Thiết lập các sự kiện lắng nghe cho Dashboard
function setupDashboardEventListeners() {
    // 1. Thay đổi dự án
    const projSelect = document.getElementById('dash-select-project');
    if (projSelect) {
        projSelect.addEventListener('change', (e) => {
            loadDashboardProject(e.target.value);
        });
    }

    // 2. Thay đổi Tháng/Năm
    const monthSelect = document.getElementById('dash-select-month');
    if (monthSelect) {
        monthSelect.addEventListener('change', (e) => {
            dashboardState.selectedMonth = e.target.value;
            renderDashboardKPIsAndLineChart(qldaState.filteredItems || qldaState.rawItems);
        });
    }

    // 5. Chế độ đường S-Curve vs Từng ngày
    const btnScurve = document.getElementById('dash-btn-mode-scurve');
    const btnDaily = document.getElementById('dash-btn-mode-daily');
    if (btnScurve && btnDaily) {
        btnScurve.addEventListener('click', () => {
            dashboardState.chartMode = 'scurve';
            btnScurve.className = 'flex-1 py-1 rounded-lg text-xs font-bold transition cursor-pointer text-center bg-purple-600 text-white shadow-2xs';
            btnDaily.className = 'flex-1 py-1 rounded-lg text-xs font-bold transition cursor-pointer text-center text-slate-300 hover:text-white';
            renderDashboardKPIsAndLineChart(qldaState.filteredItems || qldaState.rawItems);
        });

        btnDaily.addEventListener('click', () => {
            dashboardState.chartMode = 'daily';
            btnDaily.className = 'flex-1 py-1 rounded-lg text-xs font-bold transition cursor-pointer text-center bg-purple-600 text-white shadow-2xs';
            btnScurve.className = 'flex-1 py-1 rounded-lg text-xs font-bold transition cursor-pointer text-center text-slate-300 hover:text-white';
            renderDashboardKPIsAndLineChart(qldaState.filteredItems || qldaState.rawItems);
        });
    }

    // 6. Áp dụng mục tiêu kế hoạch
    const btnApplyTarget = document.getElementById('dash-btn-apply-target');
    const inputTarget = document.getElementById('dash-input-target-tons');
    if (btnApplyTarget && inputTarget) {
        btnApplyTarget.addEventListener('click', () => {
            const val = parseFloat(inputTarget.value) || 50;
            dashboardState.targetTons = val;
            renderDashboardKPIsAndLineChart(qldaState.filteredItems || qldaState.rawItems);
        });
        inputTarget.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                const val = parseFloat(inputTarget.value) || 50;
                dashboardState.targetTons = val;
                renderDashboardKPIsAndLineChart(qldaState.filteredItems || qldaState.rawItems);
            }
        });
    }

    // 7. Thu gọn / Mở rộng bảng nhật ký từng ngày
    const btnToggleDayTable = document.getElementById('dash-btn-toggle-day-table');
    const dayTableContainer = document.getElementById('dash-day-table-container');
    const dayTableChevron = document.getElementById('dash-day-table-chevron');
    if (btnToggleDayTable && dayTableContainer) {
        btnToggleDayTable.addEventListener('click', () => {
            dashboardState.isDayTableOpen = !dashboardState.isDayTableOpen;
            if (dashboardState.isDayTableOpen) {
                dayTableContainer.classList.remove('hidden');
                if (dayTableChevron) dayTableChevron.style.transform = 'rotate(180deg)';
            } else {
                dayTableContainer.classList.add('hidden');
                if (dayTableChevron) dayTableChevron.style.transform = 'rotate(0deg)';
            }
        });
    }

    // 8. Tìm kiếm BTP
    const inputBtpSearch = document.getElementById('dash-search-btp');
    if (inputBtpSearch) {
        let btpTimeout = null;
        inputBtpSearch.addEventListener('input', (e) => {
            clearTimeout(btpTimeout);
            const val = e.target.value;
            btpTimeout = setTimeout(() => {
                dashboardState.btpSearchQuery = val;
                renderDashboardBtpTable(qldaState.filteredItems || qldaState.rawItems);
            }, 200);
        });
    }

    // 9. Tìm kiếm & Lọc Gantt
    const inputGanttSearch = document.getElementById('dash-gantt-search');
    if (inputGanttSearch) {
        let ganttTimeout = null;
        inputGanttSearch.addEventListener('input', (e) => {
            clearTimeout(ganttTimeout);
            const val = e.target.value;
            ganttTimeout = setTimeout(() => {
                dashboardState.ganttSearchQuery = val;
                renderDashboardGantt(qldaState.filteredItems || qldaState.rawItems);
            }, 200);
        });
    }

    const selectGanttStage = document.getElementById('dash-gantt-filter-stage');
    if (selectGanttStage) {
        selectGanttStage.addEventListener('change', (e) => {
            dashboardState.ganttFilterStage = e.target.value;
            renderDashboardGantt(qldaState.filteredItems || qldaState.rawItems);
        });
    }

    // 10. Nút Làm Mới Dashboard
    const btnRefresh = document.getElementById('btn-dash-refresh');
    if (btnRefresh) {
        btnRefresh.addEventListener('click', () => {
            const targetPid = dashboardState.currentProjectId || qldaState.currentProjectId;
            if (targetPid) {
                delete _qldaDataCache[targetPid];
                loadQldaProject(targetPid);
            }
        });
    }
}

// =========================================================================
// QUẢN LÝ BẢNG THÔNG BÁO TIẾN ĐỘ & BẢN TIN CẬP NHẬT TRANG WEB (DYNAMIC ANNOUNCEMENTS)
// =========================================================================

const DEFAULT_ANNOUNCEMENTS = {
    last_updated: "18/09/2026",
    badge: "Thông Báo Quan Trọng",
    title: "Kế Hoạch Cập Nhật Tiến Độ Công Đoạn & Bản Tin Trang Web",
    schedule_notice: {
        frequency: "Kế hoạch tiến độ công đoạn sẽ cập nhật 1 tuần 1 lần",
        contact_person: "",
        contact_note: "",
        hotline: ""
    },
    web_updates: [
        {
            id: "upd-1",
            date: "18/09/2026",
            tag: "Cập nhật hệ thống",
            title: "Tối ưu hóa hệ thống & Đồng bộ ngày nhận hàng mới nhất",
            content: "Hoàn tất quét dữ liệu ngày nhận 17/09/2026 cho dự án A290, tự động đưa ngày nhận mới nhất lên đầu danh sách, nâng cấp cơ chế chống lưu cache trình duyệt và gia cố bảo mật máy chủ."
        }
    ]
};

async function loadAnnouncements() {
    try {
        let data = null;
        if (!state.isStaticMode) {
            try {
                const res = await fetch(`/api/announcements?t=${Date.now()}`, { cache: 'no-store' });
                if (res.ok) {
                    data = await res.json();
                }
            } catch (err) {
                console.warn("API /api/announcements không phản hồi, thử tải file tĩnh");
            }
        }
        if (!data) {
            const res = await fetch(`data/announcements.json?t=${Date.now()}`, { cache: 'no-store' });
            if (res.ok) {
                data = await res.json();
            }
        }
        state.announcements = data || DEFAULT_ANNOUNCEMENTS;
    } catch (e) {
        console.warn("Lỗi nạp thông báo:", e);
        state.announcements = DEFAULT_ANNOUNCEMENTS;
    }
    renderAnnouncementUI();
}

function renderAnnouncementUI() {
    const ann = state.announcements || DEFAULT_ANNOUNCEMENTS;
    
    // 1. Cập nhật thẻ hiển thị chính trong tab QLDA
    const titleEl = document.getElementById('announcement-title');
    if (titleEl) titleEl.textContent = ann.title || 'Kế Hoạch Cập Nhật Tiến Độ Công Đoạn & Bản Tin Trang Web';

    const badgeEl = document.getElementById('announcement-badge');
    if (badgeEl) badgeEl.textContent = ann.badge || 'Thông Báo Quan Trọng';

    const updatedEl = document.getElementById('announcement-updated-time');
    if (updatedEl) updatedEl.textContent = ann.last_updated || new Date().toLocaleDateString('vi-VN');

    const freqEl = document.getElementById('announcement-frequency');
    if (freqEl) freqEl.textContent = ann.schedule_notice?.frequency || 'Kế hoạch tiến độ công đoạn sẽ cập nhật 1 tuần 1 lần';

    const contactEl = document.getElementById('announcement-contact-person');
    if (contactEl) contactEl.textContent = ann.schedule_notice?.contact_person || 'Anh Cường (AMC2)';

    const noteEl = document.getElementById('announcement-contact-note');
    if (noteEl) noteEl.textContent = ann.schedule_notice?.contact_note || 'Số liệu hằng ngày xin liên hệ anh Cường (AMC2) để được hỗ trợ kịp thời.';

    // 2. Cập nhật trong Modal Xem nhanh
    const modalFreq = document.getElementById('modal-view-ann-frequency');
    if (modalFreq) modalFreq.textContent = ann.schedule_notice?.frequency || 'Kế hoạch tiến độ công đoạn sẽ cập nhật 1 tuần 1 lần';

    const modalContact = document.getElementById('modal-view-ann-contact');
    if (modalContact) modalContact.textContent = ann.schedule_notice?.contact_person || 'Anh Cường (AMC2)';

    const modalNote = document.getElementById('modal-view-ann-note');
    if (modalNote) modalNote.textContent = ann.schedule_notice?.contact_note || 'Số liệu hằng ngày xin liên hệ anh Cường (AMC2) để được hỗ trợ kịp thời.';

    // 3. Render danh sách cập nhật web
    renderUpdatesList('announcement-web-updates-list', ann.web_updates || []);
    renderUpdatesList('modal-view-ann-updates-list', ann.web_updates || []);

    // 4. Kiểm soát hiển thị nút sửa cho Admin
    const btnEdit = document.getElementById('btn-edit-announcement');
    if (btnEdit) {
        if (state.isAdmin) {
            btnEdit.classList.remove('hidden');
            btnEdit.classList.add('inline-flex');
        } else {
            btnEdit.classList.add('hidden');
            btnEdit.classList.remove('inline-flex');
        }
    }
    const btnViewToEdit = document.getElementById('btn-view-to-edit-announcement');
    if (btnViewToEdit) {
        if (state.isAdmin) {
            btnViewToEdit.classList.remove('hidden');
            btnViewToEdit.classList.add('inline-flex');
        } else {
            btnViewToEdit.classList.add('hidden');
            btnViewToEdit.classList.remove('inline-flex');
        }
    }

    if (window.lucide && typeof lucide.createIcons === 'function') {
        lucide.createIcons();
    }
}

function renderUpdatesList(containerId, updates) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (!updates || updates.length === 0) {
        container.innerHTML = `
            <div class="p-3 text-center text-slate-400 bg-white/60 border border-dashed border-slate-200 rounded-xl text-xs">
                Chưa có bản tin cập nhật mới nào được đăng.
            </div>
        `;
        return;
    }

    container.innerHTML = updates.map(u => `
        <div class="bg-white/95 border border-slate-200/90 rounded-xl p-3 shadow-2xs hover:border-amber-300 transition">
            <div class="flex items-center justify-between gap-2 mb-1">
                <div class="flex items-center gap-1.5 flex-wrap">
                    <span class="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-100 text-amber-800">${escapeHtml(u.tag || 'Cập nhật')}</span>
                    <span class="font-bold text-slate-900 text-xs">${escapeHtml(u.title || '')}</span>
                </div>
                <span class="text-[10px] text-slate-400 font-mono">${escapeHtml(u.date || '')}</span>
            </div>
            <p class="text-[11px] text-slate-600 leading-relaxed">${escapeHtml(u.content || '')}</p>
        </div>
    `).join('');
}

function openAnnouncementEditModal() {
    const ann = state.announcements || DEFAULT_ANNOUNCEMENTS;
    
    const titleInput = document.getElementById('input-ann-title');
    if (titleInput) titleInput.value = ann.title || '';

    const badgeInput = document.getElementById('input-ann-badge');
    if (badgeInput) badgeInput.value = ann.badge || 'Thông Báo Quan Trọng';

    const freqInput = document.getElementById('input-ann-frequency');
    if (freqInput) freqInput.value = ann.schedule_notice?.frequency || 'Kế hoạch tiến độ công đoạn sẽ cập nhật 1 tuần 1 lần';

    const contactInput = document.getElementById('input-ann-contact');
    if (contactInput) contactInput.value = ann.schedule_notice?.contact_person || 'Anh Cường (AMC2)';

    const noteInput = document.getElementById('input-ann-note');
    if (noteInput) noteInput.value = ann.schedule_notice?.contact_note || 'Số liệu hằng ngày xin liên hệ anh Cường (AMC2) để được hỗ trợ kịp thời.';

    // Render danh sách dòng tin trong modal sửa
    const updatesContainer = document.getElementById('edit-ann-updates-container');
    if (updatesContainer) {
        updatesContainer.innerHTML = '';
        const list = ann.web_updates || [];
        list.forEach((u, idx) => {
            addWebUpdateRow(u);
        });
        if (list.length === 0) {
            addWebUpdateRow({ date: new Date().toLocaleDateString('vi-VN'), tag: 'Tính Năng Mới', title: '', content: '' });
        }
    }

    const modal = document.getElementById('modal-edit-announcement');
    if (modal) {
        modal.classList.remove('hidden');
        modal.classList.add('flex');
    }

    if (window.lucide && typeof lucide.createIcons === 'function') {
        lucide.createIcons();
    }
}

function closeAnnouncementEditModal() {
    const modal = document.getElementById('modal-edit-announcement');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
}

function addWebUpdateRow(data = {}) {
    const container = document.getElementById('edit-ann-updates-container');
    if (!container) return;

    const rowId = 'row-upd-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4);
    const row = document.createElement('div');
    row.className = 'p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2 relative group';
    row.id = rowId;

    row.innerHTML = `
        <div class="flex items-center justify-between gap-2">
            <div class="grid grid-cols-2 gap-2 flex-1">
                <div>
                    <label class="text-[10px] text-slate-500 font-bold block">Ngày cập nhật:</label>
                    <input type="text" class="upd-date w-full bg-white border border-slate-300 rounded-lg px-2 py-1 text-xs font-mono" value="${escapeHtml(data.date || new Date().toLocaleDateString('vi-VN'))}">
                </div>
                <div>
                    <label class="text-[10px] text-slate-500 font-bold block">Nhãn (Tag):</label>
                    <input type="text" class="upd-tag w-full bg-white border border-slate-300 rounded-lg px-2 py-1 text-xs font-bold text-amber-700" value="${escapeHtml(data.tag || 'Cập nhật')}">
                </div>
            </div>
            <button type="button" onclick="document.getElementById('${rowId}').remove()" class="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition cursor-pointer" title="Xóa dòng tin này">
                <i data-lucide="trash-2" class="w-4 h-4"></i>
            </button>
        </div>
        <div>
            <label class="text-[10px] text-slate-500 font-bold block">Tiêu đề bản tin:</label>
            <input type="text" class="upd-title w-full bg-white border border-slate-300 rounded-lg px-2 py-1 text-xs font-bold" value="${escapeHtml(data.title || '')}" placeholder="VD: Ra mắt tính năng tra cứu mới...">
        </div>
        <div>
            <label class="text-[10px] text-slate-500 font-bold block">Nội dung chi tiết:</label>
            <textarea class="upd-content w-full bg-white border border-slate-300 rounded-lg px-2 py-1 text-xs h-14" placeholder="Mô tả tóm tắt nội dung thay đổi hoặc tính năng mới...">${escapeHtml(data.content || '')}</textarea>
        </div>
    `;
    container.appendChild(row);

    if (window.lucide && typeof lucide.createIcons === 'function') {
        lucide.createIcons();
    }
}

async function saveAnnouncementData() {
    const titleInput = document.getElementById('input-ann-title');
    const badgeInput = document.getElementById('input-ann-badge');
    const freqInput = document.getElementById('input-ann-frequency');
    const contactInput = document.getElementById('input-ann-contact');
    const noteInput = document.getElementById('input-ann-note');

    const updateRows = document.querySelectorAll('#edit-ann-updates-container > div');
    const collectedUpdates = [];
    updateRows.forEach((r, idx) => {
        const d = r.querySelector('.upd-date')?.value?.trim() || '';
        const t = r.querySelector('.upd-tag')?.value?.trim() || 'Cập nhật';
        const title = r.querySelector('.upd-title')?.value?.trim() || '';
        const content = r.querySelector('.upd-content')?.value?.trim() || '';
        if (title || content) {
            collectedUpdates.push({
                id: `upd-${idx + 1}`,
                date: d,
                tag: t,
                title: title,
                content: content
            });
        }
    });

    const newAnn = {
        last_updated: new Date().toLocaleDateString('vi-VN'),
        badge: badgeInput?.value?.trim() || 'Thông Báo Quan Trọng',
        title: titleInput?.value?.trim() || 'Kế Hoạch Cập Nhật Tiến Độ Công Đoạn & Bản Tin Trang Web',
        schedule_notice: {
            frequency: freqInput?.value?.trim() || 'Kế hoạch tiến độ công đoạn sẽ cập nhật 1 tuần 1 lần',
            contact_person: contactInput?.value?.trim() || 'Anh Cường (AMC2)',
            contact_note: noteInput?.value?.trim() || 'Số liệu hằng ngày xin liên hệ anh Cường (AMC2) để được hỗ trợ kịp thời.',
            hotline: ''
        },
        web_updates: collectedUpdates
    };

    try {
        const res = await fetch('/api/announcements', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newAnn)
        });
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.detail || 'Không thể lưu thông báo vào server');
        }
        state.announcements = newAnn;
        renderAnnouncementUI();
        closeAnnouncementEditModal();
        alert('🎉 Đã cập nhật bảng thông báo thành công!');
    } catch (e) {
        alert('⚠️ Lỗi: ' + e.message);
    }
}

function setupAnnouncementEvents() {
    // 1. Mở modal xem thông báo
    const btnOpenView = document.getElementById('btn-open-announcement-modal');
    if (btnOpenView) {
        btnOpenView.addEventListener('click', () => {
            const modal = document.getElementById('modal-announcement-view');
            if (modal) {
                modal.classList.remove('hidden');
                modal.classList.add('flex');
            }
        });
    }

    const btnCloseView = document.getElementById('btn-close-view-announcement');
    if (btnCloseView) {
        btnCloseView.addEventListener('click', () => {
            const modal = document.getElementById('modal-announcement-view');
            if (modal) {
                modal.classList.add('hidden');
                modal.classList.remove('flex');
            }
        });
    }

    const btnCloseViewBottom = document.getElementById('btn-close-view-announcement-bottom');
    if (btnCloseViewBottom) {
        btnCloseViewBottom.addEventListener('click', () => {
            const modal = document.getElementById('modal-announcement-view');
            if (modal) {
                modal.classList.add('hidden');
                modal.classList.remove('flex');
            }
        });
    }

    // 2. Chuyển từ xem sang sửa (dành cho Admin)
    const btnViewToEdit = document.getElementById('btn-view-to-edit-announcement');
    if (btnViewToEdit) {
        btnViewToEdit.addEventListener('click', () => {
            const viewModal = document.getElementById('modal-announcement-view');
            if (viewModal) {
                viewModal.classList.add('hidden');
                viewModal.classList.remove('flex');
            }
            openAnnouncementEditModal();
        });
    }

    // 3. Nút sửa trên Card thông báo tab QLDA
    const btnEditCard = document.getElementById('btn-edit-announcement');
    if (btnEditCard) {
        btnEditCard.addEventListener('click', openAnnouncementEditModal);
    }

    // 4. Đóng modal sửa
    const btnCloseEdit = document.getElementById('btn-close-edit-announcement');
    if (btnCloseEdit) btnCloseEdit.addEventListener('click', closeAnnouncementEditModal);

    const btnCancelEdit = document.getElementById('btn-cancel-edit-announcement');
    if (btnCancelEdit) btnCancelEdit.addEventListener('click', closeAnnouncementEditModal);

    // 5. Thêm dòng tin mới
    const btnAddRow = document.getElementById('btn-add-web-update-row');
    if (btnAddRow) {
        btnAddRow.addEventListener('click', () => {
            addWebUpdateRow({ date: new Date().toLocaleDateString('vi-VN'), tag: 'Tính Năng Mới', title: '', content: '' });
        });
    }

    // 6. Lưu thông báo
    const btnSave = document.getElementById('btn-save-announcement');
    if (btnSave) {
        btnSave.addEventListener('click', saveAnnouncementData);
    }

    // 7. Nút Thu gọn / Mở rộng Card thông báo trên tab QLDA
    const btnToggle = document.getElementById('btn-toggle-announcement');
    if (btnToggle) {
        btnToggle.addEventListener('click', () => {
            const body = document.getElementById('announcement-body-content');
            const icon = document.getElementById('icon-toggle-announcement');
            if (body) {
                const isHidden = body.classList.toggle('hidden');
                if (icon) {
                    icon.setAttribute('data-lucide', isHidden ? 'chevron-down' : 'chevron-up');
                    if (window.lucide && typeof lucide.createIcons === 'function') {
                        lucide.createIcons();
                    }
                }
            }
        });
    }
}

