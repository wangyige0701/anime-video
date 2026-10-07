import { mkdir, copyFile, readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import YAML from 'yaml';

const rootDirectory = dirname(fileURLToPath(import.meta.url));
const manifestPath = resolve(rootDirectory, 'desktop', 'Cargo.toml');
const sourcePath = resolve(rootDirectory, 'desktop', 'target', 'release', 'desktop.exe');
const notificationIconSource = resolve(rootDirectory, 'desktop', 'assets', 'icon.png');
const config = YAML.parse(await readFile(resolve(rootDirectory, 'config.yaml'), 'utf8'));
const executableName = config.application?.executableName?.value;
if (typeof executableName !== 'string' || !/^[A-Za-z0-9_-]+$/.test(executableName)) {
	throw new Error('config.yaml 中 application.executableName 必须是合法的文件名（仅允许字母、数字、下划线和连字符）');
}
const destinationPath = resolve(rootDirectory, 'dist', `${executableName}.exe`);
const notificationIconDestination = resolve(rootDirectory, 'dist', 'icon.png');

const build = new Promise((resolveBuild, rejectBuild) => {
	const child = spawn('cargo', ['build', '--release', '--manifest-path', manifestPath], {
		cwd: rootDirectory,
		stdio: 'inherit',
		windowsHide: true,
	});

	child.once('error', rejectBuild);
	child.once('close', (code) => {
		if (code === 0) {
			resolveBuild();
			return;
		}

		rejectBuild(new Error(`cargo build failed with exit code ${code ?? 'unknown'}`));
	});
});

await build;
await mkdir(dirname(destinationPath), { recursive: true });
await copyFile(sourcePath, destinationPath);
await copyFile(notificationIconSource, notificationIconDestination);
console.log(`Desktop executable copied to ${destinationPath}`);
