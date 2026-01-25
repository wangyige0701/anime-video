interface ParsedPath {
	protocol: string;
	host: string;
	pathname: string;
	query: Record<string, string>;
}

enum ParseState {
	Protocol = 0,
	ProtocolStartSlash = 0.5,
	ProtocolEndSlash = 0.7,
	Host = 1,
	Path = 2,
	QueryKey = 3,
	QueryValue = 4,
}

enum ParseStr {
	Colon = ':',
	Slash = '/',
	Question = '?',
	Equal = '=',
	Ampersand = '&',
}

export function parsePath(url: string) {
	let str = url;
	let index = 0;
	let state: ParseState = ParseState.Protocol as ParseState;
	const result: ParsedPath = {
		protocol: '',
		host: '',
		pathname: '',
		query: {},
	};
	let queryKey = '';
	let queryValue = '';

	while (index < str.length) {
		const value = str.substring(index, index + 1);
		index++;
		switch (state) {
			case ParseState.Protocol: {
				if (value === ParseStr.Colon) {
					// 协议把 `:` 也加上
					state = ParseState.ProtocolStartSlash;
				}
				result.protocol += value;
				continue;
			}
			case ParseState.ProtocolStartSlash: {
				if (value === ParseStr.Slash) {
					state = ParseState.ProtocolEndSlash;
				}
				continue;
			}
			case ParseState.ProtocolEndSlash: {
				state = ParseState.Host;
				continue;
			}
			case ParseState.Host: {
				if (value === ParseStr.Slash) {
					state = ParseState.Path;
					index--;
				} else {
					result.host += value;
				}
				continue;
			}
			case ParseState.Path: {
				if (value === ParseStr.Question) {
					state = ParseState.QueryKey;
				} else {
					result.pathname += value;
				}
				continue;
			}
			case ParseState.QueryKey: {
				if (value === ParseStr.Equal) {
					state = ParseState.QueryValue;
				} else {
					queryKey += value;
				}
				continue;
			}
			case ParseState.QueryValue: {
				if (value === ParseStr.Ampersand) {
					if (queryKey) {
						result.query[queryKey] = queryValue;
					}
					queryKey = '';
					queryValue = '';
					state = ParseState.QueryKey;
				} else {
					queryValue += value;
				}
				continue;
			}
			default: {
				continue;
			}
		}
	}
	if (queryKey) {
		result.query[queryKey] = queryValue;
	}
	return result;
}
