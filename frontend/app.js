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

// Cập nhật các nhãn trên thanh bộ lọc thu gọn
function updateCompactFilterBadges() {
    const pLabel = document.getElementById('compact-project-label');
    const sLabel = document.getElementById('compact-sheet-label');
    const dLabel = document.getElementById('compact-date-label');
    const cSearch = document.getElementById('compact-input-search');
    const mainSearch = document.getElementById('input-search');
    
    if (pLabel) {
        pLabel.textContent = state.currentProject || 'Dự án';
    }
    if (sLabel) {
        sLabel.textContent = state.selectedSheet === 'all' ? 'Tất cả sheet' : state.selectedSheet;
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
            const res = await fetch('data/projects.json');
            if (res.ok) {
                data = await res.json();
                renderStaticModeUI();
            } else {
                throw new Error("Không thể tải danh sách dự án từ máy chủ hoặc dữ liệu tĩnh.");
            }
        }

        state.projects = data.projects || [];
        
        select.innerHTML = '';
        if (state.projects.length === 0) {
            select.innerHTML = '<option value="">Không tìm thấy file PL nào trong thư mục Data</option>';
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
        });

        if (!found && state.projects.length > 0) {
            targetFile = state.projects[0].file_path;
        }

        if (targetFile) {
            select.value = targetFile;
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
            
            let jsonUrl = `data/${projCode}.json`;
            let res = await fetch(jsonUrl);
            if (!res.ok) {
                jsonUrl = `data/${projCode}PL.json`;
                res = await fetch(jsonUrl);
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
        
        // Cập nhật số lượng cảnh báo Shape trên Badge
        const shapeTabBadge = document.getElementById('shape-tab-badge');
        if (shapeTabBadge) {
            shapeTabBadge.textContent = state.projectData.total_shape_issues || 0;
        }

        // Tải nội dung tab tương ứng nếu đang mở Tab 2, 3 hoặc 4
        if (state.activeTab === 'timeline') renderDailyTimeline();
        if (state.activeTab === 'shape') renderShapeWarnings();
        if (state.activeTab === 'dvg') renderDvgAnalytics();

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
    const kpiShape = document.getElementById('kpi-shape-issues');

    if (kpiTotal) kpiTotal.textContent = data.total_assemblies || 0;
    if (kpiCompleted) kpiCompleted.textContent = data.completed_assemblies || 0;
    if (kpiPartial) kpiPartial.textContent = data.partial_assemblies || 0;
    if (kpiShape) kpiShape.textContent = data.total_shape_issues || 0;
}

// Hiển thị danh sách dropdown chọn Sheet
function renderSheetSelector() {
    const selectSheet = document.getElementById('select-sheet');
    if (!selectSheet || !state.projectData) return;

    selectSheet.innerHTML = '<option value="all">📂 Tất cả hạng mục (Sheets)</option>';
    const bomSheets = state.projectData.bom_sheets || [];
    bomSheets.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s;
        opt.textContent = `Hạng mục: ${s}`;
        selectSheet.appendChild(opt);
    });
}

// 5. Quản lý Lịch chọn ngày trực quan & Dropdown chọn ngày
let calendarState = {
    currentYear: 2026,
    currentMonth: 8 // 1-indexed (1..12)
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
    const sortedDates = [...rawDates].sort((a, b) => parseDateSortKey(a) - parseDateSortKey(b));
    
    select.innerHTML = `<option value="all">📅 Tất cả ngày nhận (Toàn bộ ${sortedDates.length} ngày)</option>`;

    sortedDates.forEach(d => {
        const opt = document.createElement('option');
        opt.value = d;
        opt.textContent = `📅 Ngày ${formatDateDisplay(d)}`;
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

// 10. Hiển thị Danh Sách Cảnh Báo Thép Hình (Tab 3)
function renderShapeWarnings() {
    const container = document.getElementById('shape-warnings-container');
    if (!state.projectData || !container) return;

    const warnings = state.projectData.shape_warnings || [];
    if (warnings.length === 0) {
        container.innerHTML = `
            <div class="text-center py-12 bg-white border border-slate-200 rounded-2xl text-slate-500 shadow-xs">
                <i data-lucide="check-circle-2" class="w-10 h-10 mx-auto mb-2 text-emerald-500"></i>
                <p class="font-medium text-slate-700">Tuyệt vời! Không có cảnh báo vướng mắc chiều dài phôi cắt Thép hình (Shape).</p>
            </div>
        `;
        lucide.createIcons();
        return;
    }

    container.innerHTML = `
        <div class="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
            <div class="p-4 bg-orange-50/80 border-b border-orange-200 flex items-center justify-between">
                <div class="flex items-center gap-2 text-orange-950 font-bold text-sm">
                    <i data-lucide="alert-triangle" class="w-4 h-4 text-orange-600"></i>
                    <span>Danh Sách Chi Tiết Thép Hình Chưa Nhận Do Chiều Dài Cắt (${warnings.length} chi tiết)</span>
                </div>
            </div>
            <div class="overflow-x-auto">
                <table class="w-full text-left text-xs border-collapse">
                    <thead>
                        <tr class="bg-slate-100 text-slate-700 border-b border-slate-200 font-bold uppercase text-[11px]">
                            <th class="py-2.5 px-3">Cấu Kiện</th>
                            <th class="py-2.5 px-3">Mã BTP (Chi tiết)</th>
                            <th class="py-2.5 px-3">Quy Cách (Size)</th>
                            <th class="py-2.5 px-3 text-right">Dài TK (mm)</th>
                            <th class="py-2.5 px-3 text-right">SL Cần</th>
                            <th class="py-2.5 px-3">Mã Phôi Cắt (Cutting No)</th>
                            <th class="py-2.5 px-3 text-right">SL Phôi</th>
                            <th class="py-2.5 px-3">Nguyên Nhân / Cảnh Báo</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-200">
                        ${warnings.map(w => `
                            <tr class="hover:bg-orange-50/40">
                                <td class="py-2.5 px-3 font-mono font-bold text-slate-900">${w.assembly_no}</td>
                                <td class="py-2.5 px-3 font-mono font-bold text-blue-700">${w.part_name}</td>
                                <td class="py-2.5 px-3 font-mono">${w.size}</td>
                                <td class="py-2.5 px-3 text-right font-mono font-bold text-orange-700">${w.design_length || '-'}</td>
                                <td class="py-2.5 px-3 text-right font-mono font-bold">${w.tqty}</td>
                                <td class="py-2.5 px-3 font-mono font-bold text-slate-700">${w.cutting_no || '-'}</td>
                                <td class="py-2.5 px-3 text-right font-mono font-bold text-slate-700">${w.qty_cutting || '-'}</td>
                                <td class="py-2.5 px-3 text-orange-900 font-medium">${w.message}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    `;
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

        // Sheet 1: Bảng tổng hợp
        const ws1 = XLSX.utils.aoa_to_sheet([s1Headers, ...s1Rows]);
        ws1['!cols'] = [
            { wch: 18 }, { wch: 18 }, { wch: 20 }, { wch: 18 }, { wch: 20 },
            { wch: 20 }, { wch: 16 }, { wch: 18 }, { wch: 22 }, { wch: 18 },
            { wch: 18 }, { wch: 16 }, { wch: 22 }, { wch: 20 }
        ];
        XLSX.utils.book_append_sheet(wb, ws1, "TongHop_PhanTich_Thieu");

        // Sheet 2: Danh sách chi tiết
        const ws2 = XLSX.utils.aoa_to_sheet([s2Headers, ...s2Rows]);
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
    // Đổi File Dự Án
    const selectProject = document.getElementById('select-project');
    if (selectProject) {
        selectProject.addEventListener('change', (e) => {
            if (e.target.value) {
                loadProjectData(e.target.value);
            }
        });
    }

    // Đổi Hạng Mục (Sheet)
    const selectSheet = document.getElementById('select-sheet');
    if (selectSheet) {
        selectSheet.addEventListener('change', (e) => {
            state.selectedSheet = e.target.value;
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
    const btnToggleFilter = document.getElementById('btn-toggle-filter');
    const btnExpandFilter = document.getElementById('btn-expand-filter');
    const btnCompactCal = document.getElementById('btn-compact-calendar');

    if (btnToggleFilter) {
        btnToggleFilter.addEventListener('click', () => toggleFilterCollapse());
    }
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

        if (tabName === 'timeline') renderDailyTimeline();
        if (tabName === 'shape') renderShapeWarnings();
        if (tabName === 'dvg') renderDvgAnalytics();
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
}
