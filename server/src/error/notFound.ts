import { Status } from '~common/status';
import { ApiError } from './error';

export class NotFoundError extends ApiError {
	constructor(body?: any, message?: string, contentType?: string) {
		super(Status.NotFound, body, message, contentType);
	}
}
