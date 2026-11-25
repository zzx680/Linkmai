import { InteriorPage } from "../site-pages";

export default async function LinkMaiInteriorPage({
    params,
}: {
    params: Promise<{ slug: string[] }>;
}) {
    const { slug } = await params;
    return <InteriorPage slug={slug} />;
}
