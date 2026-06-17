import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { PinoLogger } from 'nestjs-pino';

type LlmProvider = 'openai' | 'anthropic';

const DEFAULT_MODEL: Record<LlmProvider, string> = {
  anthropic: 'claude-haiku-4-5',
  openai: 'gpt-4o-mini',
};

@Injectable()
export class LlmService {
  private readonly provider: LlmProvider | null;
  private readonly openai: OpenAI | null;
  private readonly anthropic: Anthropic | null;
  private readonly model: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(LlmService.name);
    const openaiKey = this.configService.get<string>('OPENAI_API_KEY');
    const anthropicKey = this.configService.get<string>('ANTHROPIC_API_KEY');
    this.openai = openaiKey ? new OpenAI({ apiKey: openaiKey }) : null;
    this.anthropic = anthropicKey ? new Anthropic({ apiKey: anthropicKey }) : null;
    this.provider = this.resolveProvider();
    this.model =
      this.configService.get<string>('LLM_MODEL') ??
      (this.provider ? DEFAULT_MODEL[this.provider] : DEFAULT_MODEL.openai);

    if (this.isAvailable) {
      this.logger.info({ provider: this.provider, model: this.model }, 'Provedor LLM ativo');
    }
  }

  get isAvailable(): boolean {
    return this.provider !== null;
  }

  get activeProvider(): LlmProvider | null {
    return this.provider;
  }

  async complete(systemPrompt: string, userPrompt: string): Promise<string | null> {
    if (!this.provider) return null;

    if (this.provider === 'anthropic') {
      return this.completeWithAnthropic(systemPrompt, userPrompt);
    }

    return this.completeWithOpenAI(systemPrompt, userPrompt);
  }

  private resolveProvider(): LlmProvider | null {
    const configured = this.configService.get<string>('LLM_PROVIDER')?.toLowerCase();
    if (configured === 'anthropic') {
      return this.anthropic ? 'anthropic' : null;
    }
    if (configured === 'openai') {
      return this.openai ? 'openai' : null;
    }
    if (this.anthropic) return 'anthropic';
    if (this.openai) return 'openai';
    return null;
  }

  private async completeWithOpenAI(systemPrompt: string, userPrompt: string): Promise<string | null> {
    if (!this.openai) return null;

    const response = await this.openai.chat.completions.create({
      model: this.model,
      temperature: 0.2,
      max_tokens: 500,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    });

    return response.choices[0]?.message?.content?.trim() ?? null;
  }

  private async completeWithAnthropic(systemPrompt: string, userPrompt: string): Promise<string | null> {
    if (!this.anthropic) return null;

    const response = await this.anthropic.messages.create({
      model: this.model,
      max_tokens: 500,
      temperature: 0.2,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const textBlock = response.content.find((block) => block.type === 'text');
    return textBlock?.type === 'text' ? textBlock.text.trim() : null;
  }
}
