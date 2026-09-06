import { Writable } from 'node:stream';
import { parentPort } from 'node:worker_threads';
import { LOG_CLOSE } from '../../dist/log-protocol.js';

export default function createStalledTransport() {
	const stream = new Writable({
		write(_chunk, _encoding, callback) {
			callback();
		},
		final() {
			// 模拟不能完成的底层关闭操作，验证主线程仍能执行超时并终止 worker。
		},
	});
	parentPort.on('message', (message) => {
		if (message?.code === LOG_CLOSE) {
			stream.end();
		}
	});
	return stream;
}
