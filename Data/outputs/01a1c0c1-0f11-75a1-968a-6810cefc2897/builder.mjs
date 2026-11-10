import fs from "node:fs/promises";
import { Workbook, SpreadsheetFile } from "@oai/artifact-tool";

const outDir="D:/Tool/Server_Leo_Nguyen/Data/outputs/01a1c0c1-0f11-75a1-968a-6810cefc2897";
const source=JSON.parse(await fs.readFile(outDir+"/bom_data.json","utf8"));
const records=source.rows;
const projectCodes=[...new Set(records.map(r=>r.project_code))].sort();
const projectName=new Map();for(const r of records)if(!projectName.has(r.project_code)&&r.project_name)projectName.set(r.project_code,r.project_name);
const byNo=new Map(),byProjectNo=new Map();
const signatureGlobal=r=>JSON.stringify([r.project_code,r.project_name,r.item_name,r.description,r.drawing_number,r.assembly_size,r.set,r.unit_weight_kg,r.total_weight_kg]);
const signatureLocal=r=>JSON.stringify([r.project_name,r.item_name,r.description,r.drawing_number,r.assembly_size,r.set,r.unit_weight_kg,r.total_weight_kg]);
for(const r of records){
 const a=byNo.get(r.assembly_no)||new Set();a.add(signatureGlobal(r));byNo.set(r.assembly_no,a);
 const k=r.project_code+"|"+r.assembly_no,b=byProjectNo.get(k)||new Set();b.add(signatureLocal(r));byProjectNo.set(k,b);
}
const font="Arial",dark="#1F4E78",medium="#4472C4",light="#D9EAF7",pale="#F4F7FB",inputFill="#FFF2CC",border="#D5DEE8",ink="#243447";
const statuses=["Hoàn thành","Chưa hoàn thành","Đang thiếu vật tư","Đang chuẩn bị vật tư"];
const crews=["Kỹ thuật","Tổ sắt","S1 Vinh","S2 Phúc","S3 Quyền","S4 Hoàng Anh"];
const dailyCount=8,plansPerDaily=50,planFirst=5,planLast=54,daysPerPlan=31,rowsPerDaily=plansPerDaily*daysPerPlan;
const dailyNames=Array.from({length:dailyCount},(_,i)=>"Daily "+String(i+1).padStart(2,"0"));
const taskTitle=57,taskHeader=59,taskFirst=60,taskLast=taskFirst+rowsPerDaily-1,totalTasks=dailyCount*rowsPerDaily;
const sumHeader=34,sumFirst=35,sumLast=sumFirst+totalTasks-1,bomFirst=5,bomLast=bomFirst+records.length-1;
function col(n){let s="";while(n>0){const r=(n-1)%26;s=String.fromCharCode(65+r)+s;n=Math.floor((n-1)/26);}return s;}
function val(v){return v===undefined||v===null||v===""?null:(typeof v==="number"||typeof v==="boolean"?v:String(v));}
function header(r){r.format={fill:dark,font:{name:font,size:10,bold:true,color:"#FFFFFF"},horizontalAlignment:"center",verticalAlignment:"center",wrapText:true};}
function title(sh,t,n){sh.getRange(t).format={font:{name:font,size:14,bold:true,color:dark},verticalAlignment:"center"};sh.getRange(n).format={font:{name:font,size:9,italic:true,color:"#5B6573"},verticalAlignment:"center",wrapText:true};}

const wb=Workbook.create();
const summary=wb.worksheets.add("Tổng hợp");
const daily=dailyNames.map(n=>wb.worksheets.add(n));
const bom=wb.worksheets.add("BOM Assembly");
const lists=wb.worksheets.add("Danh mục");
const guide=wb.worksheets.add("Hướng dẫn");
for(const sh of [summary,...daily,bom,lists,guide])sh.showGridLines=false;

// Main Assembly source, plus stable lookup keys and ambiguity counts.
bom.getRange("A1:T2").values=[
 ["BOM CẤU KIỆN CHÍNH",null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null],
 ["Nguồn: "+source.source_sheets.length+" sheet ASSEMBLY PART LIST, "+projectCodes.length+" dự án. Chỉ giữ dòng Assembly chính; các dòng Part con đã loại.",null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]
];
bom.mergeCells("A1:T1");bom.mergeCells("A2:T2");
const bomHeaders=["Assembly ID","Mã dự án","Tên dự án","Hạng mục / Item","Assembly No.","Tên cấu kiện chính","Drawing Number","Kích thước","Set","U.Weight (kg)","T.Weight (kg)","File nguồn","Sheet nguồn","Dòng BOM","Mã tra cứu","Số dòng gộp","Khóa dự án + sheet + Assembly No.","Khóa dự án + Assembly No.","Biến thể theo Assembly No.","Biến thể theo dự án + Assembly No."];
bom.getRange("A4:T4").values=[bomHeaders];
const bomValues=records.map(r=>[
 r.assembly_id,r.project_code,r.project_name,r.item_name,r.assembly_no,r.description,r.drawing_number,r.assembly_size,val(r.set),val(r.unit_weight_kg),val(r.total_weight_kg),r.source_file,r.source_sheet,Number(r.source_row),
 r.project_code+" | "+r.source_sheet+" | "+r.assembly_no+" | "+r.description,Number(r.source_row_count||1),
 r.project_code+"|"+r.source_sheet+"|"+r.assembly_no,r.project_code+"|"+r.assembly_no,
 byNo.get(r.assembly_no).size,byProjectNo.get(r.project_code+"|"+r.assembly_no).size
]);
bom.getRange("A"+bomFirst+":T"+bomLast).values=bomValues;
title(bom,"A1:T1","A2:T2");header(bom.getRange("A4:T4"));
bom.getRange("A1:T2").format.rowHeight=25;bom.getRange("A4:T4").format.rowHeight=42;
bom.getRange("A"+bomFirst+":T"+bomLast).format={font:{name:font,size:9,color:ink},verticalAlignment:"center"};
bom.getRange("I"+bomFirst+":I"+bomLast).format.numberFormat="#,##0";bom.getRange("J"+bomFirst+":K"+bomLast).format.numberFormat="#,##0.0";bom.getRange("N"+bomFirst+":N"+bomLast).format.numberFormat="0";bom.getRange("P"+bomFirst+":T"+bomLast).format.numberFormat="0";
[34,13,34,30,22,30,32,23,12,14,14,34,22,11,58,12,42,34,20,24].forEach((w,i)=>bom.getRange(col(i+1)+":"+col(i+1)).format.columnWidth=w);
bom.freezePanes.freezeRows(4);
const bomTable=bom.tables.add("A4:T"+bomLast,true,"MainAssemblyTable");bomTable.showFilterButton=true;

// Lists provide typed project codes and an editable team list.
lists.getRange("A1:B1").values=[["Mã dự án","Tên dự án"]];
lists.getRange("A2:B"+(projectCodes.length+1)).values=projectCodes.map(p=>[p,projectName.get(p)||p]);
lists.getRange("D1").values=[["Tổ / nhóm thực hiện"]];
lists.getRange("D2:D"+(crews.length+1)).values=crews.map(x=>[x]);
lists.getRange("D"+(crews.length+2)+":D31").values=Array.from({length:30-crews.length},()=>[null]);
lists.getRange("F1:F5").values=[["Tình trạng Daily Task"],...statuses.map(s=>[s])];
lists.getRange("H1:H7").values=[["Ghi chú"],["Nhập Assembly No. vào kế hoạch."],["Mã dự án và sheet nguồn chỉ nhập khi bảng báo mã bị trùng."],["Mã dự án có thể tra ở cột A."],["Sheet nguồn xem ở cột M của BOM Assembly."],["Thêm tổ/nhóm trong cột D."],["Không cần chọn dự án trước."]];
lists.getRange("A1:H1").format={fill:dark,font:{name:font,size:10,bold:true,color:"#FFFFFF"},horizontalAlignment:"center",verticalAlignment:"center",wrapText:true};
lists.getRange("A2:H31").format={font:{name:font,size:9,color:ink},verticalAlignment:"center"};
lists.getRange("A:A").format.columnWidth=15;lists.getRange("B:B").format.columnWidth=38;lists.getRange("D:D").format.columnWidth=26;lists.getRange("F:F").format.columnWidth=32;lists.getRange("H:H").format.columnWidth=52;
lists.getRange("H1:H7").format.wrapText=true;lists.freezePanes.freezeRows(1);
const teamSource="'Danh mục'!$D$2:$D$31";

// Manual Assembly No. lookup. Project and source sheet are typed only for ambiguous codes.
const planHeaders=["Plan ID","Assembly No. nhập tay","Mã dự án (nếu trùng)","Sheet nguồn (nếu vẫn trùng)","Mã dự án tra ra","Tên cấu kiện chính","Drawing Number","KL BOM (kg)","Từ ngày","Đến ngày","Tổ/nhóm thực hiện","KL KH override (kg)","KL KH/ngày (kg)","Số ngày","Tra cứu Assembly No.","Tình trạng kế hoạch","Ghi chú"];
const taskHeaders=["Ngày","Quản lý phụ trách","Tổ/nhóm thực hiện","Mã dự án","Assembly No.","Tên cấu kiện chính","Drawing Number","KL kế hoạch (kg)","Tình trạng","Ghi chú"];
function makeLookupExpr(r,returnRange){
 const q="'BOM Assembly'!$Q$"+bomFirst+":$Q$"+bomLast;
 const pr="'BOM Assembly'!$R$"+bomFirst+":$R$"+bomLast;
 const no="'BOM Assembly'!$E$"+bomFirst+":$E$"+bomLast;
 return "IF($D"+r+"<>\"\",XLOOKUP($C"+r+"&\"|\"&$D"+r+"&\"|\"&$B"+r+","+q+","+returnRange+",\"\",0),IF($C"+r+"<>\"\",XLOOKUP($C"+r+"&\"|\"&$B"+r+","+pr+","+returnRange+",\"\",0),XLOOKUP($B"+r+","+no+","+returnRange+",\"\",0)))";
}
for(let d=0;d<dailyCount;d++){
 const sh=daily[d],n=dailyNames[d];
 sh.getRange("A1:Q2").values=[
  ["KẾ HOẠCH SẢN XUẤT VÀ DAILY TASK",null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null],
  ["Nhập Assembly No. để tự tra BOM. Nếu báo trùng, nhập thêm mã dự án; nếu vẫn trùng, nhập Sheet nguồn. Ngày hỗ trợ tối đa 31 ngày mỗi dòng.",null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]
 ];
 sh.mergeCells("A1:Q1");sh.mergeCells("A2:Q2");
 sh.getRange("A3:B3").values=[["QL:","Người "+String(d+1).padStart(2,"0")]];
 sh.getRange("A3").format={font:{name:font,size:10,bold:true,color:dark},verticalAlignment:"center"};
 sh.getRange("B3").format={fill:inputFill,font:{name:font,size:10,bold:true,color:dark},verticalAlignment:"center"};
 sh.getRange("A4:Q4").values=[planHeaders];
 const formulas=[];
 for(let r=planFirst;r<=planLast;r++){
  const noRange="'BOM Assembly'!$E$"+bomFirst+":$E$"+bomLast;
  const pKey="'BOM Assembly'!$R$"+bomFirst+":$R$"+bomLast;
  const fullKey="'BOM Assembly'!$Q$"+bomFirst+":$Q$"+bomLast;
  const globalVariants="'BOM Assembly'!$S$"+bomFirst+":$S$"+bomLast;
  const localVariants="'BOM Assembly'!$T$"+bomFirst+":$T$"+bomLast;
  const projectRange="'BOM Assembly'!$B$"+bomFirst+":$B$"+bomLast;
  const globalCount="XLOOKUP($B"+r+","+noRange+","+globalVariants+",0,0)";
  const localCount="XLOOKUP($C"+r+"&\"|\"&$B"+r+","+pKey+","+localVariants+",0,0)";
  const autoProject="=IF($B"+r+"=\"\",\"\",IF($C"+r+"<>\"\",IF(COUNTIF("+pKey+",$C"+r+"&\"|\"&$B"+r+")>0,$C"+r+",\"\"),IF("+globalCount+"=1,XLOOKUP($B"+r+","+noRange+","+projectRange+",\"\",0),\"\")))";
  const lookupStatus="=IF($B"+r+"=\"\",\"\",IF(COUNTIF("+noRange+",$B"+r+")=0,\"Không tìm thấy Assembly No.\",IF(AND($D"+r+"<>\"\",$C"+r+"=\"\"),\"Nhập mã dự án trước\",IF($C"+r+"=\"\",IF("+globalCount+">1,\"Mã trùng: nhập mã dự án\",\"Sẵn sàng\"),IF(COUNTIF("+pKey+",$C"+r+"&\"|\"&$B"+r+")=0,\"Mã dự án không khớp\",IF($D"+r+"=\"\",IF("+localCount+">1,\"Mã trùng trong dự án: nhập Sheet nguồn\",\"Sẵn sàng\"),IF(COUNTIF("+fullKey+",$C"+r+"&\"|\"&$D"+r+"&\"|\"&$B"+r+")=0,\"Sheet nguồn không khớp\",\"Sẵn sàng\")))))))";
  const lookup=(range)=>"=IF($O"+r+"<>\"Sẵn sàng\",\"\",IFERROR("+makeLookupExpr(r,range)+",\"\"))";
  formulas.push([
   "=IF($B"+r+"=\"\",\"\",ROW()-4)",null,null,null,autoProject,
   lookup("'BOM Assembly'!$F$"+bomFirst+":$F$"+bomLast),
   lookup("'BOM Assembly'!$G$"+bomFirst+":$G$"+bomLast),
   lookup("'BOM Assembly'!$K$"+bomFirst+":$K$"+bomLast),
   null,null,null,null,
   "=IF($P"+r+"<>\"Sẵn sàng\",\"\",IF(ISNUMBER($L"+r+"),$L"+r+",$H"+r+")/$N"+r+")",
   "=IF(OR($I"+r+"=\"\",$J"+r+"=\"\",$J"+r+"<$I"+r+"),\"\",$J"+r+"-$I"+r+"+1)",
   lookupStatus,
   "=IF($B"+r+"=\"\",\"\",IF($O"+r+"<>\"Sẵn sàng\",$O"+r+",IF(OR($I"+r+"=\"\",$J"+r+"=\"\"),\"Chọn khoảng ngày\",IF($J"+r+"<$I"+r+",\"Ngày kết thúc trước ngày bắt đầu\",IF($N"+r+">31,\"Thời lượng tối đa 31 ngày\",IF($K"+r+"=\"\",\"Chọn tổ/nhóm\",IF(AND(NOT(ISNUMBER($L"+r+")),NOT(ISNUMBER($H"+r+"))),\"Thiếu khối lượng\",\"Sẵn sàng\")))))))",
   null
  ]);
 }
 sh.getRange("A"+planFirst+":Q"+planLast).formulas=formulas;
 title(sh,"A1:Q1","A2:Q2");sh.getRange("A1:Q2").format.rowHeight=27;
 header(sh.getRange("A4:Q4"));sh.getRange("A4:Q4").format.rowHeight=42;
 sh.getRange("A"+planFirst+":Q"+planLast).format={font:{name:font,size:9,color:ink},verticalAlignment:"center"};
 for(const rg of ["B"+planFirst+":D"+planLast,"I"+planFirst+":L"+planLast,"Q"+planFirst+":Q"+planLast])sh.getRange(rg).format.fill=inputFill;
 for(const rg of ["A"+planFirst+":A"+planLast,"E"+planFirst+":H"+planLast,"M"+planFirst+":P"+planLast])sh.getRange(rg).format.fill=pale;
 sh.getRange("H"+planFirst+":H"+planLast).format.numberFormat="#,##0.0";
 sh.getRange("I"+planFirst+":J"+planLast).format.numberFormat="dd/mm/yyyy";
 sh.getRange("L"+planFirst+":M"+planLast).format.numberFormat="#,##0.0";
 sh.getRange("N"+planFirst+":N"+planLast).format.numberFormat="0";
 [10,24,18,22,14,28,30,15,13,13,24,18,18,10,36,32,34].forEach((w,i)=>sh.getRange(col(i+1)+":"+col(i+1)).format.columnWidth=w);
 sh.freezePanes.freezeRows(4);
 sh.getRange("I"+planFirst+":I"+planLast).dataValidation={rule:{type:"date",operator:"between",formula1:"=DATE(2020,1,1)",formula2:"=DATE(2100,12,31)"}};
 sh.getRange("J"+planFirst+":J"+planLast).dataValidation={rule:{type:"date",operator:"between",formula1:"=$I5",formula2:"=DATE(2100,12,31)"}};
 sh.getRange("K"+planFirst+":K"+planLast).dataValidation={rule:{type:"list",formula1:teamSource}};
 sh.getRange("L"+planFirst+":L"+planLast).dataValidation={rule:{type:"decimal",operator:"between",formula1:0,formula2:1000000000}};
 sh.getRange("O"+planFirst+":O"+planLast).conditionalFormats.add("containsText",{text:"Nhập mã",format:{fill:"#FFF2CC",font:{color:"#7F6000",bold:true}}});
 sh.getRange("O"+planFirst+":O"+planLast).conditionalFormats.add("containsText",{text:"không khớp",format:{fill:"#FCE8E6",font:{color:"#B91C1C",bold:true}}});
 sh.getRange("P"+planFirst+":P"+planLast).conditionalFormats.add("containsText",{text:"Sẵn sàng",format:{fill:"#E2F0D9",font:{color:"#38761D",bold:true}}});
 sh.getRange("P"+planFirst+":P"+planLast).conditionalFormats.add("containsText",{text:"Thiếu",format:{fill:"#FCE8E6",font:{color:"#B91C1C",bold:true}}});
 sh.getRange("A"+taskTitle+":J"+taskTitle).merge();sh.getRange("A"+taskTitle).values=[["DAILY TASK TỰ SINH"]];
 sh.getRange("A58:J58").merge();sh.getRange("A58").values=[["Chọn tình trạng và ghi chú. Quản lý lấy từ B3; tổ/nhóm thực hiện lấy từ kế hoạch phía trên."]];
 title(sh,"A57:J57","A58:J58");sh.getRange("A57:J57").format.fill=light;sh.getRange("A57:J58").format.rowHeight=25;
 sh.getRange("A59:J59").values=[taskHeaders];header(sh.getRange("A59:J59"));sh.getRange("A59:J59").format.rowHeight=38;
 const taskFormulas=[];
 for(let i=0;i<rowsPerDaily;i++){
  const row=taskFirst+i,pr=planFirst+Math.floor(i/daysPerPlan),off=i%daysPerPlan;
  taskFormulas.push([
   "=IF('"+n+"'!$P"+pr+"<>\"Sẵn sàng\",\"\",IF('"+n+"'!$I"+pr+"+"+off+">'"+n+"'!$J"+pr+",\"\",'"+n+"'!$I"+pr+"+"+off+"))",
   "=IF($A"+row+"=\"\",\"\",'"+n+"'!$B$3)",
   "=IF($A"+row+"=\"\",\"\",'"+n+"'!$K"+pr+")",
   "=IF($A"+row+"=\"\",\"\",'"+n+"'!$E"+pr+")",
   "=IF($A"+row+"=\"\",\"\",'"+n+"'!$B"+pr+")",
   "=IF($A"+row+"=\"\",\"\",'"+n+"'!$F"+pr+")",
   "=IF($A"+row+"=\"\",\"\",'"+n+"'!$G"+pr+")",
   "=IF($A"+row+"=\"\",\"\",IF("+off+"='"+n+"'!$N"+pr+"-1,IF(ISNUMBER('"+n+"'!$L"+pr+"),'"+n+"'!$L"+pr+",'"+n+"'!$H"+pr+")-'"+n+"'!$M"+pr+"*('"+n+"'!$N"+pr+"-1),'"+n+"'!$M"+pr+"))",
   null,null
  ]);
 }
 sh.getRange("A"+taskFirst+":J"+taskLast).formulas=taskFormulas;
 sh.getRange("A"+taskFirst+":J"+taskLast).format={font:{name:font,size:9,color:ink},verticalAlignment:"center"};
 sh.getRange("I"+taskFirst+":J"+taskLast).format.fill=inputFill;sh.getRange("A"+taskFirst+":H"+taskLast).format.fill=pale;
 sh.getRange("A"+taskFirst+":A"+taskLast).format.numberFormat="dd/mm/yyyy";sh.getRange("H"+taskFirst+":H"+taskLast).format.numberFormat="#,##0.0";
 sh.getRange("I"+taskFirst+":I"+taskLast).dataValidation={rule:{type:"list",values:statuses}};
 sh.getRange("I"+taskFirst+":I"+taskLast).conditionalFormats.add("containsText",{text:"Hoàn thành",format:{fill:"#E2F0D9",font:{color:"#38761D",bold:true}}});
 sh.getRange("I"+taskFirst+":I"+taskLast).conditionalFormats.add("containsText",{text:"Chưa hoàn thành",format:{fill:"#FFF2CC",font:{color:"#7F6000"}}});
 sh.getRange("I"+taskFirst+":I"+taskLast).conditionalFormats.add("containsText",{text:"thiếu vật tư",format:{fill:"#FCE8E6",font:{color:"#B91C1C",bold:true}}});
 sh.getRange("I"+taskFirst+":I"+taskLast).conditionalFormats.add("containsText",{text:"chuẩn bị vật tư",format:{fill:"#DDEBF7",font:{color:"#1F4E78",bold:true}}});
 [13,23,24,13,22,28,30,18,25,36].forEach((w,i)=>sh.getRange(col(i+1)+":"+col(i+1)).format.columnWidth=w);
 const pt=sh.tables.add("A4:Q"+planLast,true,"Daily"+String(d+1).padStart(2,"0")+"PlanTable");pt.showFilterButton=true;
 const tt=sh.tables.add("A59:J"+taskLast,true,"Daily"+String(d+1).padStart(2,"0")+"TasksTable");tt.showFilterButton=true;
}

// Summary includes both counts/charts and every daily task as an individual row.
summary.getRange("A1:P2").values=[["TỔNG HỢP KẾ HOẠCH SẢN XUẤT",null,null,null,null,null,null,null,null,null,null,null,null,null,null,null],[""+records.length.toLocaleString("vi-VN")+" cấu kiện chính · "+source.source_sheets.length+" sheet BOM · "+projectCodes.length+" dự án · 8 tab quản lý",null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]];
summary.mergeCells("A1:P1");summary.mergeCells("A2:P2");title(summary,"A1:P1","A2:P2");summary.getRange("A1:P2").format.rowHeight=26;
const cards=[
 ["DAILY TASK ĐƯỢC TẠO","A5","=COUNTIF($A$"+sumFirst+":$A$"+sumLast+",\">0\")","A4:B5"],
 ["HOÀN THÀNH","C5","=COUNTIF($I$"+sumFirst+":$I$"+sumLast+",\"Hoàn thành\")","C4:D5"],
 ["CHƯA HOÀN THÀNH","E5","=COUNTIF($I$"+sumFirst+":$I$"+sumLast+",\"Chưa hoàn thành\")","E4:F5"],
 ["ĐANG THIẾU VẬT TƯ","G5","=COUNTIF($I$"+sumFirst+":$I$"+sumLast+",\"Đang thiếu vật tư\")","G4:H5"],
 ["ĐANG CHUẨN BỊ VẬT TƯ","I5","=COUNTIF($I$"+sumFirst+":$I$"+sumLast+",\"Đang chuẩn bị vật tư\")","I4:J5"],
 ["CHƯA CHỌN TÌNH TRẠNG","K5","=COUNTIFS($A$"+sumFirst+":$A$"+sumLast+",\">0\",$I$"+sumFirst+":$I$"+sumLast+",\"\")","K4:L5"],
 ["KẾ HOẠCH SẴN SÀNG","M5","="+dailyNames.map(n=>"COUNTIF('"+n+"'!$P$"+planFirst+":$P$"+planLast+",\"Sẵn sàng\")").join("+"),"M4:N5"],
 ["NGƯỜI QUẢN LÝ","O5","=COUNTA(D9:D16)","O4:P5"]
];
for(const c of cards){const start=c[3].split(":")[0];summary.getRange(start).values=[[c[0]]];summary.getRange(c[1]).formulas=[[c[2]]];summary.getRange(c[3]).format.fill=pale;summary.getRange(start).format={font:{name:font,size:8,bold:true,color:"#5B6573"},horizontalAlignment:"center",verticalAlignment:"center",wrapText:true};summary.getRange(c[1]).format={font:{name:font,size:15,bold:true,color:dark},horizontalAlignment:"center",verticalAlignment:"center"};summary.getRange(c[3]).format.borders={preset:"outside",style:"thin",color:border};}
summary.getRange("A8:B8").values=[["Tình trạng","Số task"]];
summary.getRange("A9:A13").values=[["Hoàn thành"],["Chưa hoàn thành"],["Đang thiếu vật tư"],["Đang chuẩn bị vật tư"],["Chưa chọn tình trạng"]];
summary.getRange("B9:B12").formulas=statuses.map((_,i)=>["=COUNTIF($I$"+sumFirst+":$I$"+sumLast+",A"+(9+i)+")"]);
summary.getRange("B13").formulas=[["=COUNTIFS($A$"+sumFirst+":$A$"+sumLast+",\">0\",$I$"+sumFirst+":$I$"+sumLast+",\"\")"]];
summary.getRange("D8:E8").values=[["Quản lý Daily Task","Số task"]];
summary.getRange("D9:D16").formulas=dailyNames.map(n=>["='"+n+"'!$B$3"]);
summary.getRange("E9:E16").formulas=dailyNames.map((_,i)=>["=COUNTIFS($B$"+sumFirst+":$B$"+sumLast+",D"+(9+i)+",$A$"+sumFirst+":$A$"+sumLast+",\">0\")"]);
summary.getRange("G8:H8").values=[["Tổ / nhóm thực hiện","Số task"]];
summary.getRange("G9:G38").formulas=Array.from({length:30},(_,i)=>["=IF('Danh mục'!$D$"+(i+2)+"=\"\",\"\",'Danh mục'!$D$"+(i+2)+")"]);
summary.getRange("H9:H38").formulas=Array.from({length:30},(_,i)=>["=IF(G"+(9+i)+"=\"\",\"\",COUNTIF($C$"+sumFirst+":$C$"+sumLast+",G"+(9+i)+"))"]);
for(const rg of ["A8:B8","D8:E8","G8:H8"])header(summary.getRange(rg));
summary.getRange("A9:B13").format={font:{name:font,size:9,color:ink},verticalAlignment:"center"};summary.getRange("A9:A13").format.wrapText=true;
summary.getRange("D9:E16").format={font:{name:font,size:9,color:ink},verticalAlignment:"center"};summary.getRange("G9:H38").format={font:{name:font,size:9,color:ink},verticalAlignment:"center"};
summary.getRange("A:A").format.columnWidth=34;summary.getRange("B:B").format.columnWidth=14;summary.getRange("C:C").format.columnWidth=14;summary.getRange("D:D").format.columnWidth=25;summary.getRange("E:E").format.columnWidth=14;summary.getRange("F:F").format.columnWidth=4;summary.getRange("G:G").format.columnWidth=26;summary.getRange("H:H").format.columnWidth=14;
for(const c of ["I","J","K","L","M","N","O","P"])summary.getRange(c+":"+c).format.columnWidth=14;
const sc=summary.charts.add("bar",summary.getRange("A8:B12"));sc.title="Daily Task theo tình trạng";sc.titleTextStyle.fontSize=12;sc.titleTextStyle.typeface=font;sc.hasLegend=false;sc.xAxis={axisType:"textAxis",textStyle:{typeface:font,fontSize:9}};sc.yAxis={numberFormatCode:"#,##0",numberFormatSourceLinked:false,textStyle:{typeface:font,fontSize:9}};sc.setPosition("A15","H30");if(sc.series.items.length)sc.series.items[0].fill=medium;
const oc=summary.charts.add("bar",summary.getRange("D8:E16"));oc.title="Daily Task theo quản lý";oc.titleTextStyle.fontSize=12;oc.titleTextStyle.typeface=font;oc.hasLegend=false;oc.xAxis={axisType:"textAxis",textStyle:{typeface:font,fontSize:9}};oc.yAxis={numberFormatCode:"#,##0",numberFormatSourceLinked:false,textStyle:{typeface:font,fontSize:9}};oc.setPosition("I15","P30");if(oc.series.items.length)oc.series.items[0].fill="#70AD47";
summary.getRange("A31:P31").merge();summary.getRange("A31").values=[["Bảng phía dưới liệt kê từng task theo ngày từ cả 8 tab Daily; có thể lọc theo quản lý, tổ/nhóm, dự án hoặc tình trạng."]];
summary.getRange("A31:P31").format={font:{name:font,size:9,italic:true,color:"#5B6573"},wrapText:true,verticalAlignment:"center"};summary.getRange("A31:P31").format.rowHeight=28;
summary.getRange("A32:J32").merge();summary.getRange("A32").values=[["DANH SÁCH DAILY TASK TỔNG HỢP"]];summary.getRange("A32:J32").format={font:{name:font,size:12,bold:true,color:dark},verticalAlignment:"center"};
summary.getRange("A33:J33").merge();summary.getRange("A33").values=[["Mỗi dòng là một task trong một ngày. Tình trạng sửa tại tab Daily tương ứng."]];
summary.getRange("A33:J33").format={font:{name:font,size:9,italic:true,color:"#5B6573"},verticalAlignment:"center"};
summary.getRange("A"+sumHeader+":J"+sumHeader).values=[taskHeaders];header(summary.getRange("A"+sumHeader+":J"+sumHeader));summary.getRange("A"+sumHeader+":J"+sumHeader).format.rowHeight=38;
const master=[];
for(let i=0;i<totalTasks;i++){const row=sumFirst+i,d=Math.floor(i/rowsPerDaily),off=i%rowsPerDaily,src=taskFirst+off,n=dailyNames[d];master.push(Array.from({length:10},(_,c)=>{const cc=col(c+1);if(c===8||c===9)return "=IF('"+n+"'!$A"+src+"=\"\",\"\",IFERROR('"+n+"'!$"+cc+src+",\"\"))";return "=IF('"+n+"'!$A"+src+"=\"\",\"\",'"+n+"'!$"+cc+src+")";}));}
summary.getRange("A"+sumFirst+":J"+sumLast).formulas=master;
summary.getRange("A"+sumFirst+":J"+sumLast).format={font:{name:font,size:9,color:ink},verticalAlignment:"center"};summary.getRange("A"+sumFirst+":J"+sumLast).format.fill=pale;
summary.getRange("A"+sumFirst+":A"+sumLast).format.numberFormat="dd/mm/yyyy";summary.getRange("H"+sumFirst+":H"+sumLast).format.numberFormat="#,##0.0";
summary.getRange("I"+sumFirst+":I"+sumLast).conditionalFormats.add("containsText",{text:"Hoàn thành",format:{fill:"#E2F0D9",font:{color:"#38761D",bold:true}}});
summary.getRange("I"+sumFirst+":I"+sumLast).conditionalFormats.add("containsText",{text:"Chưa hoàn thành",format:{fill:"#FFF2CC",font:{color:"#7F6000"}}});
summary.getRange("I"+sumFirst+":I"+sumLast).conditionalFormats.add("containsText",{text:"thiếu vật tư",format:{fill:"#FCE8E6",font:{color:"#B91C1C",bold:true}}});
summary.getRange("I"+sumFirst+":I"+sumLast).conditionalFormats.add("containsText",{text:"chuẩn bị vật tư",format:{fill:"#DDEBF7",font:{color:"#1F4E78",bold:true}}});
[13,23,24,13,22,28,30,18,25,36].forEach((w,i)=>summary.getRange(col(i+1)+":"+col(i+1)).format.columnWidth=w);
const mt=summary.tables.add("A"+sumHeader+":J"+sumLast,true,"MasterDailyTasks");mt.showFilterButton=true;summary.freezePanes.freezeRows(sumHeader);

// Instructions and assigned sheet permissions after conversion to Google Sheets.
guide.getRange("A1:F2").values=[["HƯỚNG DẪN SỬ DỤNG",null,null,null,null,null],["Nhập Assembly No. bằng tay để tra thông tin BOM; bảng Tổng hợp liệt kê từng task của cả 8 người.",null,null,null,null,null]];
guide.mergeCells("A1:F1");guide.mergeCells("A2:F2");title(guide,"A1:F1","A2:F2");
guide.getRange("A4:B14").values=[
 ["Bước","Thao tác"],
 ["1","Trên tab Daily của từng người, sửa tên quản lý ở ô B3."],
 ["2","Nhập đúng Assembly No. vào cột B. Tên cấu kiện chính, bản vẽ, khối lượng BOM và mã dự án tự tra khi mã là duy nhất."],
 ["3","Nếu cột O báo “Mã trùng: nhập mã dự án”, nhập mã dự án chính xác vào cột C. Không cần dropdown."],
 ["4","Nếu cột O vẫn yêu cầu Sheet nguồn, nhập đúng tên sheet BOM vào cột D. Xem danh sách và tên sheet trong BOM Assembly, cột M."],
 ["5","Chọn ngày bắt đầu/kết thúc và tổ thực hiện. Mỗi dòng tối đa 31 ngày lịch."],
 ["6","KL BOM tự lấy. Để trống KL KH override nếu giao toàn bộ cấu kiện cho tổ. Nếu chia cho nhiều tổ, thêm dòng và nhập khối lượng từng phần."],
 ["7","Daily Task tự sinh theo ngày. Chọn một trong bốn tình trạng và nhập ghi chú nếu cần."],
 ["8","Tổng hợp có số đếm, biểu đồ và bảng chi tiết từng task/ngày của cả 8 Daily tab."],
 ["9","Thêm tổ/nhóm mới trong Danh mục, cột D. Quản lý ở B3 và tổ thực hiện theo từng dòng là hai trường riêng."],
 ["Chia sẻ","Sau khi chuyển thành Google Sheets, chia sẻ cho 8 người. Dùng Data > Protect sheets and ranges để chỉ định quyền sửa từng tab Daily và khóa Tổng hợp/BOM/Danh mục. Bảo vệ giới hạn chỉnh sửa, không ẩn dữ liệu."],
];
header(guide.getRange("A4:B4"));guide.getRange("A5:B14").format={font:{name:font,size:10,color:ink},verticalAlignment:"center",wrapText:true};
guide.getRange("A:A").format.columnWidth=18;guide.getRange("B:B").format.columnWidth=112;guide.getRange("A1:F2").format.rowHeight=28;guide.getRange("A4:B14").format.rowHeight=43;guide.getRange("A14:B14").format.rowHeight=65;guide.freezePanes.freezeRows(4);

wb.recalculate();
const checks=[];
checks.push((await wb.inspect({kind:"sheet",include:"id,name"})).ndjson);
checks.push((await wb.inspect({kind:"table",range:"Tổng hợp!A1:P31",include:"values,formulas",tableMaxRows:31,tableMaxCols:16,maxChars:10000})).ndjson);
checks.push((await wb.inspect({kind:"table",range:"Daily 01!A1:Q14",include:"values,formulas",tableMaxRows:14,tableMaxCols:17,maxChars:9000})).ndjson);
checks.push((await wb.inspect({kind:"table",range:"BOM Assembly!A4:T8",include:"values,formulas",tableMaxRows:5,tableMaxCols:20,maxChars:4000})).ndjson);
checks.push((await wb.inspect({kind:"drawing",sheetId:"Tổng hợp",maxChars:3500})).ndjson);
checks.push((await wb.inspect({kind:"match",searchTerm:"#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A|#NUM!|#NULL!|#SPILL!|#CALC!",options:{useRegex:true,maxResults:100},summary:"formula error scan"})).ndjson);
await fs.writeFile(outDir+"/verification_no_dropdown.txt",checks.join("\n\n"),"utf8");
for(const item of [["Tổng hợp","A1:P31","preview_summary_manual.png"],["Daily 01","A1:Q18","preview_daily_plan_manual.png"],["Daily 01","A57:J74","preview_daily_tasks_manual.png"],["BOM Assembly","A1:T10","preview_bom_manual.png"],["Hướng dẫn","A1:F14","preview_guide_manual.png"]]){
 const png=await wb.render({sheetName:item[0],range:item[1],scale:1,format:"png"});
 await fs.writeFile(outDir+"/"+item[2],new Uint8Array(await png.arrayBuffer()));
}
const xlsx=await SpreadsheetFile.exportXlsx(wb);
const outputPath=outDir+"/Ke_hoach_san_xuat_8_nguoi_nhap_Assembly_No.xlsx";
await xlsx.save(outputPath);
console.log(JSON.stringify({outputPath,records:records.length,projects:projectCodes.length,sourceSheets:source.source_sheets.length,globalDuplicateAssemblyGroups:[...byNo.values()].filter(s=>s.size>1).length,projectDuplicateVariants:[...byProjectNo.values()].filter(s=>s.size>1).length,dailySheets:dailyCount,plansPerDaily,masterTaskRows:totalTasks},null,2));

