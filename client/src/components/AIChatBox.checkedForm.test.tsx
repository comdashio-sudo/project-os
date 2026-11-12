// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { expectEmptySubmitRefused } from "@/test/checkedFormExpect";
import { AIChatBox } from "./AIChatBox";

// D-63: the chat box's form checks itself in the page's language (Arabic here); the send button also stays off while the box is empty
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: true, language: "ar", isRtl: true, setLanguage: vi.fn() }) }));
afterEach(() => cleanup());

describe("AIChatBox message form (D-63)", () => {
  it("an empty message sends nothing and says so in Arabic under the box; a message is sent once", () => {
    const send = vi.fn();
    render(<AIChatBox messages={[]} onSendMessage={send} placeholder="اكتب رسالتك" />);
    const box = expectEmptySubmitRefused(document.querySelector("form")!, "ar", send);
    fireEvent.change(box, { target: { value: "مرحبا" } });
    expect(document.querySelector("[data-checked-error]")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "" }));
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith("مرحبا");
  });
});
