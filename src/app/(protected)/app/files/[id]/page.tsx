import { notFound } from "next/navigation";
import FileActions from "@/features/files/components/FileActions";
import FileDetailClient from "@/features/files/components/FileDetailClient";
import { requireSessionUser } from "@/server/auth/session";
import { departmentScopedWhere } from "@/server/authorization/permissions";
import { prisma } from "@/server/db/prisma";

export default async function FileDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const user = await requireSessionUser();
  const { id } = await params;
  const { tab } = await searchParams;

  const file = await prisma.processedFile.findFirst({
    where: { AND: [{ id: Number(id) }, departmentScopedWhere(user)] },
  });

  if (!file) {
    notFound();
  }

  return (
    <div className="space-y-4">
      <section className="nac-card p-4">
        <h1 className="nac-heading text-xl font-semibold">File #{file.id.toString()}</h1>
        <p className="text-sm">Status: {file.status}</p>
        <p className="text-xs text-slate-600">Use the actions below for preview, leave details, and reports.</p>
        <FileActions id={file.id.toString()} status={file.status} />
      </section>
      <FileDetailClient fileId={file.id.toString()} initialTab={tab === "leave" ? "leave" : "preview"} />
    </div>
  );
}
