import { Status } from '~common/status';

export class BaseError extends Error {
	code: Status;
	body: any;
	contentType: string;

	constructor(code: Status, body?: any, message?: string, contentType?: string) {
		super(message || 'Server Error');
		this.code = code;
		this.body = body;
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
