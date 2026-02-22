interface ParsedPath {
	protocol: string;
	host: string;
	port: string;
	pathname: string;
	query: Record<string, string>;
}

enum ParseState {
	Protocol = 'protocol',
	ProtocolStartSlash = 'protocolStartSlash',
	ProtocolEndSlash = 'protocolEndSlash',
	Host = 'host',
	Path = 'path',
	QueryKey = 'queryKey',
	QueryValue = 'queryValue',
	Port = 'port',
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
	let state = ParseState.Protocol as ParseState;
	const result: ParsedPath = {
		protocol: '',
		host: '',
		port: '',
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
				if (value === ParseStr.Colon) {
					state = ParseState.Port;
					continue;
				}
				if (value === ParseStr.Slash) {
					state = ParseState.Path;
					index--;
					continue;
				}
				result.host += value;
				continue;
			}
			case ParseState.Port: {
				if (value === ParseStr.Slash) {
					state = ParseState.Path;
					index--;
					continue;
				}
				result.port += value;
				continue;
			}
			case ParseState.Path: {
				if (value === ParseStr.Question) {
					state = ParseState.QueryKey;
					continue;
				}
				result.pathname += value;
				continue;
			}
			case ParseState.QueryKey: {
				if (value === ParseStr.Equal) {
					state = ParseState.QueryValue;
					continue;
				}
				queryKey += value;
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
					continue;
				}
				queryValue += value;
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
