import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { hash, compare } from 'bcryptjs';
import { usersRepo, logAudit, type DrizzleClient, type UserRow } from '@digital-twin/db';

declare module 'fastify' {
  interface FastifyRequest {
    authUser?: UserRow;
  }
}

const publicUser = (u: UserRow) => ({ id: u.id, email: u.email, name: u.name });

/** Register /api/auth routes. JWT must already be registered on the app. */
export function registerAuth(app: FastifyInstance, db: DrizzleClient): void {
  // ── register ────────────────────────────────────────────────────────────────
  app.post('/api/auth/register', async (req, reply) => {
    const body = req.body as { email?: string; name?: string; password?: string };
    if (!body.email || !body.name || !body.password) {
      return reply.code(400).send({ error: 'email, name and password are required' });
    }
    if (body.password.length < 8) {
      return reply.code(400).send({ error: 'password must be at least 8 characters' });
    }
    const existing = usersRepo.byEmail(db, body.email);
    if (existing) {
      return reply.code(409).send({ error: 'email already registered' });
    }

    const user = usersRepo.create(db, {
      email: body.email.toLowerCase(),
      name: body.name,
      passwordHash: await hash(body.password, 10),
    });
    logAudit(db, { userId: user.id, action: 'user.registered', entityType: 'users', entityId: user.id });

    return reply.code(201).send({ token: app.jwt.sign({ sub: user.id }), user: publicUser(user) });
  });

  // ── login ───────────────────────────────────────────────────────────────────
  app.post('/api/auth/login', async (req, reply) => {
    const body = req.body as { email?: string; password?: string };
    if (!body.email || !body.password) {
      return reply.code(400).send({ error: 'email and password are required' });
    }
    const user = usersRepo.byEmail(db, body.email.toLowerCase());
    if (!user || !(await compare(body.password, user.passwordHash))) {
      return reply.code(401).send({ error: 'invalid credentials' });
    }

    return { token: app.jwt.sign({ sub: user.id }), user: publicUser(user) };
  });

  // ── me ──────────────────────────────────────────────────────────────────────
  app.get('/api/auth/me', { preHandler: [authenticate] }, async (req, reply) => {
    if (!req.authUser) return reply.code(401).send({ error: 'user not found' });
    return publicUser(req.authUser);
  });
}

/** PreHandler: verify Bearer JWT, load the user into req.user. */
export async function authenticate(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token) return reply.code(401).send({ error: 'missing token' });

  try {
    const decoded = req.server.jwt.verify<{ sub: string }>(token);
    const user = usersRepo.byId(req.server.db, decoded.sub);
    if (!user) return reply.code(401).send({ error: 'user not found' });
    req.authUser = user;
  } catch {
    return reply.code(401).send({ error: 'invalid token' });
  }
}
