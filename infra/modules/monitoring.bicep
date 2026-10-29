@description('Azure region for the workspace and the Application Insights component.')
param location string

@description('Tags applied to every resource.')
param tags object

@description('Log Analytics workspace name.')
param logAnalyticsName string

@description('Application Insights component name.')
param appInsightsName string

@description('Daily ingestion cap in GB. Guards against runaway telemetry cost.')
param dailyQuotaGb int = 1

@description('Email address that receives operational alerts. Leave empty to create no action group.')
param alertEmail string = ''

@description('Name of the data storage account whose queues carry transcription and summarization jobs. Leave empty to skip the queue backlog alert.')
param dataStorageAccountName string = ''

resource workspace 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: logAnalyticsName
  location: location
  tags: tags
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    retentionInDays: 30
    workspaceCapping: {
      dailyQuotaGb: dailyQuotaGb
    }
    publicNetworkAccessForIngestion: 'Enabled'
    publicNetworkAccessForQuery: 'Enabled'
  }
}

resource appInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: appInsightsName
  location: location
  tags: tags
  kind: 'web'
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: workspace.id
    IngestionMode: 'LogAnalytics'
    publicNetworkAccessForIngestion: 'Enabled'
    publicNetworkAccessForQuery: 'Enabled'
    DisableLocalAuth: true
  }
}

resource alertActionGroup 'Microsoft.Insights/actionGroups@2023-01-01' = if (!empty(alertEmail)) {
  name: 'ag-orgmate-ops'
  location: 'global'
  tags: tags
  properties: {
    groupShortName: 'orgmate'
    enabled: true
    emailReceivers: [
      {
        name: 'owner'
        emailAddress: alertEmail
        useCommonAlertSchema: true
      }
    ]
  }
}

resource failedRequestAlert 'Microsoft.Insights/metricAlerts@2018-03-01' = {
  name: 'orgmate-function-failed-requests'
  location: 'global'
  tags: tags
  properties: {
    description: 'Alert if the OrgMate Function App reports failed requests beyond a small threshold.'
    severity: 2
    enabled: true
    scopes: [
      appInsights.id
    ]
    evaluationFrequency: 'PT5M'
    windowSize: 'PT15M'
    criteria: {
      'odata.type': 'Microsoft.Azure.Monitor.SingleResourceMultipleMetricCriteria'
      allOf: [
        {
          criterionType: 'StaticThresholdCriterion'
          name: 'FailedRequests'
          metricName: 'requests/failed'
          operator: 'GreaterThan'
          threshold: 5
          timeAggregation: 'Count'
        }
      ]
    }
    actions: empty(alertEmail) ? [] : [
      {
        actionGroupId: alertActionGroup.id
      }
    ]
  }
}

// Transcription and summarization run from queue triggers, so a failure there is
// logged as an error trace and never surfaces as a failed HTTP request.
resource pipelineFailureAlert 'Microsoft.Insights/scheduledQueryRules@2022-06-15' = {
  name: 'orgmate-pipeline-failures'
  location: location
  tags: tags
  properties: {
    displayName: 'OrgMate transcription or summarization failed'
    description: 'Fires when a transcription or summarization job logs a failure.'
    severity: 2
    enabled: true
    scopes: [
      appInsights.id
    ]
    evaluationFrequency: 'PT15M'
    windowSize: 'PT15M'
    criteria: {
      allOf: [
        {
          query: 'traces | where severityLevel >= 3 | where message startswith "Transcription failed" or message startswith "Summarization failed"'
          timeAggregation: 'Count'
          operator: 'GreaterThan'
          threshold: 0
          failingPeriods: {
            numberOfEvaluationPeriods: 1
            minFailingPeriodsToAlert: 1
          }
        }
      ]
    }
    actions: {
      actionGroups: empty(alertEmail) ? [] : [
        alertActionGroup.id
      ]
    }
  }
}

resource dataStorage 'Microsoft.Storage/storageAccounts@2023-05-01' existing = if (!empty(dataStorageAccountName)) {
  name: dataStorageAccountName
}

// Backlog and poison messages both stay in the queue service, so a sustained
// message count means jobs are stuck or failing permanently.
resource queueBacklogAlert 'Microsoft.Insights/metricAlerts@2018-03-01' = if (!empty(dataStorageAccountName)) {
  name: 'orgmate-queue-backlog'
  location: 'global'
  tags: tags
  properties: {
    description: 'Alert when queued or poison messages stay above a small threshold.'
    severity: 2
    enabled: true
    scopes: [
      '${dataStorage.id}/queueServices/default'
    ]
    evaluationFrequency: 'PT15M'
    windowSize: 'PT1H'
    criteria: {
      'odata.type': 'Microsoft.Azure.Monitor.SingleResourceMultipleMetricCriteria'
      allOf: [
        {
          criterionType: 'StaticThresholdCriterion'
          name: 'QueueMessages'
          metricName: 'QueueMessageCount'
          operator: 'GreaterThan'
          threshold: 5
          timeAggregation: 'Average'
        }
      ]
    }
    actions: empty(alertEmail) ? [] : [
      {
        actionGroupId: alertActionGroup.id
      }
    ]
  }
}

output logAnalyticsId string = workspace.id
output appInsightsName string = appInsights.name
output appInsightsConnectionString string = appInsights.properties.ConnectionString
