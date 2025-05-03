interface ReplaceUrlWithTitleContext {
	getTitle: (url: string) => Promise<string>;
}

interface ReplaceUrlWithTitleOptions {
	body: string;
}

export const replaceUrlWithTitle =
	(context: ReplaceUrlWithTitleContext) =>
	async ({ body }: ReplaceUrlWithTitleOptions) => {};
