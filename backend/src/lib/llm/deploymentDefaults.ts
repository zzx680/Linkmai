// Deployment-declared default models. An operator names, in the environment,
// which model a surface starts on when the user has not chosen one. These are
// only defaults: a saved chat, profile preference or explicit request always
// wins, and every value is re-validated for the requesting user before it is
// used, so a model that is unconfigured or unkeyed for that user is skipped
// rather than persisted or sent upstream.
//
// Reading the environment is deliberately not cached the way the model
// registry is: this is a handful of cheap reads, and a test or a rebuilt
// container should see the current value.

export type DeploymentModelKind =
    | "chat"
    | "title"
    | "memory"
    | "tabular"
    | "subagent";

const ENV_NAMES: Record<DeploymentModelKind, string> = {
    chat: "LINKMAI_DEFAULT_CHAT_MODEL",
    title: "LINKMAI_DEFAULT_TITLE_MODEL",
    memory: "LINKMAI_DEFAULT_MEMORY_MODEL",
    tabular: "LINKMAI_DEFAULT_TABULAR_MODEL",
    subagent: "LINKMAI_DEFAULT_SUBAGENT_MODEL",
};

/** The raw configured id for one surface, without validation. */
export function deploymentDefaultModelId(
    kind: DeploymentModelKind,
): string | null {
    const value = process.env[ENV_NAMES[kind]]?.trim();
    return value ? value : null;
}

/** Every surface's raw configured id, for the settings UI and diagnostics. */
export function deploymentDefaultModelIds(): Record<
    DeploymentModelKind,
    string | null
> {
    return {
        chat: deploymentDefaultModelId("chat"),
        title: deploymentDefaultModelId("title"),
        memory: deploymentDefaultModelId("memory"),
        tabular: deploymentDefaultModelId("tabular"),
        subagent: deploymentDefaultModelId("subagent"),
    };
}
