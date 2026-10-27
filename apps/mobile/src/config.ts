import Constants from 'expo-constants';

export interface OrgMateConfig {
  apiBaseUrl: string;
  tenantId: string;
  clientId: string;
  apiScope: string;
}

const extra = Constants.expoConfig?.extra?.orgmate as Partial<OrgMateConfig> | undefined;

function require_(name: keyof OrgMateConfig): string {
  const value = extra?.[name];
  if (!value) {
    throw new Error(`app.json의 extra.orgmate.${name} 설정이 없습니다.`);
  }
  return value;
}

export const config: OrgMateConfig = {
  apiBaseUrl: require_('apiBaseUrl'),
  tenantId: require_('tenantId'),
  clientId: require_('clientId'),
  apiScope: require_('apiScope'),
};

export const discoveryUrl = `https://login.microsoftonline.com/${config.tenantId}/v2.0`;
