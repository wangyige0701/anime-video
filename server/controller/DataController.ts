import { Controller, Cross, Singleton } from 'koa-use-decorator-router';

@Singleton()
@Controller('/data')
@Cross()
export class DataController {}
