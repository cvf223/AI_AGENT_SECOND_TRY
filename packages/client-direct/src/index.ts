import {
    AgentRuntime,
    composeContext,
    generateObject,
    generateImage,
    elizaLogger,
    generateCaption,
    generateMessageResponse,
    getEmbeddingZeroVector,
    messageCompletionFooter,
    ModelClass,
    settings,
    stringToUuid,
} from "@elizaos/core";
import type {
    State,
    Content,
    Media,
    Memory,
    Plugin,
    ClientInstance,
    IAgentRuntime,
    HandlerCallback,
    Client,
    Action,
} from "@elizaos/core/types";
import bodyParser from "body-parser";
import cors from "cors";
import express, { type Request as ExpressRequest, Express, Response } from "express";
import * as fs from "fs";
import multer from "multer";
import OpenAI from "openai";
import * as path from "path";
import { z } from "zod";
import { createApiRouter } from "./api.ts";
import { createVerifiableLogApiRouter } from "./verifiable-log-api.ts";
import { Server } from 'http';

type UUID = `${string}-${string}-${string}-${string}-${string}`;

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(process.cwd(), "data", "uploads");
        // Create the directory if it doesn't exist
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
        cb(null, `${uniqueSuffix}-${file.originalname}`);
    },
});

// some people have more memory than disk.io
const upload = multer({ storage /*: multer.memoryStorage() */ });

export const messageHandlerTemplate =
    // {{goals}}
    // "# Action Examples" is already included
    `{{actionExamples}}
(Action examples are for reference only. Do not use the information from them in your response.)

# Knowledge
{{knowledge}}

# Task: Generate dialog and actions for the character {{agentName}}.
About {{agentName}}:
{{bio}}
{{lore}}

{{providers}}

{{attachments}}

# Capabilities
Note that {{agentName}} is capable of reading/seeing/hearing various forms of media, including images, videos, audio, plaintext and PDFs. Recent attachments have been included above under the "Attachments" section.

{{messageDirections}}

{{recentMessages}}

{{actions}}

# Instructions: Write the next message for {{agentName}}.
` + messageCompletionFooter;

export const hyperfiHandlerTemplate = `{{actionExamples}}
(Action examples are for reference only. Do not use the information from them in your response.)

# Knowledge
{{knowledge}}

# Task: Generate dialog and actions for the character {{agentName}}.
About {{agentName}}:
{{bio}}
{{lore}}

{{providers}}

{{attachments}}

# Capabilities
Note that {{agentName}} is capable of reading/seeing/hearing various forms of media, including images, videos, audio, plaintext and PDFs. Recent attachments have been included above under the "Attachments" section.

{{messageDirections}}

{{recentMessages}}

{{actions}}

# Instructions: Write the next message for {{agentName}}.

Response format should be formatted in a JSON block like this:
\`\`\`json
{ "lookAt": "{{nearby}}" or null, "emote": "{{emotes}}" or null, "say": "string" or null, "actions": (array of strings) or null }
\`\`\`
`;

export interface DirectClientInterface extends Client {
    name: string;
    app: Express;
    agents: Map<string, IAgentRuntime>;
    server: Server;
    startAgent: Function;
    loadCharacterTryPath: Function;
    jsonToCharacter: Function;
    actions: Action[];
    registerAgent(runtime: IAgentRuntime): void;
    unregisterAgent(runtime: IAgentRuntime): void;
}

export class DirectClient implements DirectClientInterface {
    public name: string;
    public app: Express;
    public agents: Map<string, IAgentRuntime>;
    public server: Server;
    public startAgent: Function;
    public loadCharacterTryPath: Function;
    public jsonToCharacter: Function;
    public actions: Action[] = [];

    constructor(
        name: string,
        startAgent: Function,
        loadCharacterTryPath: Function,
        jsonToCharacter: Function
    ) {
        this.name = name;
        this.app = express();
        this.agents = new Map();
        this.startAgent = startAgent;
        this.loadCharacterTryPath = loadCharacterTryPath;
        this.jsonToCharacter = jsonToCharacter;
    }

    private async startServer(): Promise<Server> {
        const port = process.env.PORT ? parseInt(process.env.PORT) : 3000;
        return new Promise((resolve) => {
            const server = this.app.listen(port, () => {
                console.log(`Server is running on port ${port}`);
                resolve(server);
            });
        });
    }

    public async start(runtime: IAgentRuntime): Promise<ClientInstance> {
        this.server = await this.startServer();
        return {
            name: this.name,
            stop: () => this.stop(),
        };
    }

    public async stop(): Promise<void> {
        if (this.server) {
            await new Promise<void>((resolve) => {
                this.server.close(() => resolve());
            });
        }
    }

    private createContentFromText(text: string): Content {
        return {
            text,
            attachments: [],
        };
    }

    private createMemoryFromText(
        text: string,
        userId: UUID,
        agentId: UUID,
        roomId: UUID
    ): Memory {
        return {
            id: stringToUuid(Date.now().toString()),
            userId,
            agentId,
            roomId,
            content: this.createContentFromText(text),
            embedding: getEmbeddingZeroVector(),
            createdAt: Date.now(),
        };
    }

    private handleResponse(response: Content | null, message: Content | null, res: Response): void {
        if (!response) {
            res.status(500).send("No response generated");
            return;
        }

        if (message) {
            res.json(message);
        } else {
            res.json(response);
        }
    }

    public registerAgent(runtime: IAgentRuntime): void {
        this.agents.set(runtime.agentId, runtime);
    }

    public unregisterAgent(runtime: IAgentRuntime): void {
        this.agents.delete(runtime.agentId);
    }

    private async handleMessage(runtime: IAgentRuntime, userId: string, agentId: string, roomId: string, text: string, state: State) {
        const memory = this.createMemoryFromText(
            text,
            stringToUuid(userId),
            stringToUuid(agentId),
            stringToUuid(roomId)
        );

        const response = await generateMessageResponse({
            runtime,
            context: text,
            modelClass: ModelClass.LARGE,
        });

        if (!response) {
            return null;
        }

        const responseMessage = {
            ...memory,
            userId: runtime.agentId,
            content: response,
        };

        await runtime.messageManager.createMemory(responseMessage);
        return response;
    }
}

export const DirectClientInterface: Client = {
    name: 'direct',
    start: async (runtime: IAgentRuntime) => {
        elizaLogger.log("DirectClientInterface start");
        const client = new DirectClient('direct', () => {}, () => {}, () => {});
        return client.start(runtime);
    }
};

const directPlugin: Plugin = {
    name: "direct",
    description: "Direct client",
    clients: [DirectClientInterface],
    initialize: async (runtime: IAgentRuntime) => {
        elizaLogger.log("Direct plugin initialized");
    }
};

export default directPlugin;
