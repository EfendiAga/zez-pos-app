import fs from 'fs';
import path from 'path';

const SRC_DIR = './src';

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach((file) => {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) {
      results = results.concat(walk(file));
    } else {
      if (file.endsWith('.tsx') || file.endsWith('.ts')) {
        results.push(file);
      }
    }
  });
  return results;
}

const files = walk(SRC_DIR);

files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  let changed = false;

  if (content.includes('dexie-react-hooks')) {
    content = content.replace(/import\s+\{\s*useLiveQuery\s*\}\s+from\s+'dexie-react-hooks';/g, "import { useLiveQuery } from '../lib/db';");
    changed = true;
  }
  
  if (content.includes("'../lib/db'") || content.includes('"../lib/db"')) {
    // Already importing from db, so just ensure useLiveQuery can come from it.
  }

  // Adjust imports for top level components where relative path is different
  content = content.replace(/import\s+\{\s*useLiveQuery\s*\}\s+from\s+'\.\.\/lib\/db';/g, "import { useLiveQuery } from '../lib/db';");
  content = content.replace(/import\s+\{\s*useLiveQuery\s*\}\s+from\s+'\.\/lib\/db';/g, "import { useLiveQuery } from './lib/db';");

  if (changed) {
    fs.writeFileSync(file, content, 'utf8');
    console.log('Updated', file);
  }
});
