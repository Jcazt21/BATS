import { PageHeader } from "@/components/app/PageHeader";
import { EmptyState } from "@/components/app/States";

export function PokedexPage() {
  return (
    <div className="flex flex-col gap-8">
      <PageHeader title="Pokédex" />
      <EmptyState title="Próximamente: tu Pokédex por cuenta" />
    </div>
  );
}
