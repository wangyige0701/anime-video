export class Common {
	declare protected static cache: Map<string, any>;

	public static clearCache() {
		this.cache.clear();
	}

	public static deleteCache(id: string) {
		this.cache.delete(id);
	}

	public static hasCache(id: string) {
		return this.cache.has(id);
	}
}
