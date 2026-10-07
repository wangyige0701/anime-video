import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { access, copyFile, mkdir, mkdtemp, open, readFile, rm, rename, writeFile } from 'node:fs/promises';
import { execFile as execFileCallback } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';

const execFile = promisify(execFileCallback);
const rootDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const configPath = join(rootDirectory, 'config.yaml');
const cacheDirectory = join(rootDirectory, '.cache', 'node-runtime');
const outputDirectory = join(rootDirectory, 'dist', 'runtime');

const config = parseYaml(await readFile(configPath, 'utf8'));
const runtimeConfig = config?.runtime;
const version = normalizeVersion(runtimeConfig?.nodeVersion?.value);
const mirror = normalizeMirror(runtimeConfig?.nodeMirror?.value);
const configuredSha256 = normalizeSha256(runtimeConfig?.nodeSha256?.value);

if (process.platform !== 'win32') {
	throw new Error('Node runtime installation currently supports Windows builds only');
}

const architecture = getWindowsArchitecture();
const archiveName = `node-v${version}-win-${architecture}.zip`;
const archivePath = join(cacheDirectory, archiveName);
const checksumCachePath = `${archivePath}.sha256`;
const archiveUrl = new URL(`v${version}/${archiveName}`, mirror).toString();
const checksumUrl = new URL(`v${version}/SHASUMS256.txt`, mirror).toString();

await mkdir(cacheDirectory, { recursive: true });
if (!(await fileExists(archivePath))) {
	console.log(`Downloading Node.js ${version} from ${archiveUrl}`);
	await download(archiveUrl, archivePath);
}

const expectedSha256 = configuredSha256 ?? (await loadChecksum(checksumUrl, archiveName, checksumCachePath));
const actualSha256 = await sha256(archivePath);
if (expectedSha256 && actualSha256 !== expectedSha256) {
	await rm(archivePath, { force: true });
	throw new Error(`Node.js archive checksum mismatch: expected ${expectedSha256}, received ${actualSha256}`);
}

const extractionDirectory = await mkdtemp(join(cacheDirectory, 'extract-'));
try {
	await execFile('tar.exe', ['-xf', archivePath, '-C', extractionDirectory], {
		windowsHide: true,
	});

	const sourceDirectory = join(extractionDirectory, `node-v${version}-win-${architecture}`);
	const sourceNode = join(sourceDirectory, 'node.exe');
	if (!(await fileExists(sourceNode))) {
		throw new Error(`Node.js archive does not contain ${sourceNode}`);
	}

	await mkdir(outputDirectory, { recursive: true });
	await copyFile(sourceNode, join(outputDirectory, 'node.exe'));
	const licensePath = join(sourceDirectory, 'LICENSE');
	if (await fileExists(licensePath)) {
		await copyFile(licensePath, join(outputDirectory, 'LICENSE.node.txt'));
	}

	console.log(`Node.js ${version} installed at ${join(outputDirectory, 'node.exe')}`);
} finally {
	await rm(extractionDirectory, { recursive: true, force: true });
}

function normalizeVersion(value) {
	if (typeof value !== 'string' || !/^\d+\.\d+\.\d+$/.test(value)) {
		throw new Error('runtime.nodeVersion must use the x.y.z format');
	}
	return value;
}

function normalizeMirror(value) {
	if (typeof value !== 'string' || value.length === 0) {
		throw new Error('runtime.nodeMirror must be a non-empty URL');
	}
	const url = new URL(value);
	if (url.protocol !== 'https:' && url.protocol !== 'http:') {
		throw new Error('runtime.nodeMirror must use HTTP or HTTPS');
	}
	return url.toString().endsWith('/') ? url.toString() : `${url}/`;
}

function normalizeSha256(value) {
	if (value === undefined || value === null || value === '') {
		return null;
	}
	if (typeof value !== 'string' || !/^[a-f0-9]{64}$/i.test(value)) {
		throw new Error('runtime.nodeSha256 must be a 64-character hexadecimal SHA256');
	}
	return value.toLowerCase();
}

function getWindowsArchitecture() {
	if (process.arch === 'x64') {
		return 'x64';
	}
	if (process.arch === 'arm64') {
		return 'arm64';
	}
	if (process.arch === 'ia32') {
		return 'x86';
	}
	throw new Error(`Unsupported Windows architecture: ${process.arch}`);
}

async function fileExists(path) {
	try {
		await access(path);
		return true;
	} catch {
		return false;
	}
}

async function download(url, destination) {
	const response = await fetch(url, { redirect: 'follow' });
	if (!response.ok || !response.body) {
		throw new Error(`Failed to download ${url}: HTTP ${response.status}`);
	}

	const temporaryPath = `${destination}.part`;
	await rm(temporaryPath, { force: true });
	const file = await open(temporaryPath, 'w');
	try {
		const reader = response.body.getReader();
		while (true) {
			const { done, value } = await reader.read();
			if (done) {
				break;
			}
			await file.write(value);
		}
	} finally {
		await file.close();
	}
	await rename(temporaryPath, destination);
}

async function readRemoteChecksum(url, archiveName) {
	const response = await fetch(url, { redirect: 'follow' });
	if (!response.ok) {
		throw new Error(`Failed to download ${url}: HTTP ${response.status}`);
	}
	const line = (await response.text())
		.split(/\r?\n/)
		.find((value) => value.trim().endsWith(`  ${archiveName}`) || value.trim().endsWith(` *${archiveName}`));
	const checksum = line?.trim().split(/\s+/)[0];
	if (!checksum || !/^[a-f0-9]{64}$/i.test(checksum)) {
		throw new Error(`Checksum for ${archiveName} was not found in ${url}`);
	}
	return checksum.toLowerCase();
}

async function loadChecksum(url, archiveName, cachePath) {
	if (await fileExists(cachePath)) {
		const cached = (await readFile(cachePath, 'utf8')).trim().toLowerCase();
		if (/^[a-f0-9]{64}$/.test(cached)) {
			return cached;
		}
	}

	const checksum = await readRemoteChecksum(url, archiveName);
	await writeFile(cachePath, `${checksum}\n`, 'utf8');
	return checksum;
}

async function sha256(path) {
	const hash = createHash('sha256');
	for await (const chunk of createReadStream(path)) {
		hash.update(chunk);
	}
	return hash.digest('hex');
}
