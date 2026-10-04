import path from 'node:path';
import { realpath } from 'node:fs/promises';
import { type Command, InvalidArgumentError } from 'commander';
import { isDirectory } from '~server/src/utils/fs';

type SeriesData = typeof import('~server/data/series').Series;

export function addDirectoryCommands(program: Command) {
	const command = program.command('dir').description('Manage video root directories');

	command
		.command('list')
		.description('List configured video root directories')
		.option('--json', 'Output directories as JSON')
		.action(async (options: { json?: boolean }) => {
			printDirectories(await getSeries().then((Series) => Series.getDirectories()), options.json === true);
		});

	command
		.command('set')
		.description('Replace configured video root directories')
		.argument('<directories...>', 'one or more existing directories')
		.action(async (directories: string[]) => {
			const normalizedDirectories = await normalizeDirectories(directories);
			const Series = await getSeries();
			await Series.setDirectories(...normalizedDirectories);
			await Series.updateSeries();
			printDirectories(await Series.getDirectories());
		});

	command
		.command('del')
		.description('Delete configured directories by index')
		.argument('<indexes...>', 'indexes separated by spaces or commas')
		.action(async (values: string[]) => {
			const indexes = parseIndexes(values);
			const Series = await getSeries();
			const directories = await Series.getDirectories();
			for (const index of indexes) {
				if (index >= directories.length) {
					throw new InvalidArgumentError(`directory index ${index} is outside the configured range`);
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

async function normalizeDirectories(directories: string[]) {
	const normalizedDirectories = new Set<string>();
	for (const directory of directories) {
		const resolvedDirectory = path.resolve(normalizeWindowsDirectorySeparators(directory));
		if (!(await isDirectory(resolvedDirectory))) {
			throw new InvalidArgumentError(`directory does not exist or is not a directory: ${directory}`);
		}

		let realDirectory: string;
		try {
			realDirectory = await realpath(resolvedDirectory);
		} catch {
			throw new InvalidArgumentError(`directory does not exist or cannot be accessed: ${directory}`);
		}
		if (normalizedDirectories.has(realDirectory)) {
			throw new InvalidArgumentError(`duplicate directory: ${directory}`);
		}
		normalizedDirectories.add(realDirectory);
	}
	return [...normalizedDirectories];
}

function normalizeWindowsDirectorySeparators(directory: string) {
	if (process.platform !== 'win32' || directory.startsWith('\\\\')) {
		return directory;
	}
	return directory.replace(/\\{2,}/g, '\\');
}

function parseIndexes(values: string[]) {
	const indexes = values.flatMap((value) => value.trim().split(/[\s,]+/)).filter(Boolean);
	if (indexes.some((value) => !/^\d+$/.test(value))) {
		throw new InvalidArgumentError('directory indexes must be non-negative integers separated by spaces or commas');
	}

	const parsedIndexes = indexes.map((value) => Number(value));
	if (parsedIndexes.some((index) => !Number.isSafeInteger(index))) {
		throw new InvalidArgumentError('directory indexes must be safe integers');
	}
	if (new Set(parsedIndexes).size !== parsedIndexes.length) {
		throw new InvalidArgumentError('directory indexes must not be repeated');
	}
	return parsedIndexes;
}

function printDirectories(directories: string[], asJson = false) {
	if (asJson) {
		process.stdout.write(`${JSON.stringify(directories)}\n`);
		return;
	}
	if (!directories.length) {
		process.stdout.write('No directories configured.\n');
		return;
	}

	process.stdout.write('INDEX  DIRECTORY\n');
	for (const [index, directory] of directories.entries()) {
		process.stdout.write(`${String(index).padEnd(7)}${directory}\n`);
	}
}
