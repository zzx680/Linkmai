import { useEffect, useState } from "react";
import {
    getConfiguredModels,
    NO_DEFAULT_MODELS,
    type ConfiguredModels,
} from "@/app/lib/linkmaiApi";
import type { ConfiguredModelOption } from "@/app/lib/linkmaiApi";
import type { DeploymentModelDefaults } from "@linkmai/contracts";

// Deployment configuration is shared by every picker. Keep one request and
// notify all mounted consumers when it resolves, just like Ollama discovery.
let cache: ConfiguredModels | null = null;
/** When `cache` was filled; a mount older than the freshness window revalidates. */
let loadedAt = 0;
let inflight: Promise<ConfiguredModels> | null = null;
let generation = 0;
/**
 * The provider invalidates the catalog for everything this tab does
 * (sign-in, user change, API-key save). A key saved in ANOTHER tab reaches
 * this one only through this bound: a picker that mounts after it refetches
 * once, and pickers mounting inside it share the loaded catalog, so one page
 * load still costs one request.
 */
export const CONFIGURED_MODELS_MAX_AGE_MS = 60_000;
const listeners = new Set<() => void>();

/** Tolerate a catalog shape from a deployment that predates defaults. */
function normalize(catalog: ConfiguredModels): ConfiguredModels {
    if (!catalog || Array.isArray(catalog)) {
        return { models: [], defaults: NO_DEFAULT_MODELS };
    }
    return {
        models: catalog.models ?? [],
        defaults: catalog.defaults ?? NO_DEFAULT_MODELS,
    };
}

function load(force = false): Promise<ConfiguredModels> {
    if (force) {
        generation += 1;
        cache = null;
        inflight = null;
    }
    if (cache) return Promise.resolve(cache);
    if (!inflight) {
        const requestGeneration = generation;
        const request: Promise<ConfiguredModels> = getConfiguredModels()
            .then((catalog) => {
                const normalized = normalize(catalog);
                if (requestGeneration !== generation) return normalized;
                cache = normalized;
                loadedAt = Date.now();
                listeners.forEach((listener) => listener());
                return normalized;
            })
            .catch(() => {
                if (requestGeneration === generation) {
                    listeners.forEach((listener) => listener());
                }
                return { models: [], defaults: NO_DEFAULT_MODELS };
            })
            .finally(() => {
                if (inflight === request) inflight = null;
            });
        inflight = request;
    }
    return inflight;
}

export function refreshConfiguredModels(): Promise<ConfiguredModels> {
    return load(true);
}

export function clearConfiguredModels(): void {
    generation += 1;
    cache = null;
    inflight = null;
    listeners.forEach((listener) => listener());
}

/**
 * Both the model list and the deployment defaults from one response. Kept as
 * a single catalog so a surface can tell "nothing loaded yet" apart from "the
 * deployment declares no default": the defaults ride on the same request.
 */
export function useConfiguredModelsCatalog(): ConfiguredModels | null {
    const [catalog, setCatalog] = useState<ConfiguredModels | null>(cache);

    useEffect(() => {
        const update = () => setCatalog(cache);
        listeners.add(update);
        // Use the shared catalog while it is fresh. Invalidation is the
        // provider's job: UserProfileProvider clears/refreshes it on every
        // sign-in and user change and after an API-key save, so a mount never
        // sees a stale user's catalog. Forcing a refetch on every mount
        // instead meant every picker that mounted after the provider's
        // request had resolved (the page chunk always mounts later than the
        // shell) sent a second GET /models/configured per page load
        // (MIKE-FRONTEND-C). The age bound covers what the provider cannot
        // see: a key change made in another tab.
        const stale =
            cache !== null && Date.now() - loadedAt > CONFIGURED_MODELS_MAX_AGE_MS;
        void load(stale).then(update);
        return () => {
            listeners.delete(update);
        };
    }, []);

    return catalog;
}

export function useConfiguredModels(): ConfiguredModelOption[] {
    return useConfiguredModelsCatalog()?.models ?? [];
}

/** Null until the catalog loads; otherwise the deployment's checked defaults. */
export function useDeploymentModelDefaults(): DeploymentModelDefaults | null {
    return useConfiguredModelsCatalog()?.defaults ?? null;
}
