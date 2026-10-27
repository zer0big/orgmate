@description('Flex Consumption plan name.')
param planName string

@description('Function app name.')
param siteName string

@description('Azure region.')
param location string

@description('Tags applied to the plan and the site.')
param tags object

@description('Storage account that holds the deployment package container.')
param deploymentStorageAccountName string

@description('Full URL of the blob container that holds the deployment package.')
param deploymentContainerUrl string

@description('Storage account used by the Functions host and the Durable Functions task hub.')
param runtimeStorageAccountName string

@description('Application Insights connection string.')
param appInsightsConnectionString string

@description('Storage account that holds recordings, transcripts and artifacts.')
param dataStorageAccountName string

@description('Blob endpoint of the data storage account.')
param dataStorageBlobEndpoint string

@description('Queue endpoint of the data storage account. Hosts the background job queues.')
param dataStorageQueueEndpoint string

@description('Queue that carries transcription jobs.')
param transcribeQueueName string = 'transcribe-jobs'

@description('Locale hint passed to Speech fast transcription.')
param transcriptionLocale string = 'ko-KR'

@description('Cosmos DB document endpoint.')
param cosmosEndpoint string

@description('Cosmos DB database name.')
param cosmosDatabaseName string

@description('Speech (AI Services) endpoint used for fast transcription.')
param speechEndpoint string

@description('Azure OpenAI endpoint.')
param openAiEndpoint string

@description('Azure OpenAI chat deployment name.')
param chatDeploymentName string

@description('Entra ID application (client) id of the API app registration. When set, Easy Auth is enabled.')
param entraClientId string = ''

@description('Entra ID tenant id used by Easy Auth.')
param entraTenantId string = subscription().tenantId

@description('Client application ids allowed to call the API. Empty means any application in the tenant.')
param allowedClientApplicationIds array = []

@description('Request paths that bypass Easy Auth, such as the health probe.')
param authExcludedPaths array = [
  '/api/health'
]

@description('Memory per instance in MB.')
@allowed([
  512
  2048
  4096
])
param instanceMemoryMB int = 2048

@description('Maximum number of instances the app may scale out to.')
param maximumInstanceCount int = 40

resource plan 'Microsoft.Web/serverfarms@2024-04-01' = {
  name: planName
  location: location
  tags: tags
  kind: 'functionapp'
  sku: {
    name: 'FC1'
    tier: 'FlexConsumption'
  }
  properties: {
    reserved: true
  }
}

resource site 'Microsoft.Web/sites@2024-04-01' = {
  name: siteName
  location: location
  tags: union(tags, { 'azd-service-name': 'api' })
  kind: 'functionapp,linux'
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    serverFarmId: plan.id
    httpsOnly: true
    publicNetworkAccess: 'Enabled'
    functionAppConfig: {
      deployment: {
        storage: {
          type: 'blobContainer'
          value: deploymentContainerUrl
          authentication: {
            type: 'SystemAssignedIdentity'
          }
        }
      }
      runtime: {
        name: 'node'
        version: '22'
      }
      scaleAndConcurrency: {
        instanceMemoryMB: instanceMemoryMB
        maximumInstanceCount: maximumInstanceCount
      }
    }
    siteConfig: {
      minTlsVersion: '1.2'
      ftpsState: 'Disabled'
      http20Enabled: true
      appSettings: [
        {
          name: 'AzureWebJobsStorage__accountName'
          value: runtimeStorageAccountName
        }
        {
          name: 'AzureWebJobsStorage__credential'
          value: 'managedidentity'
        }
        {
          name: 'APPLICATIONINSIGHTS_CONNECTION_STRING'
          value: appInsightsConnectionString
        }
        {
          name: 'APPLICATIONINSIGHTS_ENABLE_AGENT'
          value: 'false'
        }
        {
          name: 'ORGMATE_DATA_STORAGE_ACCOUNT'
          value: dataStorageAccountName
        }
        {
          name: 'ORGMATE_DATA_BLOB_ENDPOINT'
          value: dataStorageBlobEndpoint
        }
        {
          name: 'ORGMATE_DATA_QUEUE_ENDPOINT'
          value: dataStorageQueueEndpoint
        }
        {
          name: 'ORGMATE_TRANSCRIBE_QUEUE'
          value: transcribeQueueName
        }
        {
          name: 'ORGMATE_TRANSCRIPTION_LOCALE'
          value: transcriptionLocale
        }
        // Identity-based connection used by the queue trigger binding.
        {
          name: 'ORGMATE_JOBS__queueServiceUri'
          value: dataStorageQueueEndpoint
        }
        {
          name: 'ORGMATE_JOBS__credential'
          value: 'managedidentity'
        }
        {
          name: 'ORGMATE_COSMOS_ENDPOINT'
          value: cosmosEndpoint
        }
        {
          name: 'ORGMATE_COSMOS_DATABASE'
          value: cosmosDatabaseName
        }
        {
          name: 'ORGMATE_SPEECH_ENDPOINT'
          value: speechEndpoint
        }
        {
          name: 'ORGMATE_OPENAI_ENDPOINT'
          value: openAiEndpoint
        }
        {
          name: 'ORGMATE_CHAT_DEPLOYMENT'
          value: chatDeploymentName
        }
      ]
    }
  }
}

resource authSettings 'Microsoft.Web/sites/config@2024-04-01' = if (!empty(entraClientId)) {
  parent: site
  name: 'authsettingsV2'
  properties: {
    globalValidation: {
      requireAuthentication: true
      unauthenticatedClientAction: 'Return401'
      redirectToProvider: 'azureactivedirectory'
      excludedPaths: authExcludedPaths
    }
    identityProviders: {
      azureActiveDirectory: {
        enabled: true
        registration: {
          openIdIssuer: '${environment().authentication.loginEndpoint}${entraTenantId}/v2.0'
          clientId: entraClientId
        }
        validation: {
          defaultAuthorizationPolicy: {
            allowedApplications: allowedClientApplicationIds
          }
          allowedAudiences: [
            'api://${entraClientId}'
            entraClientId
          ]
        }
      }
    }
    login: {
      tokenStore: {
        enabled: false
      }
    }
    platform: {
      enabled: true
      runtimeVersion: '~1'
    }
  }
}

output name string = site.name
output id string = site.id
output defaultHostName string = site.properties.defaultHostName
output principalId string = site.identity.principalId
output deploymentStorageAccountName string = deploymentStorageAccountName
