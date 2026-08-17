export function formatPercentage(value: number) {
	return `${Math.round(value)}%`;
}

export function formatMemory(used: number, total: number) {
	return `${formatBytes(used)} / ${formatBytes(total)}`;
}

export function formatBytes(bytes: number) {
	const gib = 1024 ** 3;
	return `${(bytes / gib).toFixed(1)} GB`;
}

export function normalizePercentage(value: number) {
	return Math.min(Math.max(value, 0), 100);
}
