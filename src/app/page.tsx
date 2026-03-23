import { redirect } from "next/navigation";
import { getSessionUser } from "@/server/auth/session";
import { withBasePath } from "@/lib/basePath";

export default async function HomePage() {
  const user = await getSessionUser();
  redirect(user ? withBasePath("/app") : withBasePath("/login"));
}
