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
const statuses=["Hoàn thành","Chưa hoàn thành","Thiếu vật tư","Chưa chuẩn bị vật tư","Lý do khác"];
const teams=["Tổ sắt 1","Tổ sắt 2","Tổ sắt 3","Tổ sắt 4"];
const dailyCount=8,rowsPerDaily=500,headerRow=6,firstRow=7,lastRow=firstRow+rowsPerDaily-1;
const dailyNames=Array.from({length:dailyCount},(_,i)=>"Daily "+String(i+1).padStart(2,"0"));
const sumHeader=36,sumFirst=37,sumLast=sumFirst+dailyCount*rowsPerDaily-1,bomFirst=5,bomLast=bomFirst+records.length-1;
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

// BOM includes the main Assembly rows only; component/part children are already excluded from source.rows.
bom.getRange("A1:T2").values=[
 ["BOM CẤU KIỆN CHÍNH",null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null],
 ["Nguồn: "+source.source_sheets.length+" sheet ASSEMBLY PART LIST, "+projectCodes.length+" dự án. Chỉ có dòng Assembly chính; các dòng Part con đã loại.",null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]
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
bom.tables.add("A4:T"+bomLast,true,"MainAssemblyTable").showFilterButton=true;

// Project and Assembly are manual; the simple fixed team dropdown is shown on each Daily tab.
lists.getRange("A1:B1").values=[["Mã dự án","Tên dự án"]];
lists.getRange("A2:B"+(projectCodes.length+1)).values=projectCodes.map(p=>[p,projectName.get(p)||p]);
lists.getRange("D1:E5").values=[["Tổ được giao","Màu"],["Tổ sắt 1","Đỏ"],["Tổ sắt 2","Xanh dương"],["Tổ sắt 3","Xanh lá"],["Tổ sắt 4","Tím"]];
for(const [r,fill] of [[2,"#F4CCCC"],[3,"#CFE2F3"],[4,"#D9EAD3"],[5,"#D9D2E9"]])lists.getRange("D"+r).format.fill=fill;
lists.getRange("F1:F6").values=[["Tình trạng"],...statuses.map(s=>[s])];
lists.getRange("H1:H7").values=[["Ghi chú"],["Mỗi dòng trên Daily là một nhiệm vụ trong một ngày."],["Chỉ nhập Assembly No.; mã dự án / sheet nguồn chỉ cần khi báo trùng."],["Nếu cần tra Sheet nguồn, xem cột M của BOM Assembly."],["Tên dự án tra tại đây nếu cần nhập mã dự án."],["Tình trạng: chọn một trong 5 lựa chọn tại cột I."],["Đổi tên tab Daily được; để Tổng hợp hiển thị tên người, sửa ô B3 cùng lúc."]];
lists.getRange("A1:H1").format={fill:dark,font:{name:font,size:10,bold:true,color:"#FFFFFF"},horizontalAlignment:"center",verticalAlignment:"center",wrapText:true};
lists.getRange("A2:H20").format={font:{name:font,size:9,color:ink},verticalAlignment:"center"};
lists.getRange("A:A").format.columnWidth=15;lists.getRange("B:B").format.columnWidth=38;lists.getRange("D:D").format.columnWidth=24;lists.getRange("F:F").format.columnWidth=29;lists.getRange("H:H").format.columnWidth=60;
lists.getRange("H1:H7").format.wrapText=true;lists.freezePanes.freezeRows(1);

// Short, consistent input columns: one row is one task on one date.
const dailyHeaders=["Ngày","Assembly No. nhập tay","Kiểm tra mã BOM","Tình trạng","Lý do / ghi chú (* bắt buộc nếu Lý do khác)","Mã dự án tra ra","Tên cấu kiện chính","Drawing Number","KL BOM (kg)","Mã dự án (chỉ khi trùng)","Sheet BOM gốc (chỉ khi mã vẫn trùng)"];
const summaryHeaders=["Kỹ thuật phụ trách","Tổ được giao","Ngày","Mã dự án","Assembly No.","Tên cấu kiện chính","Drawing Number","KL BOM (kg)","Tình trạng","Lý do khác / ghi chú","Kiểm tra mã BOM"];
const noRange="'BOM Assembly'!$E$"+bomFirst+":$E$"+bomLast;
const projRange="'BOM Assembly'!$B$"+bomFirst+":$B$"+bomLast;
const nameRange="'BOM Assembly'!$F$"+bomFirst+":$F$"+bomLast;
const drawRange="'BOM Assembly'!$G$"+bomFirst+":$G$"+bomLast;
const kgRange="'BOM Assembly'!$K$"+bomFirst+":$K$"+bomLast;
const pKeyRange="'BOM Assembly'!$R$"+bomFirst+":$R$"+bomLast;
const fullKeyRange="'BOM Assembly'!$Q$"+bomFirst+":$Q$"+bomLast;
const globalVariantsRange="'BOM Assembly'!$S$"+bomFirst+":$S$"+bomLast;
const localVariantsRange="'BOM Assembly'!$T$"+bomFirst+":$T$"+bomLast;
function lookupExpr(r,ret){
 return "IF($K"+r+"<>\"\",XLOOKUP($J"+r+"&\"|\"&$K"+r+"&\"|\"&$B"+r+","+fullKeyRange+","+ret+",\"\",0),IF($J"+r+"<>\"\",XLOOKUP($J"+r+"&\"|\"&$B"+r+","+pKeyRange+","+ret+",\"\",0),XLOOKUP($B"+r+","+noRange+","+ret+",\"\",0)))";
}
for(let d=0;d<dailyCount;d++){
 const sh=daily[d],n=dailyNames[d];
 sh.getRange("A1:K2").values=[
  ["DAILY TASK SẢN XUẤT",null,null,null,null,null,null,null,null,null,null],
  ["Mỗi dòng = 1 nhiệm vụ trong 1 ngày. Nhập ngày và Assembly No.; chọn Tình trạng cuối ngày. Chỉ nhập Mã dự án / Sheet nguồn nếu cột Kiểm tra báo trùng.",null,null,null,null,null,null,null,null,null,null]
 ];
 sh.mergeCells("A1:K1");sh.mergeCells("A2:K2");
 sh.getRange("A3:E3").values=[["Kỹ thuật phụ trách","Kỹ thuật "+String(d+1).padStart(2,"0"),"","Tổ được giao",""]];
 sh.getRange("A3").format={font:{name:font,size:10,bold:true,color:dark},verticalAlignment:"center"};
 sh.getRange("B3").format={fill:inputFill,font:{name:font,size:10,bold:true,color:ink},verticalAlignment:"center"};
 sh.getRange("D3").format={font:{name:font,size:10,bold:true,color:dark},verticalAlignment:"center"};
 sh.getRange("E3").format={fill:inputFill,font:{name:font,size:10,bold:true,color:ink},verticalAlignment:"center"};
 sh.getRange("E3").dataValidation={rule:{type:"list",values:teams}};
 for(const [team,fill,color] of [["Tổ sắt 1","#F4CCCC","#990000"],["Tổ sắt 2","#CFE2F3","#1155CC"],["Tổ sắt 3","#D9EAD3","#38761D"],["Tổ sắt 4","#D9D2E9","#674EA7"]])sh.getRange("E3").conditionalFormats.add("containsText",{text:team,format:{fill,font:{color,bold:true}}});
 sh.getRange("A4:K4").merge();sh.getRange("A4").values=[["Chọn Tổ sắt 1 (đỏ), Tổ sắt 2 (xanh dương), Tổ sắt 3 (xanh lá) hoặc Tổ sắt 4 (tím) ở ô E3. Đổi tên tab Daily được; đổi cả ô B3 nếu muốn tên người hiển thị khớp."]];
 sh.getRange("A4:K4").format={font:{name:font,size:9,italic:true,color:"#5B6573"},wrapText:true,verticalAlignment:"center"};
 sh.getRange("A"+headerRow+":K"+headerRow).values=[dailyHeaders];header(sh.getRange("A"+headerRow+":K"+headerRow));
 sh.getRange("A"+headerRow+":K"+headerRow).format.rowHeight=42;
 const fs=[];
 for(let r=firstRow;r<=lastRow;r++){
  const globalCount="XLOOKUP($B"+r+","+noRange+","+globalVariantsRange+",0,0)";
  const localCount="XLOOKUP($J"+r+"&\"|\"&$B"+r+","+pKeyRange+","+localVariantsRange+",0,0)";
  const autoProject="=IF($B"+r+"=\"\",\"\",IF($J"+r+"<>\"\",IF(COUNTIF("+pKeyRange+",$J"+r+"&\"|\"&$B"+r+")>0,$J"+r+",\"\"),IF("+globalCount+"=1,XLOOKUP($B"+r+","+noRange+","+projRange+",\"\",0),\"\")))";
  const check="=IF($B"+r+"=\"\",\"\",IF(COUNTIF("+noRange+",$B"+r+")=0,\"Không tìm thấy Assembly No.\",IF(AND($K"+r+"<>\"\",$J"+r+"=\"\"),\"Nhập mã dự án trước\",IF($J"+r+"=\"\",IF("+globalCount+">1,\"Mã trùng: nhập mã dự án\",\"Đã nhận\"),IF(COUNTIF("+pKeyRange+",$J"+r+"&\"|\"&$B"+r+")=0,\"Mã dự án không khớp\",IF($K"+r+"=\"\",IF("+localCount+">1,\"Mã trùng trong dự án: nhập Sheet BOM gốc\",\"Đã nhận\"),IF(COUNTIF("+fullKeyRange+",$J"+r+"&\"|\"&$K"+r+"&\"|\"&$B"+r+")=0,\"Sheet BOM gốc không khớp\",\"Đã nhận\")))))))";
  const result=ret=>"=IF($C"+r+"<>\"Đã nhận\",\"\",IFERROR("+lookupExpr(r,ret)+",\"\"))";
  fs.push([
   null,null,check,null,null,autoProject,result(nameRange),result(drawRange),result(kgRange),null,null
  ]);
 }
 sh.getRange("A"+firstRow+":K"+lastRow).formulas=fs;
 sh.getRange("A"+firstRow+":K"+lastRow).format={font:{name:font,size:9,color:ink},verticalAlignment:"center"};
 for(const rg of ["A"+firstRow+":B"+lastRow,"D"+firstRow+":E"+lastRow,"J"+firstRow+":K"+lastRow])sh.getRange(rg).format.fill=inputFill;
 for(const rg of ["C"+firstRow+":C"+lastRow,"F"+firstRow+":I"+lastRow])sh.getRange(rg).format.fill=pale;
 sh.getRange("A"+firstRow+":A"+lastRow).format.numberFormat="dd/mm/yyyy";
 sh.getRange("H"+firstRow+":H"+lastRow).format.numberFormat="#,##0.0";
 sh.getRange("A"+firstRow+":A"+lastRow).dataValidation={rule:{type:"date",operator:"between",formula1:"=DATE(2020,1,1)",formula2:"=DATE(2100,12,31)"}};
 sh.getRange("D"+firstRow+":D"+lastRow).dataValidation={rule:{type:"list",values:statuses}};
 sh.getRange("C"+firstRow+":C"+lastRow).conditionalFormats.add("containsText",{text:"trùng",format:{fill:"#FFF2CC",font:{color:"#7F6000",bold:true}}});
 sh.getRange("C"+firstRow+":C"+lastRow).conditionalFormats.add("containsText",{text:"không",format:{fill:"#FCE8E6",font:{color:"#B91C1C",bold:true}}});
 sh.getRange("C"+firstRow+":C"+lastRow).conditionalFormats.add("containsText",{text:"Đã nhận",format:{fill:"#E2F0D9",font:{color:"#38761D",bold:true}}});
 const statusColors=[
  ["Hoàn thành","#E2F0D9","#38761D"],["Chưa hoàn thành","#FFF2CC","#7F6000"],["Thiếu vật tư","#FCE8E6","#B91C1C"],["Chưa chuẩn bị vật tư","#DDEBF7","#1F4E78"],["Lý do khác","#E4DFEC","#674EA7"]
 ];
 for(const [s,fill,color] of statusColors)sh.getRange("D"+firstRow+":D"+lastRow).conditionalFormats.add("containsText",{text:s,format:{fill,font:{color,bold:true}}});
 sh.getRange("E"+firstRow+":E"+lastRow).conditionalFormats.addCustom('=AND($D7="Lý do khác",$E7="")',{fill:"#FCE8E6",font:{color:"#B91C1C",bold:true}});
 [13,23,33,23,38,15,31,30,15,22,28].forEach((w,i)=>sh.getRange(col(i+1)+":"+col(i+1)).format.columnWidth=w);
 sh.freezePanes.freezeRows(headerRow);
 sh.tables.add("A"+headerRow+":K"+lastRow,true,"Daily"+String(d+1).padStart(2,"0")+"Tasks").showFilterButton=true;
}

// Master: every task remains one row and includes its current end-of-day status.
summary.getRange("A1:N2").values=[
 ["TỔNG HỢP KẾ HOẠCH SẢN XUẤT",null,null,null,null,null,null,null,null,null,null,null,null,null],
 ["8 tab Daily · 1 dòng = 1 nhiệm vụ trong 1 ngày · mã BOM tra theo Assembly No. nhập tay",null,null,null,null,null,null,null,null,null,null,null,null,null]
];
summary.mergeCells("A1:N1");summary.mergeCells("A2:N2");title(summary,"A1:N1","A2:N2");summary.getRange("A1:N2").format.rowHeight=27;
const cardSpecs=[
 ["TỔNG NHIỆM VỤ","A5","="+dailyNames.map(n=>"COUNTIF('"+n+"'!$B$"+firstRow+":$B$"+lastRow+",\"<>\")").join("+"),"A4:B5"],
 ["HOÀN THÀNH","C5","=COUNTIF($I$"+sumFirst+":$I$"+sumLast+",\"Hoàn thành\")","C4:D5"],
 ["CHƯA HOÀN THÀNH","E5","=COUNTIF($I$"+sumFirst+":$I$"+sumLast+",\"Chưa hoàn thành\")","E4:F5"],
 ["THIẾU VẬT TƯ","G5","=COUNTIF($I$"+sumFirst+":$I$"+sumLast+",\"Thiếu vật tư\")","G4:H5"],
 ["CHƯA CHUẨN BỊ","I5","=COUNTIF($I$"+sumFirst+":$I$"+sumLast+",\"Chưa chuẩn bị vật tư\")","I4:J5"],
 ["LÝ DO KHÁC","K5","=COUNTIF($I$"+sumFirst+":$I$"+sumLast+",\"Lý do khác\")","K4:L5"],
 ["CHƯA CẬP NHẬT","M5","=COUNTIF($I$"+sumFirst+":$I$"+sumLast+",\"Chưa cập nhật\")","M4:N5"]
];
for(const c of cardSpecs){
 const start=c[3].split(":")[0];summary.getRange(start).values=[[c[0]]];summary.getRange(c[1]).formulas=[[c[2]]];
 summary.getRange(c[3]).format.fill=pale;
 summary.getRange(start).format={font:{name:font,size:8,bold:true,color:"#5B6573"},horizontalAlignment:"center",verticalAlignment:"center",wrapText:true};
 summary.getRange(c[1]).format={font:{name:font,size:15,bold:true,color:dark},horizontalAlignment:"center",verticalAlignment:"center"};
 summary.getRange(c[3]).format.borders={preset:"outside",style:"thin",color:border};
}
summary.getRange("A8:B8").values=[["Tình trạng","Số nhiệm vụ"]];
summary.getRange("A9:A14").values=[...statuses.map(s=>[s]),["Chưa cập nhật"]];
summary.getRange("B9:B14").formulas=Array.from({length:6},(_,i)=>["=COUNTIF($I$"+sumFirst+":$I$"+sumLast+",A"+(9+i)+")"]);
summary.getRange("D8:E8").values=[["Kỹ thuật / tổ được giao","Số nhiệm vụ"]];
summary.getRange("D9:D16").formulas=dailyNames.map(n=>["='"+n+"'!$B$3&\" / \"&'"+n+"'!$E$3"]);
summary.getRange("E9:E16").formulas=dailyNames.map(n=>["=COUNTIF('"+n+"'!$B$"+firstRow+":$B$"+lastRow+",\"<>\")"]);
header(summary.getRange("A8:B8"));header(summary.getRange("D8:E8"));
summary.getRange("A9:B14").format={font:{name:font,size:9,color:ink},verticalAlignment:"center"};
summary.getRange("D9:E16").format={font:{name:font,size:9,color:ink},verticalAlignment:"center",wrapText:true};
summary.getRange("A:A").format.columnWidth=28;summary.getRange("B:B").format.columnWidth=15;summary.getRange("C:C").format.columnWidth=4;summary.getRange("D:D").format.columnWidth=35;summary.getRange("E:E").format.columnWidth=15;summary.getRange("F:F").format.columnWidth=4;
for(const c of ["G","H","I","J","K","L","M","N"])summary.getRange(c+":"+c).format.columnWidth=14;
const chart1=summary.charts.add("bar",summary.getRange("A8:B14"));chart1.title="Nhiệm vụ theo tình trạng";chart1.titleTextStyle.fontSize=12;chart1.titleTextStyle.typeface=font;chart1.hasLegend=false;chart1.xAxis={axisType:"textAxis",textStyle:{typeface:font,fontSize:9}};chart1.yAxis={numberFormatCode:"#,##0",numberFormatSourceLinked:false,textStyle:{typeface:font,fontSize:9}};chart1.setPosition("A17","F32");if(chart1.series.items.length)chart1.series.items[0].fill=medium;
const chart2=summary.charts.add("bar",summary.getRange("D8:E16"));chart2.title="Nhiệm vụ theo kỹ thuật / tổ";chart2.titleTextStyle.fontSize=12;chart2.titleTextStyle.typeface=font;chart2.hasLegend=false;chart2.xAxis={axisType:"textAxis",textStyle:{typeface:font,fontSize:9}};chart2.yAxis={numberFormatCode:"#,##0",numberFormatSourceLinked:false,textStyle:{typeface:font,fontSize:9}};chart2.setPosition("G17","N32");if(chart2.series.items.length)chart2.series.items[0].fill="#70AD47";
summary.getRange("A33:N33").merge();summary.getRange("A33").values=[["BẢNG CHI TIẾT: MỖI DÒNG LÀ MỘT NHIỆM VỤ THEO NGÀY"]];
summary.getRange("A33:N33").format={font:{name:font,size:12,bold:true,color:dark},verticalAlignment:"center"};
summary.getRange("A34:N34").merge();summary.getRange("A34").values=[["Lọc theo kỹ thuật, tổ, ngày, dự án hoặc tình trạng. Nếu cuối ngày chưa chọn tình trạng, bảng ghi “Chưa cập nhật”."]];
summary.getRange("A34:N34").format={font:{name:font,size:9,italic:true,color:"#5B6573"},verticalAlignment:"center",wrapText:true};
summary.getRange("A"+sumHeader+":K"+sumHeader).values=[summaryHeaders];header(summary.getRange("A"+sumHeader+":K"+sumHeader));summary.getRange("A"+sumHeader+":K"+sumHeader).format.rowHeight=42;
const master=[];
for(let d=0;d<dailyCount;d++){
 const n=dailyNames[d];
 for(let i=0;i<rowsPerDaily;i++){
  const row=sumFirst+d*rowsPerDaily+i,src=firstRow+i;
  const refs=["$B$3","$E$3","$A"+src,"$F"+src,"$B"+src,"$G"+src,"$H"+src,"$I"+src,"$D"+src,"$E"+src,"$C"+src];
  master.push(refs.map((ref,c)=>{
   const letter=col(c+1);
   if(c===8)return "=IF('"+n+"'!$B"+src+"=\"\",\"\",IF('"+n+"'!$D"+src+"=\"\",\"Chưa cập nhật\",IFERROR('"+n+"'!$D"+src+",\"\")))";
   return "=IF('"+n+"'!$B"+src+"=\"\",\"\",IFERROR('"+n+"'!"+ref+",\"\"))";
  }));
 }
}
summary.getRange("A"+sumFirst+":K"+sumLast).formulas=master;
summary.getRange("A"+sumFirst+":K"+sumLast).format={font:{name:font,size:9,color:ink},verticalAlignment:"center"};
summary.getRange("A"+sumFirst+":K"+sumLast).format.fill=pale;
summary.getRange("C"+sumFirst+":C"+sumLast).format.numberFormat="dd/mm/yyyy";
summary.getRange("H"+sumFirst+":H"+sumLast).format.numberFormat="#,##0.0";
for(const [s,fill,color] of [["Hoàn thành","#E2F0D9","#38761D"],["Chưa hoàn thành","#FFF2CC","#7F6000"],["Thiếu vật tư","#FCE8E6","#B91C1C"],["Chưa chuẩn bị vật tư","#DDEBF7","#1F4E78"],["Lý do khác","#E4DFEC","#674EA7"],["Chưa cập nhật","#FCE8E6","#B91C1C"]])summary.getRange("I"+sumFirst+":I"+sumLast).conditionalFormats.add("containsText",{text:s,format:{fill,font:{color,bold:true}}});
for(const [team,fill,color] of [["Tổ sắt 1","#F4CCCC","#990000"],["Tổ sắt 2","#CFE2F3","#1155CC"],["Tổ sắt 3","#D9EAD3","#38761D"],["Tổ sắt 4","#D9D2E9","#674EA7"]])summary.getRange("B"+sumFirst+":B"+sumLast).conditionalFormats.add("containsText",{text:team,format:{fill,font:{color,bold:true}}});
[23,24,13,13,22,31,31,15,23,34,38].forEach((w,i)=>summary.getRange(col(i+1)+":"+col(i+1)).format.columnWidth=w);
summary.tables.add("A"+sumHeader+":K"+sumLast,true,"MasterDailyTasks").showFilterButton=true;
summary.freezePanes.freezeRows(sumHeader);

// Guide spells out renaming, ownership and end-of-day reporting.
guide.getRange("A1:D2").values=[["HƯỚNG DẪN SỬ DỤNG",null,null,null],["Quy trình nhập đơn giản: mỗi dòng một nhiệm vụ trong một ngày; Tổng hợp tự liệt kê toàn bộ dòng đã nhập.",null,null,null]];
guide.mergeCells("A1:D1");guide.mergeCells("A2:D2");title(guide,"A1:D1","A2:D2");
guide.getRange("A4:B15").values=[
 ["Bước","Thao tác"],
 ["1","Mỗi người dùng một tab Daily riêng. Ô B3 là tên kỹ thuật; ô E3 là tổ được giao cho tab đó."],
 ["2","Chọn Tổ sắt 1 (đỏ), Tổ sắt 2 (xanh dương), Tổ sắt 3 (xanh lá), hoặc Tổ sắt 4 (tím) ở ô E3."],
 ["3","Đổi tên tab Daily thành tên kỹ thuật được. Công thức Tổng hợp liên kết trực tiếp đến tab và sẽ theo tên tab mới. Đổi cả B3 để tên hiển thị khớp."],
 ["4","Mỗi ngày, thêm một dòng cho mỗi nhiệm vụ: nhập ngày ở cột A và Assembly No. ở cột B."],
 ["5","Tên cấu kiện chính, mã dự án, Drawing Number và KL BOM tra tự động. Không chọn dự án hay cấu kiện từ dropdown."],
 ["6","Nếu cột C báo mã trùng, nhập mã dự án ở J. Nếu vẫn trùng, nhập Sheet BOM gốc ở K; sau đó thông tin tự tra."],
 ["7","Cuối ngày chọn Tình trạng ở cột D: Hoàn thành, Chưa hoàn thành, Thiếu vật tư, Chưa chuẩn bị vật tư, hoặc Lý do khác."],
 ["8","Nếu chọn Lý do khác, nhập lý do ở cột E; ô sẽ được đánh dấu khi còn trống."],
 ["9","Tab Tổng hợp có biểu đồ, số đếm đủ 5 tình trạng và Chưa cập nhật, cùng danh sách riêng từng nhiệm vụ từ 8 tab Daily."],
 ["10","Sau khi chuyển đổi sang Google Sheets: chia sẻ từng tab Daily cho người phụ trách qua Data > Protect sheets and ranges; khóa Tổng hợp, BOM, Danh mục, Hướng dẫn."],
 ["Lưu ý","Hãy đổi tên tab đang dùng trực tiếp. Không xóa tab gốc rồi tạo tab mới cùng tên kỹ thuật; các công thức của Tổng hợp sẽ theo tab gốc bị xóa."]
];
header(guide.getRange("A4:B4"));guide.getRange("A5:B15").format={font:{name:font,size:10,color:ink},verticalAlignment:"center",wrapText:true};
guide.getRange("A:A").format.columnWidth=17;guide.getRange("B:B").format.columnWidth=116;guide.getRange("A1:D2").format.rowHeight=28;guide.getRange("A4:B15").format.rowHeight=45;guide.getRange("A7:B12").format.rowHeight=54;guide.getRange("A15:B15").format.rowHeight=55;guide.freezePanes.freezeRows(4);

wb.recalculate();
const checks=[];
checks.push((await wb.inspect({kind:"sheet",include:"id,name"})).ndjson);
checks.push((await wb.inspect({kind:"table",range:"Tổng hợp!A1:N34",include:"values,formulas",tableMaxRows:34,tableMaxCols:14,maxChars:15000})).ndjson);
checks.push((await wb.inspect({kind:"table",range:"Daily 01!A1:K15",include:"values,formulas",tableMaxRows:15,tableMaxCols:11,maxChars:9000})).ndjson);
checks.push((await wb.inspect({kind:"table",range:"Daily 01!A500:K506",include:"formulas,values",tableMaxRows:7,tableMaxCols:11,maxChars:5000})).ndjson);
checks.push((await wb.inspect({kind:"table",range:"BOM Assembly!A4:T8",include:"values,formulas",tableMaxRows:5,tableMaxCols:20,maxChars:4500})).ndjson);
checks.push((await wb.inspect({kind:"drawing",sheetId:"Tổng hợp",maxChars:3500})).ndjson);
checks.push((await wb.inspect({kind:"match",searchTerm:"#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A|#NUM!|#NULL!|#SPILL!|#CALC!",options:{useRegex:true,maxResults:100},summary:"formula error scan"})).ndjson);
await fs.writeFile(outDir+"/verification_simple_daily.txt",checks.join("\n\n"),"utf8");
for(const item of [["Tổng hợp","A1:N34","preview_summary_simple.png"],["Daily 01","A1:K18","preview_daily_simple.png"],["Daily 01","A480:K506","preview_daily_rows_simple.png"],["BOM Assembly","A1:T10","preview_bom_simple.png"],["Hướng dẫn","A1:D13","preview_guide_simple.png"]]){
 const png=await wb.render({sheetName:item[0],range:item[1],scale:1,format:"png"});
 await fs.writeFile(outDir+"/"+item[2],new Uint8Array(await png.arrayBuffer()));
}
const xlsx=await SpreadsheetFile.exportXlsx(wb);
const outputPath=outDir+"/Ke_hoach_san_xuat_8_nguoi_todo_v2.xlsx";
await xlsx.save(outputPath);
console.log(JSON.stringify({outputPath,records:records.length,projects:projectCodes.length,sourceSheets:source.source_sheets.length,globalDuplicateAssemblyGroups:[...byNo.values()].filter(s=>s.size>1).length,projectDuplicateVariants:[...byProjectNo.values()].filter(s=>s.size>1).length,dailySheets:dailyCount,rowsPerDaily,masterRows:dailyCount*rowsPerDaily,statuses},null,2));

