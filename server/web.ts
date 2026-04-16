export {};

if (process.env.NODE_ENV === 'development') {
	await import('./web/development');
} else {
	await import('./web/production');
}
