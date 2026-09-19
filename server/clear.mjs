import { mkdir, rm, copyFile } from 'node:fs/promises';

await rm('./dist', { recursive: true, force: true });
await mkdir('./dist', { recursive: true });
await copyFile('../config.yaml', './dist/config.yaml');
