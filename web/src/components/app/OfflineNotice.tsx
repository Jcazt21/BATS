import { useEffect, useSyncExternalStore } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ErrorState } from "@/components/app/States";

function subscribe(notify: () => void) {
  window.addEventListener("online", notify);
  window.addEventListener("offline", notify);
  return () => {
    window.removeEventListener("online", notify);
    window.removeEventListener("offline", notify);
  };
}

/** Avisa de que no hay red y ofrece reintentar; al volver la conexión, refresca los datos solo. */
export function OfflineNotice() {
  const online = useSyncExternalStore(subscribe, () => navigator.onLine, () => true);
  const qc = useQueryClient();

  useEffect(() => {
    const refresh = () => void qc.invalidateQueries();
    window.addEventListener("online", refresh);
    return () => window.removeEventListener("online", refresh);
  }, [qc]);

  if (online) return null;
  return (
    <div className="mx-auto w-full max-w-6xl px-4 pt-4 sm:px-6">
      <ErrorState
        className="rounded-2xl bg-card py-6 shadow-sm ring-1 ring-border"
        title="Sin conexión"
        error={new Error("Revisa tu red: lo que ves puede estar desactualizado.")}
        onRetry={() => void qc.invalidateQueries()}
      />
    </div>
  );
}
