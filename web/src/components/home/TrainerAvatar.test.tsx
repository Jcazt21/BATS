import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { TrainerAvatarPicker } from "./TrainerAvatarPicker";
import { TrainerCard } from "./TrainerCard";

const st = vi.hoisted(() => ({
  me: { data: { avatar: null as string | null } },
  trainers: { isPending: false, isError: false, data: [] as { id: string; label: string; category: string }[] },
  mutate: vi.fn(),
}));

// jsdom no tiene matchMedia: se fuerza la versión ancha (diálogo).
vi.mock("@/hooks/use-media-query", () => ({ useMediaQuery: () => true }));
vi.mock("@/lib/queries", () => ({
  useMe: () => st.me,
  useTrainers: () => st.trainers,
  useUpdateAvatar: () => ({ mutate: st.mutate, isPending: false, isError: false }),
}));

describe("TrainerCard · sprite de entrenador", () => {
  it("sin sprite no pinta imágenes ni avatar en la cabecera", () => {
    const { container } = render(<TrainerCard username="jazar" />);
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).not.toContain("JA");
  });

  it("con sprite pinta solo el sprite grande de fondo (decorativo)", () => {
    const { container } = render(<TrainerCard username="jazar" avatar="lance" />);
    const imgs = container.querySelectorAll("img");
    expect(imgs).toHaveLength(2);
    expect(imgs[0].getAttribute("src")).toBe("/api/trainers/lance");
    expect(container.querySelectorAll('[aria-hidden="true"] img')).toHaveLength(2);
  });

  it("solo es editable si se pasa onEditAvatar", () => {
    const edit = vi.fn();
    const { rerender } = render(<TrainerCard username="jazar" />);
    expect(screen.queryByRole("button", { name: "Cambiar sprite de entrenador" })).toBeNull();
    rerender(<TrainerCard username="jazar" onEditAvatar={edit} />);
    fireEvent.click(screen.getByRole("button", { name: "Cambiar sprite de entrenador" }));
    expect(edit).toHaveBeenCalledOnce();
  });
});

describe("TrainerAvatarPicker", () => {
  beforeEach(() => {
    st.mutate.mockReset();
    st.me.data.avatar = null;
    st.trainers.data = [
      { id: "red", label: "Rojo", category: "Protagonistas" },
      { id: "lance", label: "Lance", category: "Campeones y Alto Mando" },
      { id: "scientist", label: "Científico", category: "Entrenadores" },
    ];
  });

  it("lista los sprites del catálogo agrupados por categoría", () => {
    render(<TrainerAvatarPicker open onOpenChange={() => {}} />);
    expect(screen.getByRole("button", { name: "Rojo" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Entrenadores" })).toBeTruthy();
  });

  it("elegir uno lo guarda", () => {
    render(<TrainerAvatarPicker open onOpenChange={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Lance" }));
    expect(st.mutate.mock.calls[0][0]).toBe("lance");
  });

  it("la búsqueda ignora acentos y mayúsculas", () => {
    render(<TrainerAvatarPicker open onOpenChange={() => {}} />);
    fireEvent.change(screen.getByLabelText("Buscar sprite"), { target: { value: "CIENTIFICO" } });
    expect(screen.getByRole("button", { name: "Científico" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Rojo" })).toBeNull();
  });

  it("“Quitar sprite” solo aparece si ya hay uno y guarda null", () => {
    const { rerender } = render(<TrainerAvatarPicker open onOpenChange={() => {}} />);
    expect(screen.queryByRole("button", { name: "Quitar sprite" })).toBeNull();
    st.me.data.avatar = "red";
    rerender(<TrainerAvatarPicker open onOpenChange={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Quitar sprite" }));
    expect(st.mutate.mock.calls[0][0]).toBeNull();
    expect(screen.getByRole("button", { name: "Rojo" }).getAttribute("aria-pressed")).toBe("true");
  });
});
