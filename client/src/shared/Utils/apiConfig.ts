declare var process: { env: { [key: string]: string | undefined } };

const getResolvedBaseUrl = (): string => {
  if (process.env.REACT_APP_API_URL && process.env.REACT_APP_API_URL.trim()) {
    return process.env.REACT_APP_API_URL.trim().replace(/\/+$/, '');
  }

  if (
    typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
  ) {
    return 'http://localhost:5001';
  }

  return 'www.triplegreatgame.com';
};

const BASE_URL: string = getResolvedBaseUrl();

console.log(BASE_URL, "API URL");

export { BASE_URL, getResolvedBaseUrl };