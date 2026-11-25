import { PRODUCT_PRIVACY_URL, PRODUCT_TERMS_URL } from "@/app/lib/productConfig";

/** Never imply acceptance of another product's policies. */
export function PolicyNotice() {
    if (!PRODUCT_TERMS_URL || !PRODUCT_PRIVACY_URL) {
        return <p className="pt-2 text-xs leading-5 text-gray-500">
            本部署的用户协议和隐私政策尚未配置，请联系管理员了解数据使用和存储安排。
        </p>;
    }
    return <p className="pt-2 text-xs leading-5 text-gray-500">
        创建账户即表示你同意
        <a href={PRODUCT_TERMS_URL} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-ring">《用户协议》</a>
        及
        <a href={PRODUCT_PRIVACY_URL} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 focus-visible:outline-ring">《隐私政策》</a>。
    </p>;
}
