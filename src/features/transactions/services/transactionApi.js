import secureFetch, { getAuthToken } from "../../../utils/secureFetch";

export const txApiRequest = (path, options) => secureFetch(path, options);

export const txApiGetAuthToken = () => getAuthToken();
