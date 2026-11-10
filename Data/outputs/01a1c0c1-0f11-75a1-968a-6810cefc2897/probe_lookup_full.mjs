import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";
const f="D:/Tool/Server_Leo_Nguyen/Data/outputs/01a1c0c1-0f11-75a1-968a-6810cefc2897/Ke_hoach_san_xuat_8_nguoi_nhap_Assembly_No.xlsx";
const w=await SpreadsheetFile.importXlsx(await FileBlob.load(f));
const g=w.worksheets.getItem("Hướng dẫn");
g.getRange("A20:A24").formulas=[
 ["=MATCH(\"M304|M304STK1|BD01\",'BOM Assembly'!$Q$5:$Q$7484,0)"],
 ["=COUNTIF('BOM Assembly'!$Q$5:$Q$7484,\"M304|M304STK1|BD01\")"],
 ["=XLOOKUP(\"M304|M304STK1|BD01\",'BOM Assembly'!$Q$5:$Q$7484,'BOM Assembly'!$F$5:$F$7484,\"\",0)"],
 ["=VLOOKUP(\"M304|M304STK1|BD01\",'BOM Assembly'!$Q$5:$T$7484,2,FALSE)"],
 ["=XLOOKUP(\"M304|M304STK1|BD01\",'BOM Assembly'!$Q$5:$Q$7484,'BOM Assembly'!$K$5:$K$7484,\"\",0)"]
];
w.recalculate();
console.log(JSON.stringify(g.getRange("A20:A24").values));
