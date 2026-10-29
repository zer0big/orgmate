# OrgMate

회의와 대화를 녹음·전사하고, "정리" 버튼 한 번으로 사전 정의된 템플릿에 맞춰 체계적인 문서를 만들어 주는 Azure 기반 애플리케이션이다.

## 구성

| 영역 | 기술 | 리전 |
| --- | --- | --- |
| 모바일 클라이언트 | React Native (Expo Dev Client), Android 우선 | - |
| API / 오케스트레이션 | Azure Functions (Node 22, TypeScript, Flex Consumption) | Korea Central |
| 녹음·전사·산출물 저장 | Azure Blob Storage (ZRS) | Korea Central |
| 메타데이터 | Azure Cosmos DB for NoSQL (serverless) | Korea Central |
| 전사 | Azure AI Speech — Fast Transcription API | Korea Central |
| 정리(요약) | Azure OpenAI — `gpt-4.1-mini` | East US |
| 관측성 | Application Insights + Log Analytics | Korea Central |

음성 원본과 전사 결과는 Korea Central을 벗어나지 않는다. 템플릿 정리 단계에서만 전사 텍스트가 East US의 Azure OpenAI로 전달된다.

## 저장소 구조

```
apps/api/        Azure Functions (TypeScript)
apps/mobile/     Expo React Native 앱 (Phase 1에서 추가)
packages/shared/ 공유 타입 (Phase 1에서 추가)
infra/           Bicep IaC
```

## 사전 요구 사항

- Node.js 22 이상
- Azure CLI, Azure Developer CLI (`azd`)
- Azure Functions Core Tools v4 (로컬 실행 시)
- 대상 구독에 대한 Owner 또는 Contributor + User Access Administrator 권한

## 배포

```powershell
azd auth login
azd env new dev
azd up
```

배포가 끝나면 `https://<function-app>.azurewebsites.net/api/health` 로 상태를 확인한다.

## 관리자 권한 구성을 위한 필수 절차

관리자 페이지는 단순히 로그인 여부가 아니라 Entra ID의 app role claim을 기반으로 접근을 허용한다.

1. Azure Portal → Microsoft Entra ID → App registrations → OrgMate API 앱 선택
2. `App roles` 탭에서 `+ Create app role` 선택
3. 예시 값:
   - Display name: `OrgMate Admin`
   - Value: `OrgMate.Admin`
   - Allowed member types: `Users/Groups`
4. 관리자 사용자 또는 그룹에 해당 역할을 할당
5. Function App의 Easy Auth에서 해당 API 앱을 인증 서버로 설정했는지 확인

이렇게 설정되면 Easy Auth가 `x-ms-client-principal`에 `roles` claim을 주입하고, 서버는 `Admin`, `Administrator`, `OrgMate.Admin` 형태를 인식해 `/api/manage` 접근을 허용한다. (Functions 호스트가 `admin` 경로를 예약하므로 `manage`를 사용한다.)

## Well-Architected 설계 원칙 적용

- **보안**: 모든 서비스가 Entra ID 전용 인증이다. Storage는 `allowSharedKeyAccess=false`, Cosmos는 `disableLocalAuth=true`, AI Services와 Azure OpenAI는 `disableLocalAuth=true`로 설정해 API 키를 사용하지 않는다. Function App은 시스템 할당 관리 ID로 모든 데이터 평면에 접근한다. 클라이언트 업로드는 단기 User Delegation SAS만 사용한다.
- **안정성**: Blob은 ZRS, 버전 관리와 14일 소프트 삭제를 적용한다. Cosmos는 7일 연속 백업을 사용한다. 전사·정리 파이프라인은 Storage Queue 트리거로 동작하며, 실패 시 최대 3회(`maxDequeueCount`) 재시도하고 이후 poison 큐로 이동한다.
- **비용 최적화**: 전 구간 서버리스 소비 모델이다. Blob 수명 주기로 녹음은 30일 후 Cool, 180일 후 Cold로 전환한다. Log Analytics는 일일 1GB 수집 상한과 샘플링을 적용한다.
- **운영 우수성**: 전체 인프라는 Bicep으로 선언하고 `azd`로 재현 가능하게 배포한다.
- **성능 효율성**: 클라이언트가 Blob에 직접 업로드해 API 경유 전송을 제거한다. 전사와 정리는 비동기 오케스트레이션으로 처리한다.

## 추가 문서

- [운영 매뉴얼](docs/README.md)
- [아키텍처 설계](docs/architecture/solution-architecture.md)
- [배포 및 이식 가이드](docs/deployment/deployment-guide.md)
- [운영 절차서](docs/operations/operations-runbook.md)
- [사용자 매뉴얼](docs/user-guide.md)
- [MVP 운영 강화 체크리스트](docs/operations/production-hardening-checklist.md)

## 알려진 사항

- `npm audit`이 `@azure/msal-node` 관련 고위험 권고(GHSA-xcx6-jx8p-x3h5)를 보고한다. 해당 취약점은 OAuth authorization code 흐름에 한정되며, 본 API는 관리 ID 기반 인증만 사용하므로 영향을 받지 않는다. `@azure/identity`가 패치된 `msal-node` 7.x를 채택하면 해소된다.
