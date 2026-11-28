import Image from "next/image";
import Link from "next/link";
import { PRODUCT_SITE_URL } from "@/app/lib/productConfig";

interface SiteLogoProps {
    size?: "sm" | "md" | "lg" | "xl";
    className?: string;
    animate?: boolean;
    asLink?: boolean;
}

const HEIGHT_CLASS = {
    sm: "h-5",
    md: "h-6",
    lg: "h-9",
    xl: "h-14",
} as const;

export function SiteLogo({
    size = "md",
    className = "",
    animate = false,
    asLink = false,
}: SiteLogoProps) {
    const landingHref = PRODUCT_SITE_URL ?? "/";

    const logo = (
        <span
            className={`inline-flex shrink-0 items-center leading-none ${
                animate ? "sidebar-fade-in" : ""
            } ${className}`}
        >
            <Image
                src="/brand/linkmai-logo.png"
                alt="灵迈 LinkMai"
                width={778}
                height={193}
                priority={size === "lg" || size === "xl"}
                className={`${HEIGHT_CLASS[size]} w-auto`}
            />
        </span>
    );

    if (asLink) {
        return (
            <Link
                href={landingHref}
                className="cursor-pointer transition-opacity hover:opacity-80"
            >
                {logo}
            </Link>
        );
    }

    return logo;
}
