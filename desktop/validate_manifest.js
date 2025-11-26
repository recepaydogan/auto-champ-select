import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const manifestPath = path.resolve(__dirname, 'dist/manifest.json');

console.log('Checking manifest at:', manifestPath);

try {
    if (!fs.existsSync(manifestPath)) {
        console.error('FAIL: File not found');
        process.exit(1);
    }

    const buffer = fs.readFileSync(manifestPath);

    // Check for BOM
    if (buffer[0] === 0xEF && buffer[1] === 0xBB && buffer[2] === 0xBF) {
        console.log('WARN: UTF-8 BOM detected');
    } else {
        console.log('PASS: No BOM detected');
    }

    const content = buffer.toString('utf8');
    console.log('Content Length:', content.length);

    const json = JSON.parse(content);
    console.log('PASS: Valid JSON syntax');

    if (json.meta && json.meta['minimum-overwolf-version']) {
        console.log('PASS: minimum-overwolf-version is present:', json.meta['minimum-overwolf-version']);
    } else {
        console.error('FAIL: minimum-overwolf-version missing or invalid');
        console.log('Meta keys:', json.meta ? Object.keys(json.meta) : 'No meta');
    }

    if (json.meta && json.meta['minimum_overwolf_version']) {
        console.error('FAIL: Found deprecated minimum_overwolf_version');
    }

} catch (e) {
    console.error('FAIL: Error:', e.message);
}
