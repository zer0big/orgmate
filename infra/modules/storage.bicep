@description('Storage account name. 3-24 lowercase alphanumeric characters.')
param name string

@description('Azure region.')
param location string

@description('Tags applied to the account.')
param tags object

@allowed([
  'Standard_LRS'
  'Standard_ZRS'
  'Standard_GRS'
])
@description('Replication SKU. Standard_ZRS is used for durable user content.')
param skuName string = 'Standard_ZRS'

@description('Blob containers to create.')
param containers array = []

@description('Storage queues to create. Used for background job hand-off.')
param queues array = []

@description('Apply hot/cool/cold tiering to long lived audio and artifacts.')
param enableLifecycleTiering bool = false

@description('Enable blob soft delete and versioning for recoverability.')
param enableBlobSoftDelete bool = false

resource storage 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: name
  location: location
  tags: tags
  sku: {
    name: skuName
  }
  kind: 'StorageV2'
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    accessTier: 'Hot'
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
    allowBlobPublicAccess: false
    allowSharedKeyAccess: false
    allowCrossTenantReplication: false
    defaultToOAuthAuthentication: true
    publicNetworkAccess: 'Enabled'
    networkAcls: {
      bypass: 'AzureServices'
      defaultAction: 'Allow'
    }
    encryption: {
      requireInfrastructureEncryption: false
      keySource: 'Microsoft.Storage'
      services: {
        blob: {
          enabled: true
          keyType: 'Account'
        }
        file: {
          enabled: true
          keyType: 'Account'
        }
      }
    }
  }
}

resource blobServices 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' = {
  parent: storage
  name: 'default'
  properties: {
    isVersioningEnabled: enableBlobSoftDelete
    deleteRetentionPolicy: enableBlobSoftDelete
      ? {
          enabled: true
          days: 14
          allowPermanentDelete: false
        }
      : {
          enabled: false
        }
    containerDeleteRetentionPolicy: enableBlobSoftDelete
      ? {
          enabled: true
          days: 14
        }
      : {
          enabled: false
        }
  }
}

resource blobContainers 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = [
  for container in containers: {
    parent: blobServices
    name: container
    properties: {
      publicAccess: 'None'
    }
  }
]

resource queueServices 'Microsoft.Storage/storageAccounts/queueServices@2023-05-01' = if (!empty(queues)) {
  parent: storage
  name: 'default'
}

resource storageQueues 'Microsoft.Storage/storageAccounts/queueServices/queues@2023-05-01' = [
  for queue in queues: {
    parent: queueServices
    name: queue
  }
]

// Archive tier is not available on ZRS accounts, so the policy tiers Hot -> Cool -> Cold.
resource lifecycle 'Microsoft.Storage/storageAccounts/managementPolicies@2023-05-01' = if (enableLifecycleTiering) {
  parent: storage
  name: 'default'
  properties: {
    policy: {
      rules: [
        {
          name: 'tier-recordings'
          enabled: true
          type: 'Lifecycle'
          definition: {
            filters: {
              blobTypes: [
                'blockBlob'
              ]
              prefixMatch: [
                'audio/'
              ]
            }
            actions: {
              baseBlob: {
                tierToCool: {
                  daysAfterModificationGreaterThan: 30
                }
                tierToCold: {
                  daysAfterModificationGreaterThan: 180
                }
              }
              version: {
                delete: {
                  daysAfterCreationGreaterThan: 30
                }
              }
            }
          }
        }
        {
          name: 'tier-transcripts-and-artifacts'
          enabled: true
          type: 'Lifecycle'
          definition: {
            filters: {
              blobTypes: [
                'blockBlob'
              ]
              prefixMatch: [
                'transcripts/'
                'artifacts/'
              ]
            }
            actions: {
              baseBlob: {
                tierToCool: {
                  daysAfterModificationGreaterThan: 90
                }
              }
              version: {
                delete: {
                  daysAfterCreationGreaterThan: 30
                }
              }
            }
          }
        }
      ]
    }
  }
}

output name string = storage.name
output id string = storage.id
output primaryBlobEndpoint string = storage.properties.primaryEndpoints.blob
output primaryQueueEndpoint string = storage.properties.primaryEndpoints.queue
