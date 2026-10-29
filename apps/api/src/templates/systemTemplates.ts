export type TemplateFieldType = 'text' | 'list' | 'table';

export interface TemplateColumn {
  key: string;
  label: string;
}

export interface TemplateField {
  key: string;
  label: string;
  type: TemplateFieldType;
  /** Instruction handed to the model for this field. */
  guidance: string;
  columns?: TemplateColumn[];
}

export interface SummaryTemplate {
  id: string;
  name: string;
  description: string;
  persona: string;
  fields: TemplateField[];
}

export const SYSTEM_TEMPLATES: SummaryTemplate[] = [
  {
    id: 'meeting-minutes',
    name: '회의록',
    description: '안건, 논의 내용, 결정 사항, 액션 아이템을 표준 회의록 형식으로 정리한다.',
    persona: '숙련된 회의 서기',
    fields: [
      { key: 'title', label: '회의명', type: 'text', guidance: '회의 주제를 한 줄로 요약한다.' },
      {
        key: 'summary',
        label: '한 줄 요약',
        type: 'text',
        guidance: '회의 전체를 2~3문장으로 요약한다.',
      },
      {
        key: 'participants',
        label: '참석자',
        type: 'list',
        guidance:
          '대화에서 식별되는 참석자를 나열한다. 이름이 언급되지 않으면 "화자 1"처럼 표기한다.',
      },
      { key: 'agenda', label: '안건', type: 'list', guidance: '다룬 안건을 순서대로 나열한다.' },
      {
        key: 'discussion',
        label: '논의 내용',
        type: 'table',
        guidance: '안건별 핵심 논의 내용과 주요 쟁점을 정리한다.',
        columns: [
          { key: 'topic', label: '주제' },
          { key: 'detail', label: '논의 내용' },
        ],
      },
      {
        key: 'decisions',
        label: '결정 사항',
        type: 'list',
        guidance: '확정된 결정만 적는다. 논의 중인 사항은 제외한다.',
      },
      {
        key: 'actionItems',
        label: '액션 아이템',
        type: 'table',
        guidance: '담당자와 기한이 언급되지 않았으면 "미정"으로 적는다.',
        columns: [
          { key: 'task', label: '할 일' },
          { key: 'owner', label: '담당' },
          { key: 'due', label: '기한' },
        ],
      },
      {
        key: 'followUps',
        label: '후속 논의 필요',
        type: 'list',
        guidance: '결론이 나지 않아 다음에 다시 다뤄야 하는 항목을 적는다.',
      },
    ],
  },
  {
    id: 'work-report',
    name: '업무 보고서',
    description: '진행 현황, 이슈, 다음 계획을 보고용 형식으로 정리한다.',
    persona: '보고서를 쓰는 실무 책임자',
    fields: [
      { key: 'title', label: '보고 제목', type: 'text', guidance: '보고 주제를 한 줄로 적는다.' },
      {
        key: 'summary',
        label: '핵심 요약',
        type: 'text',
        guidance: '경영진이 30초 안에 읽을 수 있도록 3문장 이내로 요약한다.',
      },
      {
        key: 'progress',
        label: '진행 현황',
        type: 'table',
        guidance: '항목별 진행 상태를 정리한다. 상태는 완료/진행중/지연/보류 중 하나로 적는다.',
        columns: [
          { key: 'item', label: '항목' },
          { key: 'status', label: '상태' },
          { key: 'detail', label: '내용' },
        ],
      },
      {
        key: 'achievements',
        label: '주요 성과',
        type: 'list',
        guidance: '수치나 결과가 언급되면 함께 적는다.',
      },
      {
        key: 'issues',
        label: '이슈 및 리스크',
        type: 'table',
        guidance: '이슈와 대응 방안을 함께 정리한다.',
        columns: [
          { key: 'issue', label: '이슈' },
          { key: 'impact', label: '영향' },
          { key: 'plan', label: '대응 방안' },
        ],
      },
      {
        key: 'nextSteps',
        label: '다음 계획',
        type: 'list',
        guidance: '다음 기간에 수행할 일을 우선순위 순으로 적는다.',
      },
      {
        key: 'requests',
        label: '요청 및 지원 사항',
        type: 'list',
        guidance: '의사결정이나 자원 지원이 필요한 항목만 적는다.',
      },
    ],
  },
  {
    id: 'one-on-one',
    name: '1:1 면담',
    description: '성과, 피드백, 성장 논의, 합의 사항을 면담 기록 형식으로 정리한다.',
    persona: '구성원의 성장을 돕는 매니저',
    fields: [
      {
        key: 'summary',
        label: '면담 요약',
        type: 'text',
        guidance: '면담의 전반적인 분위기와 핵심 주제를 3문장 이내로 적는다.',
      },
      { key: 'topics', label: '주요 논의 주제', type: 'list', guidance: '다룬 주제를 나열한다.' },
      {
        key: 'strengths',
        label: '잘하고 있는 점',
        type: 'list',
        guidance: '구체적인 사례와 함께 적는다.',
      },
      {
        key: 'improvements',
        label: '개선이 필요한 점',
        type: 'list',
        guidance: '비난이 아닌 행동 중심의 표현으로 적는다.',
      },
      {
        key: 'growth',
        label: '성장 및 커리어 논의',
        type: 'list',
        guidance: '커리어 목표, 학습 의지, 역할 변화 희망 등을 적는다.',
      },
      {
        key: 'concerns',
        label: '우려 사항',
        type: 'list',
        guidance: '번아웃, 조직 이슈, 불만 등 관리가 필요한 신호를 적는다. 없으면 빈 목록.',
      },
      {
        key: 'agreements',
        label: '합의한 액션',
        type: 'table',
        guidance: '매니저와 구성원 각각의 실행 항목을 구분해 적는다.',
        columns: [
          { key: 'action', label: '액션' },
          { key: 'owner', label: '담당' },
          { key: 'due', label: '기한' },
        ],
      },
    ],
  },
  {
    id: 'interview',
    name: '인터뷰 / 고객 미팅',
    description: '질의응답, 인사이트, 니즈를 인터뷰 기록 형식으로 정리한다.',
    persona: '고객 인사이트를 뽑아내는 리서처',
    fields: [
      {
        key: 'summary',
        label: '핵심 요약',
        type: 'text',
        guidance: '가장 중요한 발견을 3문장 이내로 적는다.',
      },
      {
        key: 'background',
        label: '상대방 배경',
        type: 'list',
        guidance: '소속, 역할, 업무 맥락 등 언급된 정보를 적는다.',
      },
      {
        key: 'questions',
        label: '주요 질의응답',
        type: 'table',
        guidance: '질문과 답변의 요지를 정리한다.',
        columns: [
          { key: 'question', label: '질문' },
          { key: 'answer', label: '답변 요지' },
        ],
      },
      {
        key: 'painPoints',
        label: '니즈 및 페인포인트',
        type: 'list',
        guidance: '불편, 요구, 기대를 상대방의 표현에 가깝게 적는다.',
      },
      {
        key: 'insights',
        label: '핵심 인사이트',
        type: 'list',
        guidance: '단순 요약이 아니라 해석과 시사점을 적는다.',
      },
      {
        key: 'quotes',
        label: '인상적인 발언',
        type: 'list',
        guidance: '그대로 인용할 만한 문장을 적는다. 없으면 빈 목록.',
      },
      {
        key: 'nextSteps',
        label: '후속 조치',
        type: 'list',
        guidance: '제안, 검증할 가설, 다음 약속 등을 적는다.',
      },
    ],
  },
  {
    id: 'lecture-notes',
    name: '강의 노트',
    description: '핵심 개념, 상세 설명, 용어, 복습 포인트를 학습 노트 형식으로 정리한다.',
    persona: '잘 정리된 학습 노트를 만드는 조교',
    fields: [
      { key: 'title', label: '강의 주제', type: 'text', guidance: '강의 주제를 한 줄로 적는다.' },
      {
        key: 'summary',
        label: '한눈에 보기',
        type: 'text',
        guidance: '강의 전체 흐름을 3문장 이내로 적는다.',
      },
      {
        key: 'keyPoints',
        label: '핵심 개념',
        type: 'list',
        guidance: '반드시 기억해야 할 개념을 적는다.',
      },
      {
        key: 'sections',
        label: '상세 내용',
        type: 'table',
        guidance: '강의 순서대로 소주제와 설명을 정리한다.',
        columns: [
          { key: 'section', label: '소주제' },
          { key: 'detail', label: '설명' },
        ],
      },
      {
        key: 'glossary',
        label: '용어 정리',
        type: 'table',
        guidance: '강의에 등장한 전문 용어와 뜻을 적는다.',
        columns: [
          { key: 'term', label: '용어' },
          { key: 'meaning', label: '뜻' },
        ],
      },
      {
        key: 'questions',
        label: '확인이 필요한 부분',
        type: 'list',
        guidance: '녹음만으로는 불분명해 추가 학습이 필요한 지점을 적는다.',
      },
      {
        key: 'review',
        label: '복습 포인트',
        type: 'list',
        guidance: '시험이나 실무에 바로 쓸 수 있는 형태로 적는다.',
      },
    ],
  },
];

export function getAllTemplates(customTemplates: SummaryTemplate[] = []): SummaryTemplate[] {
  const merged = new Map<string, SummaryTemplate>();

  for (const template of SYSTEM_TEMPLATES) {
    merged.set(template.id, template);
  }

  for (const template of customTemplates) {
    merged.set(template.id, template);
  }

  return [...merged.values()];
}

export function findTemplate(
  templateId: string,
  customTemplates: SummaryTemplate[] = [],
): SummaryTemplate | undefined {
  return getAllTemplates(customTemplates).find((template) => template.id === templateId);
}

/**
 * Builds a strict JSON schema so the model can only answer in the exact shape
 * the template declares. Structured outputs require every property to be
 * required and additional properties to be disallowed.
 */
export function buildSchema(template: SummaryTemplate): Record<string, unknown> {
  const properties: Record<string, unknown> = {};

  for (const field of template.fields) {
    if (field.type === 'text') {
      properties[field.key] = { type: 'string', description: field.guidance };
    } else if (field.type === 'list') {
      properties[field.key] = {
        type: 'array',
        description: field.guidance,
        items: { type: 'string' },
      };
    } else {
      const columns = field.columns ?? [];
      properties[field.key] = {
        type: 'array',
        description: field.guidance,
        items: {
          type: 'object',
          properties: Object.fromEntries(
            columns.map((column) => [column.key, { type: 'string', description: column.label }]),
          ),
          required: columns.map((column) => column.key),
          additionalProperties: false,
        },
      };
    }
  }

  return {
    type: 'object',
    properties,
    required: template.fields.map((field) => field.key),
    additionalProperties: false,
  };
}

function escapeCell(value: string): string {
  return value.replace(/\r?\n/g, ' ').replace(/\|/g, '\\|').trim();
}

/** Renders the structured answer as Markdown for display, export and sharing. */
export function renderMarkdown(
  template: SummaryTemplate,
  data: Record<string, unknown>,
  meta: { title: string; recordedAt: string; durationSeconds?: number },
): string {
  const lines: string[] = [`# ${meta.title}`, ''];
  lines.push(`- 템플릿: ${template.name}`);
  lines.push(`- 녹음 일시: ${meta.recordedAt}`);
  if (meta.durationSeconds) {
    const minutes = Math.floor(meta.durationSeconds / 60);
    const seconds = meta.durationSeconds % 60;
    lines.push(`- 길이: ${minutes}분 ${seconds}초`);
  }
  lines.push('');

  for (const field of template.fields) {
    const value = data[field.key];
    if (field.type === 'text') {
      const text = String(value ?? '').trim();
      if (!text) {
        continue;
      }
      lines.push(`## ${field.label}`, '', text, '');
      continue;
    }

    const rows = Array.isArray(value) ? value : [];
    if (rows.length === 0) {
      continue;
    }

    lines.push(`## ${field.label}`, '');
    if (field.type === 'list') {
      for (const row of rows) {
        lines.push(`- ${String(row).trim()}`);
      }
      lines.push('');
      continue;
    }

    const columns = field.columns ?? [];
    lines.push(`| ${columns.map((column) => column.label).join(' | ')} |`);
    lines.push(`| ${columns.map(() => '---').join(' | ')} |`);
    for (const row of rows) {
      const record = (row ?? {}) as Record<string, unknown>;
      lines.push(
        `| ${columns.map((column) => escapeCell(String(record[column.key] ?? ''))).join(' | ')} |`,
      );
    }
    lines.push('');
  }

  return lines.join('\n').trimEnd() + '\n';
}
