import { isRegExp } from '@wang-yige/utils';

enum ParseState {
	Slash = 'slash',
	Path = 'path',
}

enum ParseStr {
	Slash = '/',
}

export function parseRequest(requestPath: string) {
	const paths = [] as string[];
	let str = requestPath;
	let index = 0;
	let state = ParseState.Slash as ParseState;
	let path = '';

	if (!str.startsWith(ParseStr.Slash)) {
		str = ParseStr.Slash + str;
	}
	while (index < requestPath.length) {
		const value = str.substring(index, index + 1);
		index++;
		switch (state) {
			case ParseState.Slash: {
				if (value !== ParseStr.Slash) {
					state = ParseState.Path;
					index--;
				}
				continue;
			}
			case ParseState.Path: {
				if (value === ParseStr.Slash) {
					state = ParseState.Slash;
					path && paths.push(path);
					path = '';
					continue;
				}
				path += value;
				continue;
			}
			default:
				continue;
		}
	}

	path && paths.push(path);

	return {
		match(...modules: Array<string | RegExp>) {
			for (const [index, module] of modules.entries()) {
				const path = paths[index];
				if (isRegExp(module)) {
					if (!module.test(path)) {
						return false;
					}
				} else {
					if (String(module) !== path) {
						return false;
					}
				}
			}
			return true;
		},
	};
}
