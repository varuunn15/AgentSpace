import { Router } from "express";
import agent from "../agents/code.agent.js";

const agentRouter = Router();

agentRouter.post("/invoke", async (req, res) => {
    const { message, projectId } = req.body;

    if (typeof message !== 'string' || !message.trim() || typeof projectId !== 'string' || !projectId.trim()) {
        return res.status(400).json({ error: 'A message and sandbox project ID are required.' });
    }

    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
    });

    const writer = (text) => res.write(text);

    try {
        const stream = await agent.stream(
            { messages: [ { role: "user", content: message } ] },
            { context: { projectId, writer }, streamMode: "values" }
        );

        let lastState = null;
        for await (const state of stream) {
            lastState = state;
        }

        if (lastState?.messages?.length) {
            const msgs = lastState.messages;
            for (let i = msgs.length - 1; i >= 0; i--) {
                const m = msgs[i];
                const role = m.role ?? m._getType?.();
                if ((role === 'ai' || role === 'assistant') && !m.tool_calls?.length) {
                    const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
                    res.write(content + '\n');
                    break;
                }
            }
        }

        res.end();
    } catch (error) {
        console.error("Error invoking agent:", error);
        const status = error?.status ?? error?.statusCode ?? error?.response?.status;
        const isRateLimited = status === 429 || /\b429\b|rate.?limit|quota/i.test(error?.message || '');
        const message = isRateLimited
            ? 'The AI provider is rate-limiting requests (HTTP 429). The sandbox is running, but the AI could not make changes. Check the Mistral API quota and try again.'
            : 'The AI request failed. Please try again.';

        if (res.headersSent) {
            res.write(`ERROR: ${message}\n`);
            res.end();
        } else {
            res.status(isRateLimited ? 429 : 500).json({ error: message });
        }
    }
});

export default agentRouter;
