import { render, screen, fireEvent } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { setUiLocale } from "@linkmai/client";
import { ChatInput } from "../../../word-addin/src/shared/chat/ChatInput";

afterEach(() => setUiLocale("en"));

it.each([{ isComposing: true, keyCode: 13 }, { isComposing: false, keyCode: 229 }])(
    "keeps Chinese IME keys out of Word submission and slash shortcuts (%j)", composition => {
        setUiLocale("zh-CN");
        vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
        const submit = vi.fn();
        const shortcut = vi.fn();
        render(<ChatInput value="请审查这份合同" onValueChange={vi.fn()} onSubmit={submit}
            onKeyDown={shortcut} isLoading={false} onCancel={vi.fn()} />);
        const input = screen.getByRole("textbox");
        fireEvent.keyDown(input, { key: "Enter", ...composition });
        fireEvent.keyDown(input, { key: "ArrowDown", ...composition });
        expect(submit).not.toHaveBeenCalled();
        expect(shortcut).not.toHaveBeenCalled();
        fireEvent.keyDown(input, { key: "Enter", keyCode: 13, isComposing: false });
        expect(submit).toHaveBeenCalledOnce();
    },
);
