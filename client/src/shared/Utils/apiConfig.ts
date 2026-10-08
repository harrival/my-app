declare var process: { env: { [key: string]: string | undefined } };

const BASE_URL: string = process.env.REACT_APP_API_URL || 'http://localhost:5001';

console.log(BASE_URL, "API URL")

export { BASE_URL };