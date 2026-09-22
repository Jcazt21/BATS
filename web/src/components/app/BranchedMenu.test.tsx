import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BranchedMenu, type BranchedMenuItem } from "./BranchedMenu";

const ITEMS: BranchedMenuItem[] = [
  { label: "Liga", children: [{ value: "/a", label: "Stats" }, { value: "/b", label: "Batallas" }] },
  { label: "Sistema", children: [{ value: "/c", label: "Ingestas" }] },
];

describe("BranchedMenu", () => {
  it("marca el activo controlado y avisa al seleccionar otro", async () => {
    const onSelect = vi.fn();
    render(<BranchedMenu items={ITEMS} defaultOpen={0} active="/a" onSelect={onSelect} />);

    expect(screen.getByRole("button", { name: "Stats" })).toHaveAttribute("aria-current", "page");
    await userEvent.click(screen.getByRole("button", { name: "Batallas" }));
    expect(onSelect).toHaveBeenCalledWith("/b", ITEMS[0].children![1]);
  });

  it("despliega la sección del activo cuando cambia desde fuera", () => {
    const { rerender } = render(<BranchedMenu items={ITEMS} defaultOpen={0} active="/a" />);
    expect(screen.getByRole("button", { name: "Sistema" })).toHaveAttribute("aria-expanded", "false");

    rerender(<BranchedMenu items={ITEMS} defaultOpen={0} active="/c" />);
    expect(screen.getByRole("button", { name: "Sistema" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: "Ingestas" })).toHaveAttribute("aria-current", "page");
  });

  it("pliega y despliega una sección al pulsar su cabecera", async () => {
    render(<BranchedMenu items={ITEMS} defaultOpen={0} />);
    const head = screen.getByRole("button", { name: "Liga" });

    await userEvent.click(head);
    expect(head).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(head);
    expect(head).toHaveAttribute("aria-expanded", "true");
  });
});
