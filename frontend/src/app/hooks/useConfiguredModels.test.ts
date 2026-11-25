import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getConfiguredModels = vi.hoisted(() => vi.fn());
vi.mock("@/app/lib/linkmaiApi", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/app/lib/linkmaiApi")>()),
    getConfiguredModels,
}));

import {
    clearConfiguredModels,
    useConfiguredModels,
    useDeploymentModelDefaults,
} from "./useConfiguredModels";

const defaults = {
    chat: "ops-chat",
    title: "ops-flash",
    memory: null,
    tabular: null,
    subagent: "ops-chat",
};

beforeEach(() => {
    clearConfiguredModels();
});

afterEach(() => {
    getConfiguredModels.mockReset();
});

describe("useConfiguredModels", () => {
    it("serves the models and the deployment defaults from one response", async () => {
        getConfiguredModels.mockResolvedValue({
            models: [
                {
                    id: "ops-chat",
                    label: "Ops Chat",
                    group: "Configured",
                    location: "cloud",
                    source: "Configured",
                },
            ],
            defaults,
        });

        const models = renderHook(() => useConfiguredModels());
        const deploymentDefaults = renderHook(() =>
            useDeploymentModelDefaults(),
        );

        await waitFor(() => {
            expect(models.result.current.map((model) => model.id)).toEqual([
                "ops-chat",
            ]);
            expect(deploymentDefaults.result.current).toEqual(defaults);
        });
        expect(getConfiguredModels).toHaveBeenCalledTimes(1);
    });

    it("treats a deployment that predates defaults as declaring none", async () => {
        // An older backend answers with the bare array.
        getConfiguredModels.mockResolvedValue([]);

        const { result } = renderHook(() => useDeploymentModelDefaults());

        await waitFor(() => {
            expect(result.current).not.toBeNull();
        });
        expect(result.current).toEqual({
            chat: null,
            title: null,
            memory: null,
            tabular: null,
            subagent: null,
        });
    });
});
