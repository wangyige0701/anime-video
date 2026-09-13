import getServerInstance from '~server/cli/server';
import getWebInstance from '~server/cli/web';

const argvs = process.argv.slice(2);

const target = argvs[0];

if (target === 'web') {
	await getWebInstance().start();
} else if (target === 'server') {
	await getServerInstance().start();
} else {
	console.error('Usage: pnpm app.ts <target>');
}
