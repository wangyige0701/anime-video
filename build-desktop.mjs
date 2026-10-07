import { mkdir, copyFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const rootDirectory = dirname(fileURLToPath(import.meta.url));
const manifestPath = resolve(rootDirectory, 'desktop', 'Cargo.toml');
const sourcePath = resolve(rootDirectory, 'desktop', 'target', 'release', 'desktop.exe');
const destinationPath = resolve(rootDirectory, 'dist', 'desktop.exe');

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
console.log(`Desktop executable copied to ${destinationPath}`);
