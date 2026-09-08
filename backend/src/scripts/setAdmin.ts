/**
 * Promote (or demote) a user to administrator by email.
 *
 * Usage:
 *   npm run set-admin -- user@example.com          # promote to ADMIN
 *   npm run set-admin -- user@example.com --demote  # demote to USER
 *
 * This is the bootstrap path for the very first admin, since there is no
 * admin in the system to grant the role through the API initially.
 */
import { prisma } from "../lib/prisma";

async function main() {
  const args = process.argv.slice(2);
  const email = args.find((a) => !a.startsWith("--"))?.trim().toLowerCase();
  const demote = args.includes("--demote");

  if (!email) {
    console.error("Usage: npm run set-admin -- <email> [--demote]");
    process.exit(1);
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    console.error(`No user found with email "${email}".`);
    process.exit(1);
  }

  const role = demote ? "USER" : "ADMIN";
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { systemRole: role },
    select: { id: true, name: true, email: true, systemRole: true },
  });

  console.log(`✔ ${updated.email} is now ${updated.systemRole}.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
