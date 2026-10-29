@description('Key Vault name.')
param name string

@description('Azure region for the vault.')
param location string

@description('Tags applied to the vault.')
param tags object

@description('Enable purge protection. Recommended for production and single-user data retention.')
param enablePurgeProtection bool = true

@description('Use Azure RBAC instead of access policies. Prefer RBAC for easier least-privilege governance.')
param enableRbacAuthorization bool = true

resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: name
  location: location
  tags: tags
  properties: {
    tenantId: subscription().tenantId
    sku: {
      family: 'A'
      name: 'standard'
    }
    enableRbacAuthorization: enableRbacAuthorization
    enablePurgeProtection: enablePurgeProtection
    enabledForDeployment: false
    enabledForDiskEncryption: false
    enabledForTemplateDeployment: true
    softDeleteRetentionInDays: 90
    publicNetworkAccess: 'Enabled'
    accessPolicies: []
  }
}

output name string = keyVault.name
output vaultUri string = keyVault.properties.vaultUri
