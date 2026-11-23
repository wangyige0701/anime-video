export function getSeriesPath(...paths: string[]) {
	return paths.join('\\');
}

/**
 * 合并数组并去重，保留原数组顺序。
 *
 * 服务端的类型与图片 `add` 接口是追加语义，本地乐观值必须是「原值 + 新增」而不是新增数组本身。
 */
export function mergeUnique<T>(current: T[], added: T[]) {
	const result = current.slice();
	for (const item of added) {
		if (!result.includes(item)) {
			result.push(item);
		}
	}
	return result;
}

/**
 * 取图片相对系列目录的名称。
 *
 * 服务端的图片增删与排序接口只接受系列目录内的文件名（内部按 `path.join(directory, name)` 查找），
 * 而前端持有的图片是绝对路径，直接透传会因为路径被再次拼接而查不到文件、被服务端静默过滤。
 */
export function getSeriesImageName(directory: string, image: string) {
	const base = directory.replace(/[\\/]+$/, '');
	if (base && (image === base || image.startsWith(`${base}\\`) || image.startsWith(`${base}/`))) {
		return image.slice(base.length).replace(/^[\\/]+/, '');
	}
	const index = Math.max(image.lastIndexOf('\\'), image.lastIndexOf('/'));
	return index === -1 ? image : image.slice(index + 1);
}
