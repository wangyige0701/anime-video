export function formatDuration(seconds: number, totalDuration?: number) {
	const totalSeconds = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
	const days = Math.floor(totalSeconds / 86400);
	const hours = Math.floor((totalSeconds % 86400) / 3600);
	const minutes = Math.floor((totalSeconds % 3600) / 60);
	const remainingSeconds = totalSeconds % 60;
	const total = Number.isFinite(totalDuration) ? Math.max(0, Math.floor(totalDuration as number)) : undefined;
	const showDays = total !== undefined ? total >= 86400 : days > 0;
	const showHours = showDays || (total !== undefined ? total >= 3600 : hours > 0);

	const parts = [minutes, remainingSeconds].map((value) => value.toString().padStart(2, '0'));
	if (showHours) {
		parts.unshift(hours.toString().padStart(2, '0'));
	}
	if (showDays) {
		parts.unshift(days.toString().padStart(2, '0'));
	}

	return parts.join(':');
}
