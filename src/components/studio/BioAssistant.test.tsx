import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
vi.mock("@/lib/i18n", () => ({ useI18n: () => ({ locale: "nl" }) }));
import { BioAssistant } from "./BioAssistant";

afterEach(cleanup);
describe("bio draft handoff", () => {
  it("applies a user-composed template only after explicit confirmation", () => {
    const apply = vi.fn();
    render(<TooltipProvider><BioAssistant text="Bestaande bio" maxLength={160} onApply={apply} /></TooltipProvider>);
    fireEvent.click(screen.getByRole("button", { name: "Bio samenstellen" }));
    fireEvent.change(screen.getByLabelText("Rol of beroep"), { target: { value: "Ontwerper" } });
    fireEvent.change(screen.getByLabelText("Locatie"), { target: { value: "Gent" } });
    fireEvent.click(screen.getByRole("button", { name: "Sjabloon invullen" }));
    expect(apply).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Bio toepassen" }));
    expect(apply).toHaveBeenCalledWith("Ontwerper | Gent");
  });
  it("never applies a draft exceeding the existing profile limit", () => {
    const apply = vi.fn();
    render(<TooltipProvider><BioAssistant text="Bestaande bio" maxLength={160} onApply={apply} /></TooltipProvider>);
    fireEvent.click(screen.getByRole("button", { name: "Bio samenstellen" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Voorstel" }), { target: { value: "a".repeat(161) } });
    fireEvent.click(screen.getByRole("button", { name: "Bio toepassen" }));
    expect(apply).not.toHaveBeenCalled();
  });
});