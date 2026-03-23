import { NextResponse } from "next/server";
import { z } from "zod";
import { withBasePath } from "@/lib/basePath";
import { createPasswordHash } from "@/server/auth/session";
import { prisma } from "@/server/db/prisma";

const bootstrapSchema = z.object({
  username: z.string().trim().min(3),
  email: z.string().trim().email(),
  password: z.string().min(8),
  firstName: z.string().trim().min(1).default("Super"),
  lastName: z.string().trim().min(1).default("Admin"),
});

function noStoreJson(body: unknown, init?: { status?: number }) {
  return NextResponse.json(body, {
    status: init?.status ?? 200,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const setupKey = url.searchParams.get("key")?.trim() ?? "";
  const expectedSetupKey = process.env.SUPERADMIN_SETUP_KEY?.trim() ?? "";

  if (!expectedSetupKey) {
    return noStoreJson(
      { error: "Superadmin bootstrap is disabled (missing SUPERADMIN_SETUP_KEY)." },
      { status: 503 },
    );
  }

  if (!setupKey || setupKey !== expectedSetupKey) {
    return noStoreJson({ error: "Invalid setup key." }, { status: 401 });
  }

  const existingSuperadmin = await prisma.user.findFirst({
    where: { isSuperuser: true },
    select: { id: true, username: true },
  });
  if (existingSuperadmin) {
    return noStoreJson(
      {
        error: "Superadmin already exists. Bootstrap endpoint is now locked.",
        existing: { id: existingSuperadmin.id, username: existingSuperadmin.username },
      },
      { status: 409 },
    );
  }

  const parsed = bootstrapSchema.safeParse({
    username: process.env.SUPERADMIN_USERNAME,
    email: process.env.SUPERADMIN_EMAIL,
    password: process.env.SUPERADMIN_PASSWORD,
    firstName: process.env.SUPERADMIN_FIRST_NAME,
    lastName: process.env.SUPERADMIN_LAST_NAME,
  });
  if (!parsed.success) {
    return noStoreJson(
      {
        error:
          parsed.error.issues[0]?.message ??
          "Missing or invalid superadmin env vars.",
      },
      { status: 500 },
    );
  }

  const passwordHash = await createPasswordHash(parsed.data.password);

  try {
    const created = await prisma.user.create({
      data: {
        username: parsed.data.username,
        email: parsed.data.email,
        firstName: parsed.data.firstName,
        lastName: parsed.data.lastName,
        password: passwordHash,
        isSuperuser: true,
        isStaff: true,
        isActive: true,
        dateJoined: new Date(),
        lastLogin: new Date(),
      },
      select: {
        id: true,
        username: true,
        email: true,
      },
    });

    return noStoreJson({
      success: true,
      message: "Superadmin seeded successfully.",
      loginUrl: withBasePath("/login"),
      user: created,
      note: "For safety, remove SUPERADMIN_SETUP_KEY after first successful run.",
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create superadmin.";
    return noStoreJson({ error: message }, { status: 500 });
  }
}
