import 'dotenv/config';

export function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function optionalEnv(name, fallback = '') {
  return process.env[name] ?? fallback;
}

export function splitList(value) {
  return (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export function mask(value) {
  if (!value) return 'missing';
  if (value.length <= 8) return 'present';
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}
