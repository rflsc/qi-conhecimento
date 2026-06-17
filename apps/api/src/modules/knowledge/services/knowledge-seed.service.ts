import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';
import { EngineeringSpecialty } from '@qi-conhecimento/shared-types';
import { KnowledgeRepository } from '../repositories/knowledge.repository';
import { KnowledgeService } from '../services/knowledge.service';

const PILOT_ENTRIES = [
  {
    title: 'Recuo mínimo de tubos de esgoto',
    specialty: EngineeringSpecialty.HYDRAULIC,
    normReference: 'NBR 8160',
    tags: ['esgoto', 'recuo', 'instalação'],
    markdownContent: `# Recuo mínimo de tubos de esgoto

Conforme **NBR 8160**, os tubos de esgoto devem respeitar recuos mínimos em relação a outras instalações e elementos construtivos.

## Recuo de tubulação de esgoto

- Tubos de esgoto devem manter **recuo mínimo de 0,15 m (15 cm)** de paredes e pilares quando não houver revestimento protetor.
- Quando atravessar vigas ou lajes, utilizar tubos de proteção e manter diâmetro nominal conforme projeto.
- Evitar sifões invertidos e garantir declividade mínima de **1%** para diâmetros até 100 mm.

## Boas práticas de campo

1. Verificar cotas no projeto hidráulico antes da fixação.
2. Registrar desvios em nota de campo e comunicar ao projetista.
3. Utilizar tubos e conexões com selo de conformidade ABNT.`,
  },
  {
    title: 'Ventilação de colunas de esgoto',
    specialty: EngineeringSpecialty.HYDRAULIC,
    normReference: 'NBR 8160',
    tags: ['ventilação', 'coluna', 'esgoto'],
    markdownContent: `# Ventilação de colunas de esgoto

A ventilação adequada evita pressões negativas e desarme de fechos hídricos.

## Requisitos principais

- Toda coluna de esgoto deve ser **ventilada** até a cobertura ou via circuito de ventilação.
- O tubo de ventilação primária deve ser contínuo da base da coluna até **no mínimo 40 cm acima da cobertura**.
- O diâmetro do tubo de ventilação não deve ser inferior ao da coluna que ventila.

## Item de referência

Item relacionado: **NBR 8160 — sistema de ventilação de colunas de descarga**.`,
  },
  {
    title: 'Proteção contra choques elétricos em áreas molhadas',
    specialty: EngineeringSpecialty.ELECTRICAL,
    normReference: 'NBR 5410',
    tags: ['eletrica', 'banheiro', 'segurança'],
    markdownContent: `# Proteção contra choques em áreas molhadas

Instalações elétricas em banheiros, cozinhas e áreas de serviço exigem medidas reforçadas.

## Zonas de segurança (NBR 5410)

- **Zona 0:** interior da banheira — somente SELV 12 V.
- **Zona 1:** acima da banheira até 2,25 m — IPX4, circuitos com DR 30 mA.
- **Zona 2:** 60 cm além da zona 1 — proteção DR obrigatória.

## Procedimento interno AltoQi

- Nunca instalar tomadas dentro da zona 1 sem projeto específico.
- Utilizar condutores com isolamento adequado à umidade.
- Testar continuidade de aterramento antes da energização.`,
  },
] as const;

@Injectable()
export class KnowledgeSeedService implements OnModuleInit {
  constructor(
    private readonly knowledgeService: KnowledgeService,
    private readonly knowledgeRepository: KnowledgeRepository,
    private readonly configService: ConfigService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(KnowledgeSeedService.name);
  }

  async onModuleInit(): Promise<void> {
    const enabled = this.configService.get<string>('SEED_KNOWLEDGE_ENABLED') === 'true';
    if (!enabled) return;

    const existing = await this.knowledgeRepository.countChunks();
    if (existing > 0) {
      this.logger.info('Knowledge seed skipped — chunks already exist');
      return;
    }

    for (const entry of PILOT_ENTRIES) {
      await this.knowledgeService.createCmsEntry({
        title: entry.title,
        specialty: entry.specialty,
        normReference: entry.normReference,
        tags: [...entry.tags],
        markdownContent: entry.markdownContent,
      });
    }

    this.logger.info({ count: PILOT_ENTRIES.length }, 'Pilot knowledge entries seeded');
  }
}
