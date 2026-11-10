import { Workbook } from "@oai/artifact-tool";
const w=Workbook.create();
const bom=w.worksheets.add("BOM Assembly");
bom.getRange("A1:B5").values=[
 ["Choice","Project"],
 ["A290 | A290T5P1 | 5A-B-50006 | BEAM","A290"],
 ["B272 | B272T1 | 7B-H-01001 | COLUMN","B272"],
 ["B272 | B272T1 | 7B-H-01002 | BEAM","B272"],
 ["A290 | A290T5P1 | 5A-H-50002 | HANGER","A290"]
];
const daily=w.worksheets.add("Daily 01");
daily.getRange("B5").values=[["B272"]];
const helper=w.worksheets.add("Dropdown Helper");
helper.getRange("A2").formulas=[["=IF('Daily 01'!$B5=\"\",\"\",FILTER('BOM Assembly'!$A$2:$A$5,'BOM Assembly'!$B$2:$B$5='Daily 01'!$B5))"]];
w.recalculate();
console.log(JSON.stringify(helper.getRange("A2:A5").values));
