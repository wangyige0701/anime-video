export class Common {
	declare protected static cache: Map<string, any>;

	public static clearCache() {
		this.cache.clear();
	}
}
