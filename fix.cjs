const fs = require('fs');
let c = fs.readFileSync('src/components/Login.tsx', 'utf8');

c = c.replace(/import \{ auth \} from '\.\.\/lib\/firebase';/g, '');
c = c.replace(/import \{ signInWithEmailAndPassword, createUserWithEmailAndPassword \} from 'firebase\/auth';/g, '');

c = `import { auth } from '../lib/firebase';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
` + c;

fs.writeFileSync('src/components/Login.tsx', c);
