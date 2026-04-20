import { runMempalace } from "./cli.js";
import { renderDoctorReport, runDoctor } from "./doctor.js";
const SETUP_INCOMPLETE_MESSAGE = "Setup incomplete, run the mempalace_doctor tool.";
function textContent(text) {
    return [{ type: "text", text }];
}
function formatResultSummary(result) {
    if (typeof result === "string") {
        return result;
    }
    try {
        return JSON.stringify(result, null, 2);
    }
    catch {
        return String(result);
    }
}
function formatToolOutput(cliResult) {
    if (cliResult.data !== undefined) {
        return formatResultSummary(cliResult.data);
    }
    if (cliResult.stdout) {
        return cliResult.stdout;
    }
    return "Done.";
}
async function runToolCommand(deps, toolName, args, options) {
    const runtime = await deps.runtimePromise;
    if (runtime === null) {
        throw new Error(SETUP_INCOMPLETE_MESSAGE);
    }
    const cliResult = await runMempalace(args, {
        cwd: options.cwd,
        json: options.json,
        logger: deps.logger,
        runtimeConfig: deps.config.runtime,
        runtime,
        signal: options.signal,
    });
    if (!cliResult.ok) {
        deps.logger.warn(`tool:${toolName}`, "tool execution failed", {
            command: cliResult.command,
            stderr: cliResult.stderr ?? null,
            durationMs: cliResult.durationMs,
        });
        throw new Error(cliResult.stderr ?? "MemPalace command failed.");
    }
    deps.logger.info(`tool:${toolName}`, "tool execution succeeded", {
        command: cliResult.command,
        durationMs: cliResult.durationMs,
    });
    return {
        content: textContent([options.successMessage, formatToolOutput(cliResult)].join("\n\n")),
        details: {
            result: cliResult.data,
            stdout: cliResult.stdout ?? null,
            command: cliResult.command,
            durationMs: cliResult.durationMs,
            source: "cli",
        },
    };
}
function getRequiredString(input, key) {
    const value = getOptionalString(input, key);
    if (!value) {
        throw new Error(`Missing required string input: ${key}`);
    }
    return value;
}
function getOptionalString(input, key) {
    const value = input[key];
    return typeof value === "string" && value.trim().length > 0
        ? value.trim()
        : undefined;
}
function getToolSpecs() {
    return [
        {
            name: "mempalace_search",
            label: "MemPalace Search",
            description: "Search the MemPalace knowledge base.",
            parameters: {
                type: "object",
                properties: {
                    query: { type: "string" },
                    cwd: { type: "string" },
                },
                required: ["query"],
                additionalProperties: false,
            },
            execute: async (deps, input, signal) => {
                const query = getRequiredString(input, "query");
                const cwd = getOptionalString(input, "cwd");
                return runToolCommand(deps, "mempalace_search", ["search", query], {
                    cwd,
                    json: false,
                    signal,
                    successMessage: `MemPalace search completed for "${query}".`,
                });
            },
        },
        {
            name: "mempalace_mine",
            label: "MemPalace Mine",
            description: "Mine files or directories into MemPalace. If neither path nor cwd is provided, the extension process working directory is used.",
            parameters: {
                type: "object",
                properties: {
                    path: { type: "string" },
                    cwd: { type: "string" },
                },
                additionalProperties: false,
            },
            execute: async (deps, input, signal) => {
                const toolPath = getOptionalString(input, "path");
                const cwd = getOptionalString(input, "cwd");
                const targetPath = toolPath ?? cwd ?? process.cwd();
                return runToolCommand(deps, "mempalace_mine", ["mine", targetPath], {
                    cwd,
                    json: false,
                    signal,
                    successMessage: `MemPalace mine completed for "${targetPath}".`,
                });
            },
        },
        {
            name: "mempalace_status",
            label: "MemPalace Status",
            description: "Show MemPalace status information.",
            parameters: {
                type: "object",
                properties: {
                    cwd: { type: "string" },
                },
                additionalProperties: false,
            },
            execute: async (deps, input, signal) => {
                const cwd = getOptionalString(input, "cwd");
                return runToolCommand(deps, "mempalace_status", ["status"], {
                    cwd,
                    json: false,
                    signal,
                    successMessage: "MemPalace status loaded.",
                });
            },
        },
        {
            name: "mempalace_init",
            label: "MemPalace Init",
            description: "Initialize a new MemPalace directory in non-interactive mode. If neither path nor cwd is provided, the extension process working directory is used.",
            parameters: {
                type: "object",
                properties: {
                    path: { type: "string" },
                    cwd: { type: "string" },
                },
                additionalProperties: false,
            },
            execute: async (deps, input, signal) => {
                const toolPath = getOptionalString(input, "path");
                const cwd = getOptionalString(input, "cwd");
                const targetPath = toolPath ?? cwd ?? process.cwd();
                return runToolCommand(deps, "mempalace_init", ["init", targetPath, "--yes"], {
                    cwd,
                    json: false,
                    signal,
                    successMessage: `MemPalace initialized at "${targetPath}".`,
                });
            },
        },
        {
            name: "mempalace_wake_up",
            label: "MemPalace Wake Up",
            description: "Load MemPalace context for a new session.",
            parameters: {
                type: "object",
                properties: {
                    cwd: { type: "string" },
                },
                additionalProperties: false,
            },
            execute: async (deps, input, signal) => {
                const cwd = getOptionalString(input, "cwd");
                return runToolCommand(deps, "mempalace_wake_up", ["wake-up"], {
                    cwd,
                    json: false,
                    signal,
                    successMessage: "MemPalace wake-up completed.",
                });
            },
        },
        {
            name: "mempalace_doctor",
            label: "MemPalace Doctor",
            description: "Run setup diagnostics for the MemPalace extension.",
            parameters: {
                type: "object",
                properties: {},
                additionalProperties: false,
            },
            execute: async (deps) => {
                const report = await runDoctor({
                    config: deps.config,
                    logger: deps.logger,
                });
                return {
                    content: textContent(renderDoctorReport(report)),
                    details: report,
                };
            },
        },
    ];
}
export function createPiToolDefinitions(bootstrap) {
    return getToolSpecs().map((tool) => ({
        name: tool.name,
        label: tool.label,
        description: tool.description,
        parameters: tool.parameters,
        async execute(_toolCallId, params, signal) {
            const deps = await bootstrap;
            try {
                return await tool.execute(deps, (params ?? {}), signal);
            }
            catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                deps.logger.warn(`tool:${tool.name}`, "tool input or execution error", {
                    error: message,
                });
                throw error;
            }
        },
    }));
}
