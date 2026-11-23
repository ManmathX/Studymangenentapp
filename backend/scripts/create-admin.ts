/**
 * Creates an admin account, or promotes an existing one: `npm run create-admin`.
 * Reads ADMIN_EMAIL, ADMIN_PASSWORD and ADMIN_NAME (plus MONGODB_URI) from the environment or .env.
 * An existing account keeps its password unless ADMIN_RESET_PASSWORD=true.
 */
import { loadConfig, loadDotEnvIfPresent } from '../src/config/env.js';
import { createLogger } from '../src/config/logger.js';
import { connectMongo, disconnectMongo } from '../src/database/mongoose.js';
import { registerBodySchema } from '../src/modules/auth/auth.schemas.js';
import { Argon2PasswordHasher } from '../src/modules/auth/password.service.js';
import { UserModel } from '../src/modules/users/user.model.js';

async function main(): Promise<void> {
  loadDotEnvIfPresent();
  const config = loadConfig();
  const logger = createLogger({ ...config, NODE_ENV: 'production' });

  const parsed = registerBodySchema.safeParse({
    name: process.env.ADMIN_NAME || 'Administrator',
    email: process.env.ADMIN_EMAIL ?? '',
    password: process.env.ADMIN_PASSWORD ?? '',
  });
  if (!parsed.success) {
    const problems = parsed.error.issues.map(
      (issue) => `  - ADMIN_${String(issue.path[0]).toUpperCase()}: ${issue.message}`,
    );
    throw new Error(`Set valid admin credentials:\n${problems.join('\n')}`);
  }
  const { name, email, password } = parsed.data;
  const resetPassword = process.env.ADMIN_RESET_PASSWORD === 'true';

  await connectMongo({ uri: config.MONGODB_URI, maxPoolSize: 2, autoIndex: true }, logger);
  try {
    const hasher = new Argon2PasswordHasher();
    const existing = await UserModel.findOne({ email });
    if (existing) {
      existing.role = 'admin';
      if (resetPassword) existing.passwordHash = await hasher.hash(password);
      await existing.save();
      console.log(`Promoted ${email} to admin${resetPassword ? ' and reset the password' : ''}.`);
    } else {
      await UserModel.create({
        email,
        name,
        passwordHash: await hasher.hash(password),
        role: 'admin',
      });
      console.log(`Created admin ${email}.`);
    }
  } finally {
    await disconnectMongo();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
