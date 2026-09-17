import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';

export function runtimePath(caller: string, relativePath: string) {
	const callerPath = caller.startsWith('file:') ? fileURLToPath(caller) : caller;

	return resolve(dirname(callerPath), relativePath);
}
