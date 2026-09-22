import express, { type Request, type Response } from 'express';
import ollama, { type Message } from 'ollama';

import { sendResponse } from '../utils/response-handler.js';
import { tools, toolFunctions } from '../utils/tool.js';
import { requireAuth } from '../middleware/auth.js';
import ChatHistoryModel from '../db/schema/index.js';

const router = express.Router();

router.use(requireAuth);

async function runOllamaTools(messages: Message[]): Promise<unknown> {
  while (true) {
    const response = await ollama.chat({
      model: 'llama3.2:3b',
      messages,
      tools,
    });

    messages.push(response.message);

    const calls = response.message.tool_calls;
    if (!calls || calls.length === 0) break;

    for (const call of calls) {
      const fn = toolFunctions[call.function.name];
      if (!fn) continue;

      const result = await fn(call.function.arguments);

      messages.push({
        role: 'tool',
        tool_name: call.function.name,
        content: JSON.stringify(result),
      });
    }
  }

  return messages[messages.length - 1].content;
}

router.post('/', async (req: Request, res: Response) => {
  try {
    const { message, image_uri } = req.body as { message?: string; image_uri?: string };

    if (!message) {
      return sendResponse(res, 400, 'Message is required');
    }

    const userContent = image_uri ? `${message}\n[Image: ${image_uri}]` : message;

    const messages: Message[] = [
      {
        role: 'system',
        content: 'You are CropAI — Use tools whenever helpful. NEVER guess missing parameters.',
      },
      {
        role: 'user',
        content: userContent,
      },
    ];

    const finalResponse = await runOllamaTools(messages);

    console.log('\n\nFINAL RESPONSE =', finalResponse, '\n\n');

    let parsedResponse: unknown = finalResponse as string;
    if (typeof finalResponse === 'string') {
      try {
        parsedResponse = JSON.parse(finalResponse);
      } catch (e) {
        parsedResponse = finalResponse;
      }
    }

    await ChatHistoryModel.findOneAndUpdate(
      { userId: req.userId },
      {
        $push: {
          chatContent: {
            $each: [
              { role: 'user', message: userContent },
              {
                role: 'bot',
                message:
                  typeof parsedResponse === 'string'
                    ? parsedResponse
                    : JSON.stringify(parsedResponse),
              },
            ],
          },
        },
      },
      { upsert: true, new: true },
    ).catch((err: unknown) =>
      console.error('❌ Failed to persist chat history:', (err as Error).message),
    );

    return sendResponse(res, 200, 'AI assistant response', { finalResponse: parsedResponse });
  } catch (err) {
    console.error('❌ Error in chat:', err);
    return sendResponse(res, 500, 'Internal error', (err as Error).message);
  }
});

export default router;
