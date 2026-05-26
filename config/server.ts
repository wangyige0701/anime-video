import { isDef } from '@wang-yige/utils';

const configs = {
	port: {
		defined: false,
		value: 3000,
	},
};

export const allowedImageExtensions = Object.freeze(['.jpg', '.jpeg', '.png', '.webp', '.gif']);
export const allowedVideoExtensions = Object.freeze(['.mp4', '.mkv', '.avi', '.flv']);

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

/**
 * 视频数据信息存放的文件名
 */
export const DATA_FILE = (process.env.VIDEO_CONFIG_PREFIX || '') + '.video.json';
