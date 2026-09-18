"""
Script tái cấu trúc Tab Tiến Độ Công Đoạn (QLDA):
- Đẩy toàn bộ hệ thống biểu đồ (Line thực tế vs kế hoạch, BTP Doughnut/Bar, Gantt Timeline)
  vào làm 1 tab con/tab riêng tiếp theo ngay trong Tiến Độ Công Đoạn Chế Tạo.
- Đồng bộ tuyệt đối: Khi thay đổi Hạng mục (hoặc Tổ, Trạng thái, Tìm kiếm), cả 7 thẻ KPI
  lẫn tất cả các biểu đồ đều nhảy số liệu tức thì tương ứng với Hạng mục đó.
- Giữ nguyên 100% biểu đồ ở tab Phân Tích DVG & Đơn Vị Giao.
"""

import os
import re

import os
import sys
import re

if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if sys.stderr and hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
INDEX_PATH = os.path.join(BASE_DIR, "frontend", "index.html")
APP_JS_PATH = os.path.join(BASE_DIR, "frontend", "app.js")

def refactor_index_html():
    print("[1/2] Cập nhật frontend/index.html...")
    with open(INDEX_PATH, "r", encoding="utf-8") as f:
        html = f.read()

    # 1. Đảm bảo phiên bản cache-busting v=3.6.0
    html = re.sub(r'app\.js\?v=[\d\.]+', 'app.js?v=3.6.0', html)
    html = re.sub(r'style\.css\?v=[\d\.]+', 'style.css?v=3.6.0', html)

    # 2. Cập nhật nút tab trên thanh điều hướng chính
    # Giữ Tab 3 (DVG) nguyên vẹn 100%!
    # Tab 4: Tiến Độ Công Đoạn (QLDA)
    # Tab 5: Biểu Đồ Tiến Độ (QLDA) - dẫn trực tiếp vào subtab biểu đồ
    nav_tabs_old = """            <button class="nav-tab px-3 sm:px-4 py-2 sm:py-2.5 font-bold text-xs sm:text-sm text-slate-500 hover:text-slate-800 border-b-2 border-transparent flex items-center gap-1.5 sm:gap-2 whitespace-nowrap shrink-0 cursor-pointer transition" data-tab="dashboard" id="btn-tab-dashboard">
                <i data-lucide="layout-dashboard" class="w-3.5 h-3.5 sm:w-4 sm:h-4 text-purple-600 shrink-0"></i>
                <span class="sm:inline hidden">Dashboard & Biểu Đồ Tiến Độ</span>
                <span class="sm:hidden inline">Dashboard</span>
                <span class="px-1.5 py-0.2 rounded-full text-[10px] bg-purple-50 text-purple-700 font-extrabold border border-purple-200">Hot</span>
            </button>"""

    nav_tabs_new = """            <button class="nav-tab px-3 sm:px-4 py-2 sm:py-2.5 font-bold text-xs sm:text-sm text-slate-500 hover:text-slate-800 border-b-2 border-transparent flex items-center gap-1.5 sm:gap-2 whitespace-nowrap shrink-0 cursor-pointer transition" data-tab="dashboard" id="btn-tab-dashboard" title="Xem biểu đồ line thực tế/kế hoạch, BTP và Gantt tiến độ công đoạn">
                <i data-lucide="line-chart" class="w-3.5 h-3.5 sm:w-4 sm:h-4 text-purple-600 shrink-0"></i>
                <span class="sm:inline hidden">Biểu Đồ Tiến Độ Công Đoạn</span>
                <span class="sm:hidden inline">Biểu Đồ QLDA</span>
                <span class="px-1.5 py-0.2 rounded-full text-[10px] bg-purple-50 text-purple-700 font-extrabold border border-purple-200">Dashboard</span>
            </button>"""

    if nav_tabs_old in html:
        html = html.replace(nav_tabs_old, nav_tabs_new)
        print("  -> Đã cập nhật tiêu đề tab Dashboard trên thanh điều hướng")

    # 3. Trích xuất phần biểu đồ từ tab-dashboard-content
    # Tìm vùng bắt đầu của tab-dashboard-content
    tab5_marker = '<!-- TAB 5: DASHBOARD PHÂN TÍCH & BIỂU ĐỒ TIẾN ĐỘ -->'
    idx_tab5 = html.find(tab5_marker)
    if idx_tab5 == -1:
        print("  [!] Không tìm thấy tab-dashboard-content, có thể đã được refactor trước đó.")
        return

    idx_end_main = html.find('</main>', idx_tab5)
    tab5_raw = html[idx_tab5:idx_end_main]

    # Tìm phần nội dung bên trong <section id="tab-dashboard-content" ...> ... </section>
    sec_start = tab5_raw.find('<section id="tab-dashboard-content"')
    sec_open_end = tab5_raw.find('>', sec_start) + 1
    sec_close = tab5_raw.rfind('</section>')
    dash_inner = tab5_raw[sec_open_end:sec_close].strip()

    # Thay thế phần header của dashboard bên trong để loại bỏ các select dư thừa (dự án, hạng mục, tổ đã có ở trên)
    # Giữ lại các input/select cần thiết cho biểu đồ: dash-select-month, dash-btn-mode-scurve, dash-btn-mode-daily, dash-input-target-tons, dash-btn-apply-target, btn-dash-refresh
    old_dash_header_pattern = re.compile(r'<div class="bg-gradient-to-r from-slate-900 via-indigo-950 to-purple-950.*?</div>\s*</div>\s*</div>', re.DOTALL)

    new_dash_header = """<div class="bg-gradient-to-r from-slate-900 via-indigo-950 to-purple-950 text-white p-4 sm:p-5 rounded-3xl shadow-md border border-slate-700/50">
                <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <div class="flex items-center gap-3">
                        <div class="w-11 h-11 rounded-2xl bg-purple-500/20 border border-purple-400/30 flex items-center justify-center text-purple-300 shrink-0">
                            <i data-lucide="line-chart" class="w-6 h-6"></i>
                        </div>
                        <div>
                            <div class="flex items-center gap-2 flex-wrap">
                                <h3 class="text-base sm:text-lg font-bold tracking-tight">Biểu Đồ Tiến Độ Công Đoạn Chế Tạo</h3>
                                <span id="dash-project-badge" class="text-xs px-2.5 py-0.5 rounded-full bg-purple-500/20 text-purple-200 border border-purple-400/30 font-semibold font-mono">Dự Án: A320</span>
                                <span id="dash-scope-badge" class="text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-200 border border-emerald-400/30 font-semibold font-mono">Hạng mục: Tất cả</span>
                            </div>
                            <p class="text-xs text-slate-300 mt-0.5">Biểu đồ so sánh Kế hoạch / Thực tế Gá & Hàn theo ngày • Tình trạng Bán Thành Phẩm (BTP) • Biểu đồ Grant tiến độ</p>
                        </div>
                    </div>

                    <!-- Nút thao tác nhanh -->
                    <div class="flex items-center gap-2 flex-wrap">
                        <button id="btn-dash-refresh" type="button" class="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 active:bg-white/30 text-white border border-white/15 rounded-xl text-xs font-semibold transition cursor-pointer shadow-2xs">
                            <i data-lucide="refresh-cw" class="w-3.5 h-3.5"></i>
                            <span>Làm mới biểu đồ</span>
                        </button>
                    </div>
                </div>

                <!-- Thanh Điều Khiển Biểu Đồ (Tháng, Chế độ, Mục tiêu) -->
                <div class="mt-4 pt-4 border-t border-white/10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    <!-- 1. Chọn Tháng/Năm -->
                    <div>
                        <label class="block text-[11px] font-bold text-slate-300 mb-1 flex items-center gap-1">
                            <i data-lucide="calendar" class="w-3 h-3 text-amber-400"></i>
                            <span>Tháng / Năm Phân Tích</span>
                        </label>
                        <select id="dash-select-month" class="w-full bg-slate-800/90 text-white border border-slate-600 rounded-xl px-3 py-2 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-amber-400 cursor-pointer">
                            <!-- Nạp động -->
                        </select>
                    </div>

                    <!-- 2. Chế độ xem đường biểu đồ -->
                    <div>
                        <label class="block text-[11px] font-bold text-slate-300 mb-1 flex items-center gap-1">
                            <i data-lucide="sliders" class="w-3 h-3 text-indigo-400"></i>
                            <span>Chế Độ Đường Biểu Đồ</span>
                        </label>
                        <div class="flex items-center gap-1 bg-slate-800/90 border border-slate-600 rounded-xl p-1">
                            <button id="dash-btn-mode-scurve" type="button" class="flex-1 py-1 rounded-lg text-xs font-bold transition cursor-pointer text-center bg-purple-600 text-white shadow-2xs" title="Đường cong lũy kế cộng dồn qua từng ngày trong tháng (S-Curve)">
                                Lũy Kế
                            </button>
                            <button id="dash-btn-mode-daily" type="button" class="flex-1 py-1 rounded-lg text-xs font-bold transition cursor-pointer text-center text-slate-300 hover:text-white" title="Sản lượng thực hiện của từng ngày riêng biệt">
                                Từng Ngày
                            </button>
                        </div>
                    </div>

                    <!-- 3. Mục tiêu kế hoạch -->
                    <div>
                        <label class="block text-[11px] font-bold text-slate-300 mb-1 flex items-center gap-1">
                            <i data-lucide="target" class="w-3 h-3 text-emerald-400"></i>
                            <span>Mục Tiêu Kế Hoạch (Tấn)</span>
                        </label>
                        <div class="flex items-center gap-2">
                            <input type="number" id="dash-input-target-tons" value="50" min="1" max="10000" class="w-full bg-slate-800/90 text-white border border-slate-600 rounded-xl px-3 py-1.5 text-xs font-mono font-bold focus:outline-none focus:ring-2 focus:ring-emerald-400">
                            <button id="dash-btn-apply-target" type="button" class="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition cursor-pointer shadow-2xs shrink-0">
                                Áp Dụng
                            </button>
                        </div>
                    </div>
                </div>
            </div>"""

    # Thay thế phần header cũ trong dash_inner
    dash_inner_updated = old_dash_header_pattern.sub(new_dash_header, dash_inner, count=1)

    # 4. Tạo cấu trúc Sub-Tabs cho QLDA
    matrix_marker = '<!-- BẢNG MA TRẬN TIẾN ĐỘ CẤU KIỆN (ASSEMBLIES PROGRESS MATRIX) -->'
    idx_matrix = html.find(matrix_marker)

    # Đoạn HTML chứa dải chuyển đổi subtab và 2 khung nội dung
    subtab_bar = """<!-- DẢI CHUYỂN ĐỔI CHẾ ĐỘ XEM TRONG TIẾN ĐỘ CÔNG ĐOẠN (SUB-TABS) -->
            <div class="flex items-center justify-between flex-wrap gap-2 pt-1 border-t border-slate-200">
                <div class="inline-flex p-1 bg-slate-200/80 rounded-2xl gap-1 shadow-2xs">
                    <button id="btn-qlda-subtab-matrix" type="button" 
                        class="qlda-subtab-btn active flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition shadow-xs cursor-pointer bg-white text-emerald-800">
                        <i data-lucide="table-2" class="w-4 h-4 text-emerald-600"></i>
                        <span>1. Ma Trận Tiến Độ Chi Tiết</span>
                        <span id="qlda-badge-subview-count" class="px-2 py-0.5 rounded-full text-[10px] bg-emerald-100 text-emerald-800 font-mono font-bold">0 CK</span>
                    </button>

                    <button id="btn-qlda-subtab-charts" type="button" 
                        class="qlda-subtab-btn flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition cursor-pointer text-slate-600 hover:text-slate-900 hover:bg-white/60">
                        <i data-lucide="line-chart" class="w-4 h-4 text-purple-600"></i>
                        <span>2. Biểu Đồ Tiến Độ Công Đoạn</span>
                        <span class="px-2 py-0.5 rounded-full text-[10px] bg-purple-100 text-purple-700 font-extrabold border border-purple-200">Dashboard</span>
                    </button>
                </div>

                <div class="flex items-center gap-2">
                    <span class="text-xs text-slate-500 font-medium hidden md:inline">Đang xem phạm vi: <b id="qlda-current-scope-label" class="text-slate-800 font-mono">Tất cả hạng mục</b></span>
                </div>
            </div>

            <!-- KHUNG 1: MA TRẬN TIẾN ĐỘ CHI TIẾT CẤU KIỆN -->
            <div id="qlda-pane-matrix" class="space-y-4">"""

    # Tìm vị trí đóng của qlda-matrix-card
    idx_close_matrix = html.find('</div>\n        </section>', idx_matrix)
    if idx_close_matrix == -1:
        idx_close_matrix = html.find('</div>\r\n        </section>', idx_matrix)

    # Đóng qlda-pane-matrix và mở qlda-pane-charts chứa toàn bộ biểu đồ
    pane_charts_wrapper = f"""</div>
            </div>

            <!-- KHUNG 2: TẤT CẢ BIỂU ĐỒ TIẾN ĐỘ CÔNG ĐOẠN CHẾ TẠO -->
            <div id="qlda-pane-charts" class="space-y-4 hidden">
                {dash_inner_updated}
            </div>"""

    # Cắt ghép lại index.html
    part_before = html[:idx_matrix]
    matrix_content = html[idx_matrix:idx_close_matrix]
    part_after = html[idx_end_main:] # Bắt đầu từ </main>

    new_html = part_before + subtab_bar + "\n            " + matrix_content + "\n" + pane_charts_wrapper + "\n        </section>\n    " + part_after

    with open(INDEX_PATH, "w", encoding="utf-8") as f:
        f.write(new_html)
    print("  -> Đã tái cấu trúc frontend/index.html thành công!")

if __name__ == "__main__":
    refactor_index_html()
