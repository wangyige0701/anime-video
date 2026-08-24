export function isEditingElement(target: EventTarget | null) {
	return target instanceof Element && Boolean(target.closest('input, textarea, select, button, [contenteditable]'));
}
