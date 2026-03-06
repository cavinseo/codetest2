const XLSX = require('xlsx');
const wb = XLSX.readFile('public/asset/워크시트.xlsx');
const fs = require('fs');

let output = '';
output += 'SHEETS: ' + JSON.stringify(wb.SheetNames) + '\n\n';

wb.SheetNames.forEach((name, i) => {
    const ws = wb.Sheets[name];
    const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
    output += `=== Sheet ${i + 1}: ${name} (rows: ${range.e.r + 1}, cols: ${range.e.c + 1}) ===\n`;
    const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    data.slice(0, 10).forEach((row, r) => {
        output += `Row ${r}: ${JSON.stringify(row)}\n`;
    });
    output += '\n';
});

fs.writeFileSync('scripts/excel-analysis.txt', output, 'utf8');
console.log('Done - see scripts/excel-analysis.txt');
