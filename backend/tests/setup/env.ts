// Runs before every test file. Keeps tests independent of any local .env file.
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';
