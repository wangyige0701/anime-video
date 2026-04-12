import { isDef } from '@wang-yige/utils';

export const DEV_WEB_PORT = 5173;

export const WEB_BUNDLE_DIR = 'www';

const configs = {
	port: {
		defined: false,
		value: 3001,
	},
};

/**
 * 获取 web 端服务端口
 */
export function getWebPort() {
	if (configs.port.defined) {
		return configs.port.value;
	}
	configs.port.defined = true;
	if (isDef(process.env.WEB_PORT) && !isNaN(Number(process.env.WEB_PORT))) {
		configs.port.value = Number(process.env.WEB_PORT);
	}
	return configs.port.value;
}
