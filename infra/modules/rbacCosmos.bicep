@description('Cosmos DB for NoSQL account name.')
param accountName string

@description('Object id of the principal receiving data-plane access.')
param principalId string

// Built-in Cosmos DB Data Contributor. This is a data-plane role definition, separate from Azure RBAC.
var dataContributorRoleId = '00000000-0000-0000-0000-000000000002'

resource account 'Microsoft.DocumentDB/databaseAccounts@2024-11-15' existing = {
  name: accountName
}

resource assignment 'Microsoft.DocumentDB/databaseAccounts/sqlRoleAssignments@2024-11-15' = {
  parent: account
  name: guid(account.id, principalId, dataContributorRoleId)
  properties: {
    roleDefinitionId: '${account.id}/sqlRoleDefinitions/${dataContributorRoleId}'
    principalId: principalId
    scope: account.id
  }
}
