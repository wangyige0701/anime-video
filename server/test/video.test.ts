import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { getDirectories, getSeriesInfos, refreshSeriesInfo, setDirectories } from '@server/src/videos';

describe('Video Config', () => {
	const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), './videos');

	it('setting directory', async () => {
		await setDirectories(dir);
		const datas = await getDirectories();
		expect(datas).toEqual([dir]);
	});

	it('create video config file', async () => {
		await refreshSeriesInfo();
		console.log(await getSeriesInfos());
	});
});
