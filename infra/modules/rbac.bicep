@description('Object id of the principal receiving data-plane access.')
param principalId string

@allowed([
  'ServicePrincipal'
  'User'
  'Group'
])
@description('Principal type. Use ServicePrincipal for managed identities.')
param principalType string = 'ServicePrincipal'

@description('Storage account holding recordings, transcripts and artifacts.')
param dataStorageAccountName string

@description('Storage account used by the Functions host.')
param functionStorageAccountName string

@description('AI Services account used for fast transcription.')
param speechAccountName string

@description('Azure OpenAI account used for the organize step.')
param openAiAccountName string

@description('Grant the Functions host roles on the runtime storage account. Only the function app identity needs these.')
param includeRuntimeRoles bool = true

var roles = {
  storageBlobDataContributor: 'ba92f5b4-2d11-453d-a403-e96b0029c9fe'
  storageBlobDataOwner: 'b7e6dc6d-f1e8-4753-8033-0f276bb0955b'
  storageBlobDelegator: 'db58b8e5-c6ad-4a2a-8342-4190687cbf4a'
  storageQueueDataContributor: '974c5e8b-45b9-4653-ba55-5f855dd0fb88'
  storageTableDataContributor: '0a9a7e1f-b9d0-4cc4-a60d-0319b160aaa3'
  cognitiveServicesSpeechUser: 'f2dc8367-1007-4938-bd23-fe263f013447'
  cognitiveServicesOpenAiUser: '5e0bd9bd-7b93-4f28-af87-19fc36ad61bd'
}

resource dataStorage 'Microsoft.Storage/storageAccounts@2023-05-01' existing = {
  name: dataStorageAccountName
}

resource functionStorage 'Microsoft.Storage/storageAccounts@2023-05-01' existing = {
  name: functionStorageAccountName
}

resource speech 'Microsoft.CognitiveServices/accounts@2024-10-01' existing = {
  name: speechAccountName
}

resource openAi 'Microsoft.CognitiveServices/accounts@2024-10-01' existing = {
  name: openAiAccountName
}

// Read and write recordings, transcripts and artifacts.
resource dataBlobContributor 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: dataStorage
  name: guid(dataStorage.id, principalId, roles.storageBlobDataContributor)
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roles.storageBlobDataContributor)
    principalId: principalId
    principalType: principalType
  }
}

// Required to mint user delegation SAS tokens for direct client uploads.
resource dataBlobDelegator 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: dataStorage
  name: guid(dataStorage.id, principalId, roles.storageBlobDelegator)
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roles.storageBlobDelegator)
    principalId: principalId
    principalType: principalType
  }
}

resource runtimeBlobOwner 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (includeRuntimeRoles) {
  scope: functionStorage
  name: guid(functionStorage.id, principalId, roles.storageBlobDataOwner)
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roles.storageBlobDataOwner)
    principalId: principalId
    principalType: principalType
  }
}

resource runtimeQueueContributor 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (includeRuntimeRoles) {
  scope: functionStorage
  name: guid(functionStorage.id, principalId, roles.storageQueueDataContributor)
  properties: {
    roleDefinitionId: subscriptionResourceId(
      'Microsoft.Authorization/roleDefinitions',
      roles.storageQueueDataContributor
    )
    principalId: principalId
    principalType: principalType
  }
}

resource runtimeTableContributor 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (includeRuntimeRoles) {
  scope: functionStorage
  name: guid(functionStorage.id, principalId, roles.storageTableDataContributor)
  properties: {
    roleDefinitionId: subscriptionResourceId(
      'Microsoft.Authorization/roleDefinitions',
      roles.storageTableDataContributor
    )
    principalId: principalId
    principalType: principalType
  }
}

resource speechUser 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: speech
  name: guid(speech.id, principalId, roles.cognitiveServicesSpeechUser)
  properties: {
    roleDefinitionId: subscriptionResourceId(
      'Microsoft.Authorization/roleDefinitions',
      roles.cognitiveServicesSpeechUser
    )
    principalId: principalId
    principalType: principalType
  }
}

resource openAiUser 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: openAi
  name: guid(openAi.id, principalId, roles.cognitiveServicesOpenAiUser)
  properties: {
    roleDefinitionId: subscriptionResourceId(
      'Microsoft.Authorization/roleDefinitions',
      roles.cognitiveServicesOpenAiUser
    )
    principalId: principalId
    principalType: principalType
  }
}
