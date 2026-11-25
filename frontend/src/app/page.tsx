import type { Metadata } from "next";
import { MarketingHome } from "./linkmai/marketing-home";

export const metadata: Metadata = {
    title: "灵迈 LinkMai｜真正属于你的法律 AI",
    description:
        "灵迈 LinkMai 是开源法律 AI 工作台，把材料阅读、合同审阅、法律检索与文书起草放进同一份案卷；支持自托管与自选模型。",
};

export default function RootPage() {
    return <MarketingHome />;
}
