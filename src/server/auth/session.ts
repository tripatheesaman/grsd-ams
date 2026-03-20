import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { createHmac, timingSafeEqual } from "node:crypto";
import { prisma } from "@/server/db/prisma";
import type { SessionUser } from "@/server/types";
import { basePath } from "@/lib/basePath";

const SESSION_COOKIE = "nac_session";
const SECRET = (() => {
  const value = process.env.AUTH_SECRET;
  if (!value) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("AUTH_SECRET must be set in production");
    }
    throw new Error("AUTH_SECRET must be set");
  }
  return value;
})();

type SessionPayload = {
  uid: string;
  sig: string;
};

function sign(uid: string) {
  return createHmac("sha256", SECRET).update(uid).digest("hex");
}

function encode(payload: SessionPayload) {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function decode(raw: string): SessionPayload | null {
  try {
    return JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export async function createPasswordHash(password: string) {
  return bcrypt.hash(password, 12);
}

export async function loginWithUsername(username: string, password: string) {
  const user = await prisma.user.findUnique({ where: { username } });
  if (!user || !user.isActive) {
    return null;
  }

  const ok = await verifyPassword(password, user.password);
  if (!ok) {
    return null;
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { lastLogin: new Date() },
  });

  const uid = user.id.toString();
  const sig = sign(uid);
  const token = encode({ uid, sig });

  const jar = await cookies();
  const cookiePath = basePath || "/";
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: cookiePath,
    maxAge: 60 * 60 * 24 * 7,
  });

  return user;
}

export async function logout() {
  const jar = await cookies();
  const cookiePath = basePath || "/";
  jar.set(SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: cookiePath,
    maxAge: 0,
  });
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const raw = jar.get(SESSION_COOKIE)?.value;
  if (!raw) {
    return null;
  }

  const payload = decode(raw);
  if (!payload) {
    return null;
  }

  const expected = sign(payload.uid);
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(payload.sig, "utf8");
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return null;
  }

  const user = await prisma.user.findUnique({ where: { id: Number(payload.uid) } });
  if (!user || !user.isActive) {
    return null;
  }

  return {
    id: user.id,
    username: user.username,
    firstName: user.firstName,
    lastName: user.lastName,
    isSuperuser: user.isSuperuser,
    departmentId: user.departmentId,
  };
}

export async function requireSessionUser() {
  const user = await getSessionUser();
  if (!user) {
    redirect("/login");
  }
  return user;
}

export async function requireApiUser() {
  const user = await getSessionUser();
  return user;
}

