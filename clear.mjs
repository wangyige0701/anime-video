import { rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const distDirectory = fileURLToPath(new URL('./dist', import.meta.url));

// rm removes directory links themselves without traversing their targets.
await rm(distDirectory, {
	recursive: true,
	force: true,
	maxRetries: 3,
	retryDelay: 100,
});
