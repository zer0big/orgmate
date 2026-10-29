# 배포 및 이식 가이드

## 1. 대상 배포 모델

현재 프로젝트는 Azure Developer CLI 기반 배포 모델을 사용합니다.

- IaC: Bicep
- 배포 도구: azd
- 애플리케이션 유형: Azure Functions + 모바일 앱 + Azure 데이터 서비스

## 2. 배포 구조

배포는 다음 흐름으로 진행됩니다.

1. azd 환경 설정
2. Bicep으로 Azure 리소스 프로비저닝
3. 함수 앱 코드 배포
4. 애플리케이션 상태 검증
5. 실행 환경 모니터링 및 운영 확인

## 3. 사전 준비

필수 항목:

- Azure CLI 설치
- Azure Developer CLI 설치
- Node.js 22 이상
- 구독 권한: Owner 또는 Contributor + User Access Administrator

권장 항목:

- 환경별 구성 파일 분리
- 팀 단위 GitHub 정책 적용
- 테스트/배포용 브랜치 운영

## 4. 프로비저닝 절차

```powershell
azd auth login
azd env new dev
azd provision --no-prompt
```

리소스가 생성되면 다음 항목을 확인합니다.

- Resource Group 생성 여부
- Function App 상태
- Storage, Cosmos, Speech, OpenAI 연결 여부
- Application Insights 데이터 수집 동작

## 5. 배포 절차

```powershell
azd deploy api --no-prompt
```

검증 항목:

```powershell
Invoke-RestMethod -Uri "https://<function-app>.azurewebsites.net/api/health"
```

필수 확인 사항:

- health endpoint 200 응답
- Azure Storage 연결 여부
- Cosmos DB 연결 여부
- Speech 연결 여부
- OpenAI 연결 여부

## 5.1 관리자 권한 구성

관리자 페이지는 로그인 사용자만 허용하는 것이 아니라, Entra ID의 app role claim이 있는 사용자만 접근 가능하도록 설계되어 있다.

필수 절차:

1. Azure Portal → Microsoft Entra ID → App registrations → OrgMate API 선택
2. `App roles` 탭에서 `+ Create app role` 클릭
3. 예시 값:
   - Display name: `OrgMate Admin`
   - Value: `OrgMate.Admin`
   - Allowed member types: `Users/Groups`
4. 관리자 계정 또는 보안 그룹에 역할 할당
5. Function App의 Easy Auth에서 해당 API 앱의 clientId를 사용하도록 설정

이 설정이 완료되면 `x-ms-client-principal` 헤더에 `roles` claim이 포함되고, 서버는 `Admin`, `Administrator`, `OrgMate.Admin` 등을 관리자로 인식한다. 이 역할을 가진 사용자만 관리자 API와 `/api/manage` 페이지에 접근할 수 있다. 다만 `/api/manage` 페이지는 브라우저 로그인(토큰 획득)이 구현되어 있지 않아 브라우저에서는 현재 401이 반환된다. (Functions 호스트가 `admin` 경로를 예약하므로 `manage`를 사용한다.)

## 6. 운영 환경 이식 기준

아래 기준을 만족해야 하며, 이를 기반으로 다른 환경으로 이식할 수 있습니다.

### 6.1 환경 분리

- dev / test / prod 별 리소스 그룹 분리
- 환경별 이름 규칙 고정
- 각 환경은 독립 Azure Subscription 또는 Resource Group 단위로 분리 가능

### 6.2 구성 분리

- 코드에 하드코딩된 값 최소화
- 환경 변수 기반 설정
- 리전, 모델 이름, 용량 값은 매개변수화

### 6.3 배포 재현성

- Bicep으로 리소스 생성
- azd 환경 파일로 구성 관리
- 동일 환경을 다시 생성할 수 있는 절차 보장

## 7. 이식 전략

### 7.1 동일 기술 스택 이식

같은 Azure 구성에서 다른 구독 또는 리전에 배포할 때는 다음이 핵심입니다.

- 환경 변수 재설정
- 위치값 변경
- 리소스 이름 값 재생성
- RBAC 재적용

### 7.2 다른 클라우드 또는 다른 런타임으로의 전환

다음은 앞으로 고려할 수 있는 이식 시나리오입니다.

- Azure Functions를 Container Apps로 이동
- Blob 저장소를 다른 객체 스토리지로 교체
- AI Speech/OpenAI를 다른 모델 제공자와 연동
- 모바일 앱을 Web App으로 확장

이 경우 핵심은 데이터 계약과 배치 작업 계약을 유지하는 것입니다.

## 8. 배포 체크리스트

### 사전 체크

- [ ] Azure 구독 및 권한 확인
- [ ] 리전 선택 완료
- [ ] 환경명 결정
- [ ] OpenAI 모델 및 Speech 리전 확인
- [ ] 비용 상한 기준 정의

### 배포 후 체크

- [ ] health endpoint 200
- [ ] 업로드 성공
- [ ] 전사 큐 실행
- [ ] 요약 생성 성공
- [ ] Blob 및 Cosmos 데이터 검증
- [ ] Application Insights 로그 수집 확인

## 9. 권장 프로덕션 강화 요소

다음 구성은 운영 전환 시 반드시 고려합니다.

- Key Vault 연동
- VNet 및 Private Endpoint
- Managed Identity와 RBAC 강화
- Alert 규칙 추가
- 일정한 리텐션 정책 및 백업 검증
- 운영용 대시보드 생성

## 10. 결론

OrgMate는 이미 Bicep + azd + 서버리스 구조로 재현 가능한 배포 모델을 갖추고 있습니다. 이를 바탕으로 실운영 환경에서는 환경 분리, 보안 강화, 비용 제어, 리전/이식성 관리까지 확장해 나갈 수 있습니다.
