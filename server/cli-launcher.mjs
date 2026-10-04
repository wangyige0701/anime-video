import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const serverDirectory = fileURLToPath(new URL('.', import.meta.url));
const tsxCli = fileURLToPath(import.meta.resolve('tsx/cli'));

export function decodePnpmScriptArgument(argument) {
	if (process.platform !== 'win32') {
		return argument;
	}
	// pnpm run 在 Windows 拼接脚本参数时会复制反斜杠，这里只还原当前入口经过的一层。
	return argument.replaceAll('\\\\', '\\');
}

export async function main(argv = process.argv.slice(2)) {
	const forwardedArguments = argv[0] === 'cli' ? argv.slice(1) : argv;
	const pnpmLifecycleEvent = process.env.npm_lifecycle_event;
	const cliArguments =
		pnpmLifecycleEvent === 'server' || pnpmLifecycleEvent === 'cli'
			? forwardedArguments.map(decodePnpmScriptArgument)
			: forwardedArguments;
	const child = spawn(process.execPath, [tsxCli, 'cli.ts', ...cliArguments], {
		cwd: serverDirectory,
		stdio: 'inherit',
		windowsHide: true,
	});
	const exitCode = await new Promise((resolve, reject) => {
		child.once('error', reject);
		child.once('exit', resolve);
	});
	process.exitCode = exitCode ?? 1;
}

const entrypoint = process.argv[1];
if (entrypoint && import.meta.url === pathToFileURL(entrypoint).href) {
	try {
		await main();
	} catch (error) {
		console.error(error);
		process.exitCode = 1;
	}
}
