import { isDef } from '@wang-yige/utils';

const configs = {
	port: {
		defined: false,
		value: 3000,
	},
};

/**
 * 获取服务器端口
 */
export function getServerPort() {
	if (configs.port.defined) {
		return configs.port.value;
	}
	configs.port.defined = true;
	if (isDef(process.env.SERVER_PORT) && !isNaN(Number(process.env.SERVER_PORT))) {
		configs.port.value = Number(process.env.SERVER_PORT);
	}
	return configs.port.value;
}
