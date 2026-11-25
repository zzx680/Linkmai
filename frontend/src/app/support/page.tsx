import Link from "next/link";
import { PRODUCT_NAME, PRODUCT_SUPPORT_EMAIL } from "@/app/lib/productConfig";

export default function SupportPage() {
    return (
        <main className="flex min-h-dvh items-center justify-center bg-app-background px-6 py-10">
            <div className="w-full max-w-md space-y-5">
                <h1 className="font-serif text-2xl text-gray-950">{PRODUCT_NAME} · 使用支持</h1>
                {PRODUCT_SUPPORT_EMAIL ? (
                    <p className="text-sm leading-6 text-gray-600">
                        如需协助，请联系
                        <a className="ml-1 break-all underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-ring" href={`mailto:${PRODUCT_SUPPORT_EMAIL}`}>{PRODUCT_SUPPORT_EMAIL}</a>。
                        反馈时可提供错误编号和发生时间，便于定位问题。
                    </p>
                ) : (
                    <p className="text-sm leading-6 text-gray-600">
                        此部署尚未配置支持邮箱，请联系部署管理员。如遇错误，可记录错误编号和发生时间，供管理员排查。
                    </p>
                )}
                <Link href="/" className="inline-block rounded text-sm underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-ring">返回工作台</Link>
            </div>
        </main>
    );
}
