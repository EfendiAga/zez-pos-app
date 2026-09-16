import { getApp, getApps, initializeApp } from 'firebase/app';
import { initializeFirestore, memoryLocalCache, persistentLocalCache } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: 'AIzaSyBVNA5Uh27UE_VIwZTK9yHDepuKMJXt7iM',
  authDomain: 'market-main-pos.firebaseapp.com',
  projectId: 'market-main-pos',
  storageBucket: 'market-main-pos.firebasestorage.app',
  messagingSenderId: '34466688087',
  appId: '1:34466688087:web:32bc6b734acdaca4320712',
  measurementId: 'G-GYXJZJGXRZ',
};

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
const createFirestore = () => {
  try {
    return initializeFirestore(app, {
      localCache: persistentLocalCache({}),
    });
  } catch (error) {
    console.warn('Falling back to in-memory Firestore cache:', error);
    return initializeFirestore(app, {
      localCache: memoryLocalCache(),
    });
  }
};

const firestoreDb = createFirestore();
const auth = getAuth(app);

export { app, firestoreDb, auth };
