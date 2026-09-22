/**
 * db.js - Asynchronous IndexedDB storage for note strokes.
 * Runs off the main visual pipeline to prevent UI stutter on low-spec hardware.
 */

const DB_NAME = 'LightweightNotesDB';
const DB_VERSION = 1;
const STORE_NAME = 'pages_data';

function openDatabase() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'pageId' });
            }
        };

        request.onsuccess = (e) => resolve(e.target.result);
        request.onerror = (e) => reject(e.target.error);
    });
}

// Save or update all strokes for a specific page
async function savePageData(pageId, strokes) {
    try {
        const db = await openDatabase();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            store.put({ pageId, strokes });

            tx.oncomplete = () => resolve(true);
            tx.onerror = (e) => reject(e.target.error);
        });
    } catch (err) {
        console.error('Failed to save to IndexedDB:', err);
    }
}

// Load all saved pages on initial app launch
async function loadAllPagesData() {
    try {
        const db = await openDatabase();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readonly');
            const store = tx.objectStore(STORE_NAME);
            const request = store.getAll();

            request.onsuccess = () => resolve(request.result || []);
            request.onerror = (e) => reject(e.target.error);
        });
    } catch (err) {
        console.error('Failed to read from IndexedDB:', err);
        return [];
    }
}