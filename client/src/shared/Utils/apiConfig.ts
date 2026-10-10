declare var process: { env: { [key: string]: string | undefined } };

const getResolvedBaseUrl = (): string => {
  if (process.env.REACT_APP_API_URL && process.env.REACT_APP_API_URL.trim()) {
    return process.env.REACT_APP_API_URL.trim().replace(/\/+$/, '');
  }

  return 'https://my-app-frontend-production-34ef.up.railway.app';
};

const BASE_URL: string = getResolvedBaseUrl();

console.log(BASE_URL, "API URL");

export { BASE_URL, getResolvedBaseUrl };