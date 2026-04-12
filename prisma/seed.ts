import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required");
}

const adapter = new PrismaPg(new Pool({ connectionString }));
const prisma = new PrismaClient({ adapter });

async function upsertUser(input: {
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  password: string;
  isSuperuser: boolean;
  isStaff: boolean;
}) {
  const hashed = await bcrypt.hash(input.password, 12);
  await prisma.user.upsert({
    where: { username: input.username },
    update: {
      email: input.email,
      firstName: input.firstName,
      lastName: input.lastName,
      password: hashed,
      isSuperuser: input.isSuperuser,
      isStaff: input.isStaff,
      isActive: true,
      lastLogin: new Date(),
    },
    create: {
      username: input.username,
      email: input.email,
      firstName: input.firstName,
      lastName: input.lastName,
      password: hashed,
      isSuperuser: input.isSuperuser,
      isStaff: input.isStaff,
      isActive: true,
      dateJoined: new Date(),
      lastLogin: new Date(),
    },
  });
}

async function main() {
  await upsertUser({
    username: "superadmin",
    email: "superadmin@nac.com",
    firstName: "Super",
    lastName: "Admin",
    password: "superadmin123",
    isSuperuser: true,
    isStaff: true,
  });

  await upsertUser({
    username: "admin",
    email: "admin@nac.com.np",
    firstName: "Admin",
    lastName: "User",
    password: "admin123",
    isSuperuser: false,
    isStaff: true,
  });

  await upsertUser({
    username: "manager",
    email: "manager@nac.com",
    firstName: "Manager",
    lastName: "User",
    password: "manager123",
    isSuperuser: false,
    isStaff: false,
  });

  await upsertUser({
    username: "user",
    email: "user@nac.com",
    firstName: "Regular",
    lastName: "User",
    password: "user123",
    isSuperuser: false,
    isStaff: false,
  });

  console.log("Seed complete");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
