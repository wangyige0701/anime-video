import fs from 'node:fs/promises';

export async function isDirectory(path: string) {
	try {
		return (await fs.stat(path)).isDirectory();
	} catch (error) {
		return false;
	}
}

export async function isFileExist(path: string) {
	try {
		await fs.access(path);
		return true;
	} catch (error) {
		return false;
	}
}
