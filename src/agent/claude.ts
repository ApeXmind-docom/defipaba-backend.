import Anthropic from "@anthropic-ai/sdk";

import { config } from "../config.js";
import { appendMessage, getHistory } from "../db/store.js";
import type { Lead } from "../lead/types.js";
import { log } from "../util/log.js";
import { buildSystemPrompt } from "./prompts.js";
import { TOOLS, executeTool } from "./tools.js";

const client = new Anthropic({ apiKey: config.anthropic.apiKey });

/** Tope de vueltas de herramientas por turno. Evita bucles caros. */
const MAX_TOOL_ROUNDS = 4;

function textFrom(content: Anthropic.ContentBlock[]): string {
  return content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text.trim())
    .filter(Boolean)
    .join("\n\n");
}

/**
 * Un turno completo de conversacion: historial + mensaje nuevo, con las
 * vueltas de herramientas que hagan falta, y devuelve lo que hay que decir.
 */
export async function runAgent(lead: Lead, incoming: string): Promise<string> {
  appendMessage(lead.jid, "user", incoming);

  const history = getHistory(lead.jid, config.anthropic.maxHistoryMessages);

  const messages: Anthropic.MessageParam[] = history.map((entry) => ({
    role: entry.role,
    content: entry.content,
  }));

  const system = buildSystemPrompt(lead);
  let reply = "";

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    const response = await client.messages.create({
      model: config.anthropic.model,
      max_tokens: config.anthropic.maxTokens,
      system,
      messages,
      tools: TOOLS,
    });

    if (response.stop_reason !== "tool_use") {
      reply = textFrom(response.content);
      break;
    }

    const toolUses = response.content.filter(
      (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
    );

    messages.push({ role: "assistant", content: response.content });

    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const use of toolUses) {
      log.info({ jid: lead.jid, tool: use.name }, "Herramienta invocada");
      const output = await executeTool(lead, use.name, (use.input ?? {}) as Record<string, unknown>);
      results.push({ type: "tool_result", tool_use_id: use.id, content: output });
    }

    messages.push({ role: "user", content: results });

    /* Si se agotan las vueltas sin respuesta final, no dejamos a la persona
     * sin contestacion: se pide un cierre sin herramientas. */
    if (round === MAX_TOOL_ROUNDS) {
      const closing = await client.messages.create({
        model: config.anthropic.model,
        max_tokens: config.anthropic.maxTokens,
        system,
        messages,
      });
      reply = textFrom(closing.content);
    }
  }

  if (!reply) {
    reply = "Perdon, se me cruzo algo aqui. Puedes repetirme lo ultimo?";
  }

  appendMessage(lead.jid, "assistant", reply);
  return reply;
}
