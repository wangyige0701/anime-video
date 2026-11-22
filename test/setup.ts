import config from '../shared/config-parser';

/**
 * Vitest 全局初始化。
 *
 * 服务端模块在导入阶段就会读取 `__APP_CONFIG__`（例如 `server/data/data.ts` 的保存延迟、
 * `server/data/common.ts` 的数据目录），所以必须在测试文件导入前把配置挂到全局。
 *
 * 两个环境变量与 `vitest.config.ts` 的 `test.env` 保持一致，这里再兜底一次，
 * 保证即使单独运行某个测试文件也不会读到正式数据文件名：
 * - `SERVER_VIDEO_CONFIG_PREFIX=test`：数据文件名为 `test.video.json`；
 * - `SERVER_DATA_FILE_SAVE_DELAY=0`：保存立即落盘，测试不必等待防抖。
 */
process.env.SERVER_VIDEO_CONFIG_PREFIX ||= 'test';
process.env.SERVER_DATA_FILE_SAVE_DELAY ||= '0';

// `server/env.d.ts` 把 `__APP_CONFIG__` 声明为 const 全局，用 Object.assign 绕过只读声明。
Object.assign(globalThis, { __APP_CONFIG__: config });
