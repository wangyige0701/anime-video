export {};

const argvs = process.argv.slice(2);

const target = argvs[0];

if (target === 'web') {
	const { default: getWebInstance } = await import('~server/cli/web');
	await getWebInstance().start();
} else if (target === 'server') {
	const { default: getServerInstance } = await import('~server/cli/server');
	await getServerInstance().start();
} else {
	console.error('Usage: pnpm app.ts <target>');
}
