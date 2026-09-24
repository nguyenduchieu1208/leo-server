const fs = require('fs');
const content = fs.readFileSync('demo_v2/index.html', 'utf8');
const lines = content.split('\n');
lines.forEach((line, idx) => {
  if (line.includes('id="page-') || line.includes('page-charts') || line.includes('chart-kpi')) {
    console.log(`${idx + 1}: ${line.trim()}`);
  }
});
