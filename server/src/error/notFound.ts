import { Status } from '~common/status';
import { BaseError } from './error';

export class NotFoundError extends BaseError {
	constructor(body?: any, message?: string, contentType?: string) {
		super(Status.NotFound, body, message, contentType);
	}
}
