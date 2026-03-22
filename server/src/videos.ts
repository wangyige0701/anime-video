import path from 'node:path';
import fs from 'node:fs';

interface VideoPlayItem {
	path: string;
	name: string;
	alias: string;
	suffix: string;
}

interface VideoList {
	path: string;
	name: string;
	children: VideoPlayItem[];
}

interface Video {
	path: string;
	name: string;
	list: VideoList[];
	keywords: string[];
}

const configName = '.video.json';

function getDirectoriesFile() {
	const configPath = path.resolve(process.cwd(), configName);
	if (!fs.existsSync(configPath)) {
		fs.writeFileSync(configPath, JSON.stringify([], null, 2));
	}
	return configPath;
}

export function getDirectories(): string[] {
	const configPath = getDirectoriesFile();
	return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
}

export function setDirectories(...directories: string[]) {
	const configPath = getDirectoriesFile();
	const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
	config.push(...directories.map((item) => path.resolve(item)).filter((item) => !config.includes(item)));
	fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}
