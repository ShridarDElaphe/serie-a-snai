import { MatchBoard } from "@/components/MatchBoard";

export default async function MatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <MatchBoard id={id} />;
}
