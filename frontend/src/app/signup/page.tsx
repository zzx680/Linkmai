import { redirect } from "next/navigation";

/**
 * Registration is the same invite-code flow as sign-in: the first use of a
 * code creates its workspace. Keep the old URL working for inbound links.
 */
export default function SignupPage() {
    redirect("/login");
}
