import { getUiLocale, uiText } from "@linkmai/client";

const countryNames = new Intl.DisplayNames(["zh-CN"], { type: "region" });
const englishCountries = new Intl.DisplayNames(["en"], { type: "region" });
const countryLabels = new Map<string, string>();
for (let first = 65; first <= 90; first++) {
    for (let second = 65; second <= 90; second++) {
        const code = String.fromCharCode(first, second);
        const english = englishCountries.of(code);
        if (english && english !== code) countryLabels.set(english, countryNames.of(code) ?? english);
    }
}

/** Labels only: form submissions retain their existing canonical values. */
export function professionalLabel(value: string): string {
    if (getUiLocale() === "en") return value;
    const labels: Record<string, string> = {
        China: "中国大陆", "Hong Kong": "中国香港", Macao: "中国澳门", Taiwan: "中国台湾",
        Partner: "合伙人", "Senior Associate": "资深律师", Associate: "律师",
        "Law Clerk": "律师助理", Counsel: "顾问律师", "General Counsel": "总法律顾问", "Legal Counsel": "法律顾问",
        Arbitration: "仲裁", "Banking and Finance": "银行与金融", "Capital Markets": "资本市场",
        "Competition and Antitrust": "竞争与反垄断", "Corporate and M&A": "公司与并购",
        "Data Protection and Privacy": "数据保护与隐私", "Dispute Resolution": "争议解决",
        Employment: "劳动人事", "Energy and Natural Resources": "能源与自然资源", "Family Law": "婚姻家事",
        "Financial Regulation": "金融监管", "Funds and Asset Management": "基金与资产管理",
        Immigration: "移民", "Insolvency and Restructuring": "破产与重组", Insurance: "保险",
        "Intellectual Property": "知识产权", "International Trade": "国际贸易", Litigation: "诉讼",
        "Private Client": "私人客户业务", "Private Equity and Venture Capital": "私募股权与创业投资",
        "Projects and Infrastructure": "项目与基础设施", "Public Law and Regulatory": "行政与监管",
        "Real Estate": "房地产", Tax: "税务", "Technology and Telecommunications": "科技与电信", Other: "其他",
    };
    return uiText(value) !== value ? uiText(value) : labels[value] ?? countryLabels.get(value) ?? value;
}
