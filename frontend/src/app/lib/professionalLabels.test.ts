import { afterEach, expect, it } from "vitest";
import { setUiLocale } from "@linkmai/client";
import { professionalLabel } from "./professionalLabels";

afterEach(() => setUiLocale("en"));

it("labels professional values in Chinese without changing their canonical values", () => {
    setUiLocale("zh-CN");
    expect(professionalLabel("China")).toBe("中国大陆");
    expect(professionalLabel("Hong Kong")).toBe("中国香港");
    expect(professionalLabel("United States")).toBe("美国");
    expect(professionalLabel("General Counsel")).toBe("总法律顾问");
    expect(professionalLabel("Employment")).toBe("劳动人事");
    expect(professionalLabel("自定义业务")).toBe("自定义业务");
    setUiLocale("en");
    expect(professionalLabel("China")).toBe("China");
});
