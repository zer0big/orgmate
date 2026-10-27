function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required app setting: ${name}`);
  }
  return value;
}

function optional(name: string, fallback = ''): string {
  return process.env[name] ?? fallback;
}

export interface OrgMateConfig {
  dataStorageAccount: string;
  dataBlobEndpoint: string;
  cosmosEndpoint: string;
  cosmosDatabase: string;
  speechEndpoint: string;
  openAiEndpoint: string;
  chatDeployment: string;
}

export function loadConfig(): OrgMateConfig {
  return {
    dataStorageAccount: required('ORGMATE_DATA_STORAGE_ACCOUNT'),
    dataBlobEndpoint: required('ORGMATE_DATA_BLOB_ENDPOINT'),
    cosmosEndpoint: required('ORGMATE_COSMOS_ENDPOINT'),
    cosmosDatabase: optional('ORGMATE_COSMOS_DATABASE', 'orgmate'),
    speechEndpoint: required('ORGMATE_SPEECH_ENDPOINT'),
    openAiEndpoint: required('ORGMATE_OPENAI_ENDPOINT'),
    chatDeployment: optional('ORGMATE_CHAT_DEPLOYMENT', 'gpt-4.1-mini'),
  };
}

/**
 * Reports which settings are present without revealing their values.
 * Used by the health endpoint to verify a deployment end to end.
 */
export function describeConfig(): Record<string, boolean> {
  const names = [
    'ORGMATE_DATA_STORAGE_ACCOUNT',
    'ORGMATE_DATA_BLOB_ENDPOINT',
    'ORGMATE_COSMOS_ENDPOINT',
    'ORGMATE_COSMOS_DATABASE',
    'ORGMATE_SPEECH_ENDPOINT',
    'ORGMATE_OPENAI_ENDPOINT',
    'ORGMATE_CHAT_DEPLOYMENT',
    'APPLICATIONINSIGHTS_CONNECTION_STRING',
  ];
  return Object.fromEntries(names.map((name) => [name, Boolean(process.env[name])]));
}
