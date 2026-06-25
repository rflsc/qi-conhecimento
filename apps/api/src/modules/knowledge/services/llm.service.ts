import { Injectable } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { PinoLogger } from 'nestjs-pino';
import { LlmConfigService } from '@modules/llm-config/services/llm-config.service';

type LlmProvider = 'openai' | 'anthropic';

@Injectable()
export class LlmService {
  constructor(
    private readonly llmConfigService: LlmConfigService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(LlmService.name);
  }

  async isAvailable(): Promise<boolean> {
    const runtime = await this.llmConfigService.resolveLlmRuntime();
    return Boolean(runtime.provider && runtime.apiKey);
  }

  async activeProvider(): Promise<LlmProvider | null> {
    const runtime = await this.llmConfigService.resolveLlmRuntime();
    return runtime.provider;
  }

  async complete(systemPrompt: string, userPrompt: string): Promise<string | null> {
    const runtime = await this.llmConfigService.resolveLlmRuntime();
    if (!runtime.provider || !runtime.apiKey) return null;

    if (runtime.provider === 'anthropic') {
      return this.completeWithAnthropic(runtime.apiKey, runtime.model, systemPrompt, userPrompt);
    }

    return this.completeWithOpenAI(runtime.apiKey, runtime.model, systemPrompt, userPrompt);
  }

  private async completeWithOpenAI(
    apiKey: string,
    model: string,
    systemPrompt: string,
    userPrompt: string,
  ): Promise<string | null> {
    try {
      const openai = new OpenAI({ apiKey });
      const response = await openai.chat.completions.create({
        model,
        temperature: 0.2,
        max_tokens: 500,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      });

      return response.choices[0]?.message?.content?.trim() ?? null;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'erro desconhecido';
      this.logger.warn({ error: message, model }, 'OpenAI completion falhou');
      return null;
    }
  }

  private async completeWithAnthropic(
    apiKey: string,
    model: string,
    systemPrompt: string,
    userPrompt: string,
  ): Promise<string | null> {
    try {
      const anthropic = new Anthropic({ apiKey });
      const response = await anthropic.messages.create({
        model,
        max_tokens: 500,
        temperature: 0.2,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      });

      const textBlock = response.content.find((block) => block.type === 'text');
      return textBlock?.type === 'text' ? textBlock.text.trim() : null;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'erro desconhecido';
      this.logger.warn({ error: message, model }, 'Anthropic completion falhou');
      return null;
    }
  }
}
