declare var process: { env: { [key: string]: string | undefined } };

const BASE_URL: string = process.env.REACT_APP_API_BASE_URL || 'http://localhost:5001';

export { BASE_URL };