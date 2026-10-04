import path from 'node:path';
import { realpath } from 'node:fs/promises';
import { type Command, InvalidArgumentError } from 'commander';
import { isDirectory } from '~server/src/utils/fs';

type SeriesData = typeof import('~server/data/series').Series;

export function addDirectoryCommands(program: Command) {
	const command = program.command('dir').description('管理视频根目录');

	command
		.command('list')
		.description('列出已配置的视频根目录')
		.option('--json', '以 JSON 格式输出目录')
		.action(async (options: { json?: boolean }) => {
			printDirectories(await getSeries().then((Series) => Series.getDirectories()), options.json === true);
		});

	command
		.command('set')
		.description('替换已配置的视频根目录')
		.argument('<directories...>', '一个或多个已存在的目录')
		.action(async (directories: string[]) => {
			const normalizedDirectories = await normalizeDirectories(directories);
			const Series = await getSeries();
			await Series.setDirectories(...normalizedDirectories);
			await Series.updateSeries();
			printDirectories(await Series.getDirectories());
		});

	command
		.command('add')
		.description('追加视频根目录')
		.argument('<directories...>', '一个或多个已存在的目录')
		.action(async (directories: string[]) => {
			const Series = await getSeries();
			const configuredDirectories = await Series.getDirectories();
			const normalizedDirectories = await normalizeDirectories(directories, configuredDirectories);
			await Series.addDirectories(...normalizedDirectories);
			await Series.updateSeries();
			printDirectories(await Series.getDirectories());
		});

	command
		.command('del')
		.description('按索引删除已配置的目录')
		.argument('<indexes...>', '使用空格或逗号分隔的索引')
		.action(async (values: string[]) => {
			const indexes = parseIndexes(values);
			const Series = await getSeries();
			const directories = await Series.getDirectories();
			for (const index of indexes) {
				if (index >= directories.length) {
					throw new InvalidArgumentError(`目录索引 ${index} 超出已配置范围`);
				}
			}
			await Series.delDirectories(...indexes);
			await Series.updateSeries();
			printDirectories(await Series.getDirectories());
		});

	command.action(() => {
		command.outputHelp();
	});
}

async function getSeries(): Promise<SeriesData> {
	return (await import('~server/data/series')).Series;
}

async function normalizeDirectories(directories: string[], configuredDirectories: string[] = []) {
	const knownDirectories = new Set(configuredDirectories);
	const normalizedDirectories: string[] = [];
	for (const directory of directories) {
		validateDirectoryArgument(directory);
		const resolvedDirectory = path.resolve(directory);
		if (!(await isDirectory(resolvedDirectory))) {
			throw new InvalidArgumentError(`目录不存在或不是目录：${directory}`);
		}

		let realDirectory: string;
		try {
			realDirectory = await realpath(resolvedDirectory);
		} catch {
			throw new InvalidArgumentError(`目录不存在或无法访问：${directory}`);
		}
		if (knownDirectories.has(realDirectory)) {
			throw new InvalidArgumentError(`目录重复：${directory}`);
		}
		knownDirectories.add(realDirectory);
		normalizedDirectories.push(realDirectory);
	}
	return normalizedDirectories;
}

export function validateDirectoryArgument(directory: string) {
	if (process.platform !== 'win32') {
		return;
	}

	const pathWithoutUncPrefix = directory.startsWith('\\\\') ? directory.slice(2) : directory;
	if (pathWithoutUncPrefix.includes('\\\\')) {
		throw new InvalidArgumentError(`Windows 目录路径格式无效：${directory}；除 UNC 路径前缀外，请使用单个反斜杠`);
	}
}

function parseIndexes(values: string[]) {
	const indexes = values.flatMap((value) => value.trim().split(/[\s,]+/)).filter(Boolean);
	if (indexes.some((value) => !/^\d+$/.test(value))) {
		throw new InvalidArgumentError('目录索引必须是使用空格或逗号分隔的非负整数');
	}

	const parsedIndexes = indexes.map((value) => Number(value));
	if (parsedIndexes.some((index) => !Number.isSafeInteger(index))) {
		throw new InvalidArgumentError('目录索引必须是安全整数');
	}
	if (new Set(parsedIndexes).size !== parsedIndexes.length) {
		throw new InvalidArgumentError('目录索引不能重复');
	}
	return parsedIndexes;
}

function printDirectories(directories: string[], asJson = false) {
	if (asJson) {
		process.stdout.write(`${JSON.stringify(directories)}\n`);
		return;
	}
	if (!directories.length) {
		process.stdout.write('未配置目录。\n');
		return;
	}

	process.stdout.write('索引   目录\n');
	for (const [index, directory] of directories.entries()) {
		process.stdout.write(`${String(index).padEnd(7)}${directory}\n`);
	}
}
