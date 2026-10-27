@description('Azure OpenAI account name. Also used as the custom subdomain.')
param name string

@description('Azure region hosting the chat model.')
param location string

@description('Tags applied to the account.')
param tags object

@description('Chat model used to organize transcripts into templates.')
param chatModelName string

@description('Chat model version.')
param chatModelVersion string

@description('Capacity in thousands of tokens per minute.')
param chatModelCapacity int

resource openAi 'Microsoft.CognitiveServices/accounts@2024-10-01' = {
  name: name
  location: location
  tags: tags
  kind: 'OpenAI'
  sku: {
    name: 'S0'
  }
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    customSubDomainName: name
    // Entra ID only. API keys are disabled.
    disableLocalAuth: true
    publicNetworkAccess: 'Enabled'
    networkAcls: {
      defaultAction: 'Allow'
    }
  }
}

resource chatDeployment 'Microsoft.CognitiveServices/accounts/deployments@2024-10-01' = {
  parent: openAi
  name: chatModelName
  sku: {
    name: 'GlobalStandard'
    capacity: chatModelCapacity
  }
  properties: {
    model: {
      format: 'OpenAI'
      name: chatModelName
      version: chatModelVersion
    }
    versionUpgradeOption: 'OnceNewDefaultVersionAvailable'
    raiPolicyName: 'Microsoft.DefaultV2'
  }
}

output name string = openAi.name
output id string = openAi.id
output endpoint string = openAi.properties.endpoint
output chatDeploymentName string = chatDeployment.name
