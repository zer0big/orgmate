# OrgMate 운영 매뉴얼

이 문서는 OrgMate의 Azure 기반 구조, WAF(Well-Architected Framework) 관점의 설계 근거, 배포 절차, 운영 절차, 보안·비용 가드레일, 그리고 향후 이식 및 확장 전략을 정리한 종합 운영 문서입니다.

## 문서 맵

- [아키텍처 개요](architecture/solution-architecture.md)
- [배포 및 이식 가이드](deployment/deployment-guide.md)
- [운영 절차서 및 Runbook](operations/operations-runbook.md)
- [MVP 운영 강화 체크리스트](operations/production-hardening-checklist.md)
- [사용자 매뉴얼](user-guide.md)

## 1. 제품 개요

OrgMate는 회의 음성을 녹음하고, Azure AI Speech로 전사하며, Azure OpenAI와 템플릿 기반 정리를 통해 회의록을 자동 생성하는 서버리스 워크플로우 애플리케이션입니다.

주요 흐름:

1. 모바일 사용자가 녹음을 업로드합니다.
2. API가 업로드 URL을 발급하고 Blob 저장소에 오디오를 저장합니다.
3. Azure Functions Queue 기반으로 전사 작업을 비동기 실행합니다.
4. 전사 결과와 용어 사전을 반영해 정리/요약을 수행합니다.
5. 최종 결과를 Blob, Cosmos DB, UI에서 조회/관리합니다.

## 2. 핵심 설계 원칙

### 2.1 WAF 관점

- 비용 최적화: 서버리스 기반, 비동기 처리, Blob 수명주기 관리, 필요 시만 호출
- 보안: Entra ID + Managed Identity, 로컬 인증 비활성화, SAS 최소화, 네트워크/권한 분리
- 신뢰성: ZRS 저장, Soft Delete, Queue 기반 재시도, 배치/실패 처리
- 운영 우수성: Bicep + azd 기반 IaC, 재현 가능한 배포, 모니터링 및 경보 체계
- 성능 효율성: 오디오 업로드 직전송, 비동기 처리, 전사/요약 독립 실행

## 3. 현재 Azure 구성

- 모바일 앱: Expo/React Native
- API 및 오케스트레이션: Azure Functions (Node.js + TypeScript)
- 데이터 저장: Azure Blob Storage (ZRS)
- 메타데이터: Azure Cosmos DB for NoSQL
- 음성 처리: Azure AI Speech
- 템플릿 요약: Azure OpenAI
- 관측성: Application Insights + Log Analytics

## 4. 운영 원칙

- 모든 프로덕션 환경은 IaC로 관리한다.
- 환경 변수와 시크릿은 코드 저장소에 직접 넣지 않는다.
- 데이터 저장 위치는 기본적으로 지역 내에서 유지한다.
- 신용/권한은 최소 권한 원칙을 따른다.
- 장애나 실패는 로그와 메트릭으로 추적 가능해야 한다.

## 5. 책임 경계

- 개발자: 기능 개발, 테스트, PR, 배포 실행
- 운영자: 알림 대응, 장애 대응, 로그 확인, 백업/복구 검증
- 보안/운영 담당자: 권한 검토, 위험 평가, 접근 통제, 정책 준수 점검

## 6. 향후 확장성

다음 단계에서 확장성을 확보할 수 있습니다.

- 지역 이중화 및 DR 전략
- Private Endpoint 기반 네트워크 강화
- Key Vault 연동과 시크릿 중앙화
- APIM 또는 AI Gateway 도입
- 사용자/조직 단위 권한 분리
- 전사/요약 품질 개선을 위한 모델 튜닝 및 평가 파이프라인

이 가이드와 문서를 기준으로 운영 환경을 확장하고, 단계별로 프로덕션 기준을 충족해 나갈 수 있습니다.
