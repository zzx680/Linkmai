import { afterEach, describe, expect, it } from "vitest";
import { getUiLocale, setUiLocale, uiDateLocale, uiText } from "./localization";

afterEach(() => setUiLocale("en"));

describe("Chinese interface localization", () => {
    it("translates navigation and authored copy", () => {
        setUiLocale("zh-CN");
        expect(getUiLocale()).toBe("zh-CN");
        expect(uiDateLocale()).toBe("zh-CN");
        expect(uiText("Assistant")).toBe("法律助手");
        expect(uiText("Playbooks")).toBe("审查规则");
        expect(uiText("Send message")).toBe("发送消息");
    });

    it("preserves names, document contents and amounts in interpolations", () => {
        setUiLocale("zh-CN");
        const filename = "Project $50,000 合同.docx";
        expect(uiText`Open ${filename}`).toBe(`打开 ${filename}`);
        expect(uiText(filename)).toBe(filename);
        expect(uiText`Open ${undefined}`).toBe("打开 ");
        expect(uiText`Switched to ${null}`).toBe("已切换至 ");
        expect(uiText`Add ${"an"} ${"DeepSeek"} API key before using this model.`)
            .toBe("使用此模型前，请添加 DeepSeek API 密钥。");
    });

    it("keeps the English interface and punctuation exact", () => {
        setUiLocale("en");
        expect(uiDateLocale()).toBeUndefined();
        expect(uiText("Log in")).toBe("Log in");
        expect(uiText("Sign up")).toBe("Sign up");
        expect(uiText`${"a.pdf"} · ${"Uploading"}`).toBe("a.pdf · Uploading");
        expect(uiText("unlisted copy")).toBe("unlisted copy");
        expect(uiText("&ldquo;Quote&rdquo; &amp; &lsquo;term&rsquo; &lt; &gt; &quot; &apos; &nbsp;"))
            .toBe("“Quote” & ‘term’ < > \" ' \u00a0");
    });
});
