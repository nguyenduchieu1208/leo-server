import { Workbook } from "@oai/artifact-tool";
const w=Workbook.create();
const s=w.worksheets.add("Data"), q=w.worksheets.add("Test");
s.getRange("A1:C4").values=[["Key","Name","Weight"],["A|1|x","Alpha",10],["M304|M304STK1|BD01","BREECH DUCT",5206.9],["M304|M304CS1|CS11R","RIGHT SIDE PANEL",7930.213]];
q.getRange("A1").values=[["M304|M304STK1|BD01"]];
q.getRange("A2:C2").formulas=[["=MATCH(A1,Data!$A$2:$A$4,0)","=VLOOKUP(A1,Data!$A$2:$C$4,2,FALSE)","=XLOOKUP(A1,Data!$A$2:$A$4,Data!$B$2:$B$4,\"\",0)"]];
w.recalculate();
console.log(JSON.stringify(q.getRange("A1:C2").values));
