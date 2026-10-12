import { env } from '../config/env';

// TLS is verified against the stack's CA; config/env refuses TLS without one.
export const sslConfig = env.DATABASE_SSL
  ? { rejectUnauthorized: true, ca: env.DATABASE_CA_CERT }
  : false;
