import { access, cp, mkdir, readdir, readFile, rm, writeFile, copyFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { spawn } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';

const rootDirectory = dirname(fileURLToPath(import.meta.url));
const distDirectory = resolve(rootDirectory, 'dist');
const stagingDirectory = resolve(distDirectory, '.installer-staging');
const applicationDirectory = resolve(stagingDirectory, 'app');
const config = YAML.parse(await readFile(resolve(rootDirectory, 'config.yaml'), 'utf8'));
const packageInfo = JSON.parse(await readFile(resolve(rootDirectory, 'package.json'), 'utf8'));
const executableName = config.application?.executableName?.value;
const applicationId = config.application?.appUserModelId?.value;

if (typeof executableName !== 'string' || !/^[A-Za-z0-9_-]+$/.test(executableName)) {
	throw new Error('config.yaml 中 application.executableName 必须是合法文件名');
}
if (typeof applicationId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9.-]*$/.test(applicationId)) {
	throw new Error('config.yaml 中 application.appUserModelId 必须是合法应用标识');
}

const executableSource = resolve(distDirectory, `${executableName}.exe`);
const serverSource = resolve(distDirectory, 'server');
const runtimeSource = resolve(distDirectory, 'runtime');
const hlsSource = resolve(rootDirectory, 'hls', 'build');
const executableTarget = join(applicationDirectory, `${executableName}.exe`);
const serverTarget = join(applicationDirectory, 'server');
const runtimeTarget = join(applicationDirectory, 'runtime');
const hlsTarget = join(serverTarget, 'hls');

await requireFile(executableSource, '桌面端 EXE');
await requireDirectory(serverSource, '服务端发布目录');
await requireDirectory(runtimeSource, 'Node.js 运行时目录');
await requireFile(join(hlsSource, 'hls.node'), 'HLS 原生模块');

await rm(stagingDirectory, { recursive: true, force: true });
await mkdir(applicationDirectory, { recursive: true });
await copyFile(executableSource, executableTarget);
await copyServerWithoutHls(serverSource, serverTarget);
await cp(runtimeSource, runtimeTarget, { recursive: true });
await mkdir(hlsTarget, { recursive: true });

for (const entry of await readdir(hlsSource, { withFileTypes: true })) {
	if (!entry.isFile()) {
		continue;
	}
	if (entry.name.toLowerCase() !== 'hls.node' && !entry.name.toLowerCase().endsWith('.dll')) {
		continue;
	}
	await copyFile(join(hlsSource, entry.name), join(hlsTarget, entry.name));
}

const scriptPath = resolve(stagingDirectory, 'installer.iss');
await writeFile(
	scriptPath,
	createInnoScript({
		executableName,
		applicationId,
		version: packageInfo.version,
	}),
	'utf8',
);

const compiler = await findInnoSetupCompiler();
await run(compiler, [scriptPath]);
await rm(stagingDirectory, { recursive: true, force: true });
console.log(`安装包已生成到 ${join(distDirectory, `${executableName}-setup.exe`)}`);

async function requireFile(path, label) {
	try {
		await access(path, constants.F_OK);
	} catch {
		throw new Error(`缺少${label}: ${path}`);
	}
}

async function requireDirectory(path, label) {
	await requireFile(path, label);
}

async function copyServerWithoutHls(source, target) {
	await mkdir(target, { recursive: true });
	for (const entry of await readdir(source, { withFileTypes: true })) {
		if (entry.name === 'hls') {
			continue;
		}
		await cp(join(source, entry.name), join(target, entry.name), { recursive: true });
	}
}

async function findInnoSetupCompiler() {
	const candidates = [
		process.env.ISCC_PATH,
		'C:\\Program Files (x86)\\Inno Setup 6\\ISCC.exe',
		'C:\\Program Files\\Inno Setup 6\\ISCC.exe',
		...(process.env.PATH ?? '')
			.split(';')
			.filter(Boolean)
			.map((directory) => join(directory, 'iscc.exe')),
	].filter(Boolean);

	for (const candidate of candidates) {
		try {
			await access(candidate, constants.X_OK);
			return candidate;
		} catch {}
	}

	throw new Error('未找到 Inno Setup 编译器，请安装 Inno Setup 6，或通过 ISCC_PATH 指定 ISCC.exe 路径');
}

function run(command, args) {
	return new Promise((resolveRun, rejectRun) => {
		const child = spawn(command, args, {
			cwd: rootDirectory,
			stdio: 'inherit',
			windowsHide: true,
		});
		child.once('error', rejectRun);
		child.once('close', (code) => {
			if (code === 0) {
				resolveRun();
				return;
			}
			rejectRun(new Error(`Inno Setup 编译失败，退出码: ${code ?? '未知'}`));
		});
	});
}

function createInnoScript({ executableName, applicationId, version }) {
	const executable = `${executableName}.exe`;
	return `; 由 build-installer.mjs 生成，勿直接修改
[Setup]
AppId=${applicationId}
AppName=动画管理服务
AppVersion=${version}
AppPublisher=动画管理服务
DefaultDirName={localappdata}\\Programs\\动画管理服务
DefaultGroupName=动画管理服务
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
ArchitecturesInstallIn64BitMode=x64compatible
OutputDir=${distDirectory}
OutputBaseFilename=${executableName}-setup
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
UninstallDisplayName=动画管理服务

[Files]
Source: "${applicationDirectory}\\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{autoprograms}\\动画管理服务"; Filename: "{app}\\${executable}"; WorkingDir: "{app}"; IconFilename: "{app}\\${executable}"; AppUserModelID: "${applicationId}"
Name: "{userdesktop}\\动画管理服务"; Filename: "{app}\\${executable}"; WorkingDir: "{app}"; IconFilename: "{app}\\${executable}"; AppUserModelID: "${applicationId}"

[Registry]
Root: HKCU; Subkey: "Software\\Classes\\AppUserModelId\\${applicationId}"; ValueType: string; ValueName: "DisplayName"; ValueData: "动画管理服务"; Flags: uninsdeletekey

[UninstallDelete]
Type: filesandordirs; Name: "{app}"
`;
}
