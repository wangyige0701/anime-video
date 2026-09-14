import { pathToFileURL } from 'node:url';
import { Command, InvalidArgumentError, Option } from 'commander';
import packageJson from './package.json';
import config from '~shared/config-parser';

type ServiceName = 'server' | 'web';
type ActionName = 'start' | 'stop' | 'restart';
type ServiceModule = {
	start: () => Promise<unknown>;
	stop: () => Promise<unknown>;
	restart: () => Promise<unknown>;
};

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

async function loadService(name: ServiceName): Promise<ServiceModule> {
	return name === 'server' ? (await import('./cli/server')).default() : (await import('./cli/web')).default();
}

async function invoke(action: ActionName, target?: ServiceName) {
	const targets = target ? [target] : serviceNames;
	const modules = await Promise.all(targets.map((name) => loadService(name)));
	await Promise.all(modules.map((service) => service[action]()));
}

function addAction(name: ActionName, description: string) {
	const command = program
		.command(name)
		.description(description)
		.argument('[service]', '要操作的服务（server 或 web），省略时同时操作两者', parseService);
	addConfigOptions(command);
	command.action(async (service?: ServiceName) => {
		await invoke(name, service);
	});
}

addAction('start', '启动 server 和 web 服务');
addAction('stop', '停止 server 和 web 服务');
addAction('restart', '重启 server 和 web 服务');

program.addHelpText(
	'after',
	'\nConfiguration options use --section-field or --section-field=value. Values are interpreted according to config.yaml; environment variables are used when no command-line override is supplied.\n\nExamples:\n  anime-video start\n  anime-video restart server --server-port 4000\n  anime-video start web --web-port=3001 --logging-file-enabled=false\n',
);

export { program };

export async function main(argv = process.argv) {
	try {
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
