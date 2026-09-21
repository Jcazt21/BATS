import { QueryClient } from "@tanstack/react-query";
import { ApiError } from "@/lib/http";

/**
 * Un solo cliente para toda la app. Reintenta solo lo que puede arreglarse solo
 * (red y 5xx): un 401/403/404 no mejora repitiéndolo.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 10 * 60_000,
      refetchOnWindowFocus: false,
      retry: (failures, error) => {
        if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false;
        return failures < 2;
      },
    },
  },
});
