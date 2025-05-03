type Url = string;
type Title = string;
interface ReplaceUrlWithTitleOptions {
	body: string;
	urlTitleMap: Map<Url, Title>;
}

export const replaceUrlWithTitle = ({
	body,
	urlTitleMap,
}: ReplaceUrlWithTitleOptions): string => {
	return "";
};
