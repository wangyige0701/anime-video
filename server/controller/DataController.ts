import { Controller, Cross, Singleton } from 'koa-use-decorator-route';

@Singleton()
@Controller('/data')
@Cross()
export class DataController {}
