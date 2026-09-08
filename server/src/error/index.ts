import { Status } from '~shared/http-status';
import { Response } from '~server/middlewares/response';

export class ApiError extends Error {
	code: Status;
	body: any;
	contentType: string;

	constructor(code: Status, body?: any, message?: string, contentType?: string) {
		super(message || 'Server Error');
		this.code = code;
		if (body instanceof Response) {
			this.body = body.getBody();
		} else {
			this.body = body;
		}
		this.contentType = contentType || 'text/plain';
	}

	getCode() {
		return this.code;
	}

	getBody() {
		return this.body;
	}

	getContentType() {
		return this.contentType;
	}
}
