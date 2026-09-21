import { createContext, useContext } from "react";

export type ToastTone = "default" | "success" | "error";

export interface ToastInput {
  title: string;
  description?: string;
  tone?: ToastTone;
}

export interface ToastApi {
  toast: (t: ToastInput) => void;
}

export const ToastContext = createContext<ToastApi>({ toast: () => {} });

export const useToast = () => useContext(ToastContext);
