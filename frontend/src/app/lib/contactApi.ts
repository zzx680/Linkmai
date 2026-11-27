export interface ContactMessageInput {
    name: string;
    email: string;
    subject?: string;
    message: string;
}

/** Public landing-page contact form; no session is required. */
export async function submitContactMessage(input: ContactMessageInput): Promise<void> {
    const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
    });
    if (!response.ok) {
        throw new Error("Contact message could not be sent");
    }
}
