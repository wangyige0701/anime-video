import { runManager } from './daemon';

// 独立入口只负责启动常驻 manager，具体 IPC 和服务生命周期由 daemon 管理。
await runManager();
