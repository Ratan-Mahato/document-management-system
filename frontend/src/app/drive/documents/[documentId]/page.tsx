import DocumentDetail from "@/components/DocumentDetail";

export default async function DocumentDetailPage({
  params,
}: {
  params: Promise<{ documentId: string }>;
}) {
  const { documentId } = await params;
  return <DocumentDetail documentId={documentId} />;
}
