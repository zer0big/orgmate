import { AzureOpenAI } from 'openai';
import { DefaultAzureCredential, getBearerTokenProvider } from '@azure/identity';
import { loadConfig } from '../config.js';
import {
  SummaryTemplate,
  buildSchema,
} from '../templates/systemTemplates.js';

const API_VERSION = '2024-10-21';
const SCOPE = 'https://cognitiveservices.azure.com/.default';
/** gpt-4.1-mini has a very large context, but cap input to bound cost. */
const MAX_TRANSCRIPT_CHARS = 240_000;

const config = loadConfig();
const client = new AzureOpenAI({
  endpoint: config.openAiEndpoint,
  apiVersion: API_VERSION,
  azureADTokenProvider: getBearerTokenProvider(new DefaultAzureCredential(), SCOPE),
});

function buildSystemPrompt(template: SummaryTemplate): string {
  const fieldGuide = template.fields
    .map((field) => `- ${field.key} (${field.label}): ${field.guidance}`)
    .join('\n');

  return [
    `당신은 ${template.persona}이다. 음성 전사본을 읽고 지정된 구조로 정리한다.`,
    '',
    '규칙:',
    '- 전사본에 실제로 등장한 내용만 사용한다. 추측하거나 지어내지 않는다.',
    '- 전사 오류로 보이는 어색한 표현은 문맥에 맞게 자연스럽게 다듬는다.',
    '- 해당 항목에 쓸 내용이 전사본에 없으면 빈 문자열 또는 빈 배열로 둔다.',
    '- 모든 출력은 한국어로 작성한다.',
    '- 간결한 전문가 서술체(~이다, ~한다)를 사용하고 이모지를 쓰지 않는다.',
    '',
    '항목별 작성 지침:',
    fieldGuide,
  ].join('\n');
}

function buildUserPrompt(
  transcript: string,
  meta: { title: string; recordedAt: string; glossary?: string[] },
): string {
  const trimmed =
    transcript.length > MAX_TRANSCRIPT_CHARS
      ? `${transcript.slice(0, MAX_TRANSCRIPT_CHARS)}\n\n(이후 내용은 길이 제한으로 생략됨)`
      : transcript;

  const glossary = meta.glossary?.length
    ? [
        '조직 전용 용어 (전사본에 비슷한 말이 나오면 아래 표기로 고쳐 쓴다):',
        meta.glossary.map((term) => `- ${term}`).join('\n'),
        '',
      ]
    : [];

  return [
    `녹음 제목: ${meta.title}`,
    `녹음 일시: ${meta.recordedAt}`,
    '',
    ...glossary,
    '전사본:',
    '"""',
    trimmed,
    '"""',
  ].join('\n');
}

export interface SummarizeResult {
  data: Record<string, unknown>;
  promptTokens: number;
  completionTokens: number;
}

/**
 * Asks the model to fill the template using structured outputs, so the answer
 * is guaranteed to match the template schema instead of free-form prose.
 */
export async function summarizeTranscript(
  template: SummaryTemplate,
  transcript: string,
  meta: { title: string; recordedAt: string; glossary?: string[] },
): Promise<SummarizeResult> {
  const response = await client.chat.completions.create({
    model: config.chatDeployment,
    temperature: 0.2,
    messages: [
      { role: 'system', content: buildSystemPrompt(template) },
      { role: 'user', content: buildUserPrompt(transcript, meta) },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: template.id.replace(/-/g, '_'),
        strict: true,
        schema: buildSchema(template),
      },
    },
  });

  const choice = response.choices[0];
  if (choice?.finish_reason === 'content_filter') {
    throw new Error('콘텐츠 필터에 의해 정리가 중단되었다.');
  }

  const content = choice?.message?.content;
  if (!content) {
    throw new Error('모델이 빈 응답을 반환했다.');
  }

  return {
    data: JSON.parse(content) as Record<string, unknown>,
    promptTokens: response.usage?.prompt_tokens ?? 0,
    completionTokens: response.usage?.completion_tokens ?? 0,
  };
}
