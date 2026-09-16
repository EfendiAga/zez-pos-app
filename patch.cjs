const fs = require('fs');

// Patch db.ts
let dbContent = fs.readFileSync('src/lib/db.ts', 'utf8');
dbContent = dbContent.replace(/class CollectionWrapper/g, 'class CollectionWrapper<T = any>');
dbContent = dbContent.replace(/class QueryWrapper/g, 'class QueryWrapper<T = any>');
dbContent = dbContent.replace(/export const db = \{/g, 'export const db: any = {');
dbContent = dbContent.replace(/toArray\(\)/g, 'toArray(): Promise<any[]>');
dbContent = dbContent.replace(/first\(\)/g, 'first(): Promise<any>');
dbContent = dbContent.replace(/_val: any = null;/g, '_val: any = null;\n  _anyOfVals: any[] | null = null;\n  _andFilter: ((item: any) => boolean) | null = null;');
dbContent = dbContent.replace(/equals\(val: any\) \{/g, `anyOf(vals: any[]) { this._anyOfVals = vals; return this; }\n  and(fn: (item: any) => boolean) { this._andFilter = fn; return this; }\n  equals(val: any) {`);
dbContent = dbContent.replace(/let constraints: any\[\] = \[where\(this\.field, '==', this\._val\)\];/g, `let constraints: any[] = [];\n      if (this._anyOfVals) constraints.push(where(this.field, 'in', this._anyOfVals));\n      else constraints.push(where(this.field, '==', this._val));`);
dbContent = dbContent.replace(/const items = snapshot.docs.map\(doc => \(\{ id: doc.id, \.\.\.doc\.data\(\) \}\)\);/g, `let items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));\n      if (this._andFilter) items = items.filter(this._andFilter);`);

fs.writeFileSync('src/lib/db.ts', dbContent);

// Patch firebase.ts
let fbContent = fs.readFileSync('src/lib/firebase.ts', 'utf8');
fbContent = fbContent.replace(/import\.meta/g, '(import.meta as any)');
fs.writeFileSync('src/lib/firebase.ts', fbContent);
