targetScope = 'subscription'

@minLength(1)
@maxLength(12)
@description('Environment name used to derive resource names. Example: dev, prod.')
param environmentName string

@description('Primary region. Stores all recordings, transcripts and artifacts. Also hosts Speech fast transcription.')
param location string = 'koreacentral'

@description('Region hosting the Azure OpenAI account used to organize transcripts into templates.')
param openAiLocation string = 'eastus'

@description('Azure OpenAI chat model used for the organize step.')
param chatModelName string = 'gpt-4.1-mini'

@description('Azure OpenAI chat model version.')
param chatModelVersion string = '2025-04-14'

@description('Tokens-per-minute capacity (in thousands) for the chat deployment.')
param chatModelCapacity int = 50

@description('Object id of the developer principal that should receive data-plane access for local development. Leave empty to skip.')
param developerPrincipalId string = ''

@description('Application (client) id of the OrgMate API app registration. When set, Easy Auth is enforced on the function app.')
param apiClientId string = ''

@description('Application (client) id of the OrgMate mobile app registration. Restricts which clients may call the API.')
param mobileClientId string = ''

var resourceToken = toLower(uniqueString(subscription().id, environmentName, location))
var tags = {
  'azd-env-name': environmentName
  application: 'orgmate'
  environment: environmentName
}

resource rg 'Microsoft.Resources/resourceGroups@2024-03-01' = {
  name: 'rg-orgmate-${environmentName}'
  location: location
  tags: tags
}

module monitoring 'modules/monitoring.bicep' = {
  scope: rg
  name: 'monitoring'
  params: {
    location: location
    tags: tags
    logAnalyticsName: 'log-orgmate-${environmentName}-${resourceToken}'
    appInsightsName: 'appi-orgmate-${environmentName}-${resourceToken}'
  }
}

module dataStorage 'modules/storage.bicep' = {
  scope: rg
  name: 'dataStorage'
  params: {
    location: location
    tags: tags
    name: 'storgmate${resourceToken}'
    skuName: 'Standard_ZRS'
    containers: [
      'audio'
      'transcripts'
      'artifacts'
    ]
    enableLifecycleTiering: true
    enableBlobSoftDelete: true
  }
}

module functionStorage 'modules/storage.bicep' = {
  scope: rg
  name: 'functionStorage'
  params: {
    location: location
    tags: tags
    name: 'stfn${resourceToken}'
    skuName: 'Standard_LRS'
    containers: [
      'deployments'
    ]
    enableLifecycleTiering: false
    enableBlobSoftDelete: false
  }
}

module cosmos 'modules/cosmos.bicep' = {
  scope: rg
  name: 'cosmos'
  params: {
    location: location
    tags: tags
    accountName: 'cosmos-orgmate-${environmentName}-${resourceToken}'
    databaseName: 'orgmate'
  }
}

module speech 'modules/aiServices.bicep' = {
  scope: rg
  name: 'speech'
  params: {
    location: location
    tags: tags
    name: 'ais-orgmate-${environmentName}-${resourceToken}'
  }
}

module openAi 'modules/openAi.bicep' = {
  scope: rg
  name: 'openAi'
  params: {
    location: openAiLocation
    tags: tags
    name: 'oai-orgmate-${environmentName}-${resourceToken}'
    chatModelName: chatModelName
    chatModelVersion: chatModelVersion
    chatModelCapacity: chatModelCapacity
  }
}

module functionApp 'modules/functionApp.bicep' = {
  scope: rg
  name: 'functionApp'
  params: {
    location: location
    tags: tags
    planName: 'asp-orgmate-${environmentName}-${resourceToken}'
    siteName: 'func-orgmate-${environmentName}-${resourceToken}'
    deploymentStorageAccountName: functionStorage.outputs.name
    deploymentContainerUrl: '${functionStorage.outputs.primaryBlobEndpoint}deployments'
    runtimeStorageAccountName: functionStorage.outputs.name
    appInsightsConnectionString: monitoring.outputs.appInsightsConnectionString
    dataStorageAccountName: dataStorage.outputs.name
    dataStorageBlobEndpoint: dataStorage.outputs.primaryBlobEndpoint
    cosmosEndpoint: cosmos.outputs.endpoint
    cosmosDatabaseName: cosmos.outputs.databaseName
    speechEndpoint: speech.outputs.endpoint
    openAiEndpoint: openAi.outputs.endpoint
    chatDeploymentName: openAi.outputs.chatDeploymentName
    entraClientId: apiClientId
    allowedClientApplicationIds: empty(mobileClientId) ? [] : [mobileClientId]
  }
}

module appRbac 'modules/rbac.bicep' = {
  scope: rg
  name: 'appRbac'
  params: {
    principalId: functionApp.outputs.principalId
    principalType: 'ServicePrincipal'
    dataStorageAccountName: dataStorage.outputs.name
    functionStorageAccountName: functionStorage.outputs.name
    speechAccountName: speech.outputs.name
    openAiAccountName: openAi.outputs.name
    includeRuntimeRoles: true
  }
}

module appCosmosRbac 'modules/rbacCosmos.bicep' = {
  scope: rg
  name: 'appCosmosRbac'
  params: {
    accountName: cosmos.outputs.name
    principalId: functionApp.outputs.principalId
  }
}

module devRbac 'modules/rbac.bicep' = if (!empty(developerPrincipalId)) {
  scope: rg
  name: 'devRbac'
  params: {
    principalId: developerPrincipalId
    principalType: 'User'
    dataStorageAccountName: dataStorage.outputs.name
    functionStorageAccountName: functionStorage.outputs.name
    speechAccountName: speech.outputs.name
    openAiAccountName: openAi.outputs.name
    includeRuntimeRoles: false
  }
}

module devCosmosRbac 'modules/rbacCosmos.bicep' = if (!empty(developerPrincipalId)) {
  scope: rg
  name: 'devCosmosRbac'
  params: {
    accountName: cosmos.outputs.name
    principalId: developerPrincipalId
  }
}

output AZURE_LOCATION string = location
output AZURE_RESOURCE_GROUP string = rg.name
output AZURE_TENANT_ID string = subscription().tenantId
output ORGMATE_FUNCTION_APP_NAME string = functionApp.outputs.name
output ORGMATE_API_BASE_URL string = 'https://${functionApp.outputs.defaultHostName}'
output ORGMATE_DATA_STORAGE_ACCOUNT string = dataStorage.outputs.name
output ORGMATE_DATA_BLOB_ENDPOINT string = dataStorage.outputs.primaryBlobEndpoint
output ORGMATE_COSMOS_ENDPOINT string = cosmos.outputs.endpoint
output ORGMATE_COSMOS_DATABASE string = cosmos.outputs.databaseName
output ORGMATE_SPEECH_ENDPOINT string = speech.outputs.endpoint
output ORGMATE_OPENAI_ENDPOINT string = openAi.outputs.endpoint
output ORGMATE_CHAT_DEPLOYMENT string = openAi.outputs.chatDeploymentName
output ORGMATE_API_CLIENT_ID string = apiClientId
output ORGMATE_API_SCOPE string = empty(apiClientId) ? '' : 'api://${apiClientId}/access_as_user'
output ORGMATE_MOBILE_CLIENT_ID string = mobileClientId
output APPLICATIONINSIGHTS_CONNECTION_STRING string = monitoring.outputs.appInsightsConnectionString
