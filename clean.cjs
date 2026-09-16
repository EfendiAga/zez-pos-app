const fs = require('fs');
let c = fs.readFileSync('src/components/Login.tsx', 'utf8');
const lines = c.split('\n');
if (lines[0].includes('auth') && lines[0].includes('firebase')) {
  lines.shift();
}
if (lines[0].includes('firebase/auth')) {
  lines.shift();
}
fs.writeFileSync('src/components/Login.tsx', lines.join('\n'));
