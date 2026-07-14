import { promises as fs } from 'fs';
import path from 'path';

export async function getSettings() {
    const settingsPath = path.join(process.cwd(), 'src', 'lib', 'settings.json');
    try {
        const content = await fs.readFile(settingsPath, 'utf-8');
        return JSON.parse(content);
    } catch (e) {
        return {};
    }
}
