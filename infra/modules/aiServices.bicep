@description('AI Services account name. Also used as the custom subdomain, which Entra ID authentication requires.')
param name string

@description('Azure region. Must support the Speech fast transcription API.')
param location string

@description('Tags applied to the account.')
param tags object

resource aiServices 'Microsoft.CognitiveServices/accounts@2024-10-01' = {
  name: name
  location: location
  tags: tags
  kind: 'AIServices'
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

output name string = aiServices.name
output id string = aiServices.id
output endpoint string = aiServices.properties.endpoint
