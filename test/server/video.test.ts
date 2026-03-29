import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'vitest';
import { getDirectories, refreshSeriesInfo, setDirectories } from '@server/src/videos';

describe('Video Config', () => {
	const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../videos');

	it('should get directoy config', async () => {
		// setDirectories(dir);

		// const datas = getDirectories();
		// console.log(datas);

		refreshSeriesInfo();
	});
});
