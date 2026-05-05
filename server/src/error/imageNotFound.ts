import { NotFoundError } from './notFound';

export class ImageNotFoundError extends NotFoundError {
	constructor(message: string, file?: string) {
		super('Image Not Found', `${message} ${file || ''}`, 'text/plain');
	}
}
