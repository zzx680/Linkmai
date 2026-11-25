import { uiText } from "@mike/client";
/**
 * Simplified Chinese copy for the mainland China web experience.
 * Keep display text separate from API values, persisted names and permissions.
 * Pages migrate here incrementally; this does not translate user documents.
 */
export const UI_LOCALE = "zh-CN";

export const zhCN = {
    navigation: {
        assistant: uiText("Assistant"),
        ide: uiText("IDE"),
        projects: uiText("Projects"),
        library: uiText("Library"),
        tabularReview: uiText("Tabular Review"),
        workflows: uiText("Workflows"),
        playbooks: uiText("Playbooks"),
        recentProjects: uiText("Recent Projects"),
        history: uiText("History"),
        noProjects: uiText("No projects yet"),
        noHistory: uiText("No history yet"),
        historyLoadFailed: uiText("Some history could not be loaded. Try again"),
        loadingWorkspace: uiText("Loading workspace"),
        openSidebar: uiText("Open sidebar"),
        closeSidebar: uiText("Close sidebar"),
        accountMenu: uiText("Account menu"),
        workspace: uiText("Workspace"),
        personalWorkspace: uiText("Personal"),
        switchedWorkspace: uiText("已切换至"),
        itemWorkspace: uiText("What you opened belongs to this workspace."),
        settings: uiText("Settings"),
        organization: uiText("Organization"),
        signOut: uiText("Sign out"),
    },
    assistant: {
        greeting: uiText("Hi"),
        legalNotice: uiText("AI can make mistakes. Answers are not legal advice."),
        quickActions: uiText("Quick actions"),
        configureQuickActions: uiText("Configure quick actions"),
        placeholder: uiText("How can I help?"),
        loading: uiText("Loading…"),
        readOnly: uiText("Viewing only — sending needs edit access"),
        receiving: uiText("A response is still arriving…"),
        loadingChat: uiText("Loading this chat…"),
        send: uiText("Send message"),
        stop: uiText("Stop response"),
        addToMessage: uiText("Add to message"),
        uploadDocuments: uiText("Upload Documents"),
        savedDocuments: uiText("Saved Documents"),
        addDocuments: uiText("Add document"),
        addPlaybook: uiText("Add playbook"),
        uploading: uiText("Uploading"),
        dropFiles: uiText("Drop files here to add to chat"),
        workflowCommands: uiText("Workflow commands"),
        openWorkflow: uiText("打开工作流"),
        removeWorkflow: uiText("Remove workflow"),
        selectModel: uiText("Select a model"),
        selectModelHint: uiText("Choose a model before sending your message."),
        uploadPermission: uiText("Only someone with edit access can add documents."),
        uploadFailed: uiText("Documents could not be uploaded. Try again."),
        untitledPlaybook: uiText("Untitled playbook"),
    },
} as const;
