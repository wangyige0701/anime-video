import { Status } from '~common/status';
import { ApiError } from '.';

export class NotFoundError extends ApiError {
	constructor(body?: any, message?: string, contentType?: string) {
		super(Status.NotFound, body, message, contentType);
	}
}

export class ImageNotFoundError extends NotFoundError {
	constructor(message: string, file?: string) {
		super('Image Not Found', `${message} ${file || ''}`, 'text/plain');
	}
}
