import FolderBrowser from "@/components/FolderBrowser";

export default async function DriveFolderPage({
  params,
}: {
  params: Promise<{ folderId: string }>;
}) {
  const { folderId } = await params;
  return <FolderBrowser folderId={folderId} />;
}
