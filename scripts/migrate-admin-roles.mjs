import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Migrating all legacy ADMIN users to SYSTEM_ADMIN in PostgreSQL...");
  try {
    const updatedCount = await prisma.$executeRawUnsafe(
      `UPDATE "User" SET role = 'SYSTEM_ADMIN'::"Role" WHERE role::text = 'ADMIN';`
    );
    console.log(`Success! Updated ${updatedCount} user(s) from ADMIN to SYSTEM_ADMIN.`);
  } catch (err) {
    console.error("Migration failed:", err.message);
  } finally {
    await prisma.$disconnect();
  }
}

main();
