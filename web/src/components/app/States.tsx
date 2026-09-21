import type { ReactNode } from "react";
import { AlertCircle, Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { errorMessage } from "@/lib/http";

export function EmptyState({ title, description, action, icon, className }: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center gap-2 px-6 py-14 text-center", className)}>
      <span className="mb-1 text-muted-foreground [&_svg]:size-10">{icon ?? <Inbox strokeWidth={1.25} />}</span>
      <h3 className="text-headline text-foreground">{title}</h3>
      {description && <p className="max-w-sm text-subhead text-muted-foreground">{description}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

/** Error recuperable: dice qué pasó en cristiano y ofrece reintentar. */
export function ErrorState({ error, onRetry, className }: { error: unknown; onRetry?: () => void; className?: string }) {
  return (
    <div role="alert" className={cn("flex flex-col items-center gap-2 px-6 py-12 text-center", className)}>
      <AlertCircle className="mb-1 size-10 text-destructive" strokeWidth={1.25} />
      <h3 className="text-headline text-foreground">No se pudo cargar</h3>
      <p className="max-w-sm text-subhead text-muted-foreground">{errorMessage(error)}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" className="mt-3" onClick={onRetry}>
          Reintentar
        </Button>
      )}
    </div>
  );
}
