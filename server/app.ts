import { start as startServer } from '~server/cli/server';
import { start as startWebServer } from '~server/cli/web';

const argvs = process.argv.slice(2);

const target = argvs[0];

if (target === 'web') {
	startWebServer();
} else if (target === 'server') {
	startServer();
}
