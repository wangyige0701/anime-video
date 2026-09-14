import { pathToFileURL } from 'node:url';
import { Command, InvalidArgumentError, Option } from 'commander';
import config from '~shared/config-parser';
import packageJson from './package.json';
import { request } from './cli/manager/client';
import type { ManagerAction, ManagerResponse, ServiceName } from './cli/manager/protocol';

type ActionName = Exclude<ManagerAction, 'status'>;

const serviceNames: readonly ServiceName[] = ['server', 'web'];
const configOptionNames = new Set<string>();

const program = new Command()
	.name('anime-video')
	.description('本地视频服务器命令行服务')
	.version(packageJson.version, '-v, --version', '显示版本号')
	.helpOption('-h, --help', '显示帮助信息');

function addConfigOptions(command: Command) {
	for (const [section, sectionConfig] of Object.entries(config)) {
		for (const [key, defaultValue] of Object.entries(sectionConfig)) {
			const optionKey = `${section}-${toKebabCase(key)}`;
			configOptionNames.add(optionKey);
			const optionName = `--${optionKey} <value>`;
			const description = `${section}.${key} (default: ${formatDefault(defaultValue)})`;
			command.addOption(new Option(optionName, description));
		}
	}
}

function formatDefault(value: unknown) {
	if (typeof value === 'string') {
		return value === '' ? 'empty string' : JSON.stringify(value);
	}
	try {
		return JSON.stringify(value);
	} catch {
		return String(value);
	}
}

function toKebabCase(key: string) {
	return key
		.replace(/([a-z0-9])([A-Z])/g, '$1-$2')
		.replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2')
		.replace(/[_\s]+/g, '-')
		.toLowerCase();
}

addConfigOptions(program);
program.showHelpAfterError('(使用 --help 查看完整帮助)');

function parseService(value: string): ServiceName {
	if ((serviceNames as readonly string[]).includes(value)) {
		return value as ServiceName;
	}
	throw new InvalidArgumentError(`service must be one of: ${serviceNames.join(', ')}`);
}

async function invoke(action: ManagerAction, target: ServiceName | undefined, argv: readonly string[]) {
	const result = await request(action, target, argv);
	if (!result.ok) {
		throw new Error(result.message ?? `manager action failed: ${action}`);
	}
	return result;
}

function addAction(name: ActionName, description: string) {
	const command = program
		.command(name)
		.description(description)
		.argument('[service]', '要操作的服务（server 或 web），省略时同时操作两者', parseService);
	addConfigOptions(command);
	command.action(async (service?: ServiceName) => {
		await invoke(name, service, activeArgv.slice(2));
	});
}

addAction('start', '启动 server 和 web 服务');
addAction('stop', '停止 server 和 web 服务');
addAction('restart', '重启 server 和 web 服务');

const statusCommand = program
	.command('status')
	.description('查看 server 和 web 服务状态')
	.argument('[service]', '要查看的服务（server 或 web），省略时查看两者', parseService)
	.option('--json', '以 JSON 输出状态');
statusCommand.action(async (service: ServiceName | undefined, options: { json?: boolean }) => {
	const result = await invoke('status', service, activeArgv.slice(2));
	printStatus(result, options.json === true);
});

program.addHelpText(
	'after',
	'\nConfiguration options use --section-field or --section-field=value. Values are interpreted according to config.yaml; environment variables are used when no command-line override is supplied.\n\nExamples:\n  anime-video start\n  anime-video restart server --server-port 4000\n  anime-video start web --web-port=3001 --logging-file-enabled=false\n',
);

export { program };

let activeArgv: readonly string[] = process.argv;

export async function main(argv = process.argv) {
	try {
		activeArgv = argv;
		// 无参数调用只展示帮助，避免 commander 将缺少子命令视为失败。
		if (argv.length <= 2) {
			program.outputHelp();
			return;
		}
		await program.parseAsync(normalizeArgv(argv));
	} catch (error) {
		program.error(error instanceof Error ? error.message : String(error));
	}
}

function printStatus(result: ManagerResponse, asJson: boolean) {
	const services = result.services ?? [];
	if (asJson) {
		process.stdout.write(
			`${JSON.stringify({ version: result.version, managerId: result.managerId ?? null, services })}\n`,
		);
		return;
	}
	process.stdout.write('SERVICE  STATE      PID    UPTIME    RESTARTS  LAST ERROR\n');
	for (const service of services) {
		const state = `${stateIcon(service.state)} ${service.state}`;
		const pid = service.pid === null ? '-' : String(service.pid);
		const uptime = formatDuration(service.uptimeMs);
		process.stdout.write(
			`${service.service.padEnd(8)}${state.padEnd(11)}${pid.padEnd(7)}${uptime.padEnd(10)}${String(service.restartCount).padEnd(10)}${service.lastError ?? '-'}\n`,
		);
	}
}

function stateIcon(state: string) {
	if (state === 'running') {
		return '●';
	}
	if (state === 'starting' || state === 'stopping' || state === 'backoff') {
		return '◐';
	}
	if (state === 'failed') {
		return '✖';
	}
	return '○';
}

function formatDuration(milliseconds: number) {
	const totalSeconds = Math.floor(milliseconds / 1000);
	const seconds = totalSeconds % 60;
	const minutes = Math.floor(totalSeconds / 60) % 60;
	const hours = Math.floor(totalSeconds / 3600);
	return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function normalizeArgv(argv: readonly string[]) {
	return argv.map((argument) => {
		const match = argument.match(/^--([A-Za-z][A-Za-z0-9_-]*)(=.*)?$/);
		if (!match) {
			return argument;
		}
		const normalized = match[1]!.replace(/_/g, '-').toLowerCase();
		if (!configOptionNames.has(normalized)) {
			return argument;
		}
		return `--${normalized}${match[2] ?? ''}`;
	});
}

const entrypoint = process.argv[1];
if (entrypoint && import.meta.url === pathToFileURL(entrypoint).href) {
	await main();
}
