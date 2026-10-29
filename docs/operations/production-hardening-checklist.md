# MVP 운영 강화 체크리스트

이 문서는 OrgMate를 "혼자 쓰는 실 운영 상태"로 끌어올리기 위해 최소한으로 넣어야 할 보안·운영·비용 가드레일을 정리한 문서입니다. 핵심 원칙은 "기능을 유지하면서, 운영을 가능한 한 단순하게"입니다.

## 1. 기본 운영 기준

- [ ] Key Vault에 시크릿 저장
- [ ] Function App는 Managed Identity만 사용
- [ ] 관리자 API는 Entra ID 기반 접근 제어
- [ ] Azure Monitor 및 Application Insights 기본 경보 구성
- [ ] Blob lifecycle 정책 적용
- [ ] 월 비용 상한 설정
- [ ] 데이터 보존 정책 문서화

## 2. 보안 체크리스트

- [ ] 코드 저장소에 민감 정보 없음
- [ ] `AzureWebJobsStorage`와 데이터 서비스 연결은 관리 ID 사용
- [ ] `disableLocalAuth` 준수 여부 점검
- [ ] 최소 권한 RBAC 적용
- [ ] 관리자 페이지는 인증 필요
- [ ] 주요 시크릿은 Key Vault로 이동

## 3. 운영 체크리스트

- [ ] health endpoint 매일 확인
- [ ] Function App 로그 확인
- [ ] Queue backlog 확인
- [ ] OpenAI / Speech 호출 실패 여부 점검
- [ ] 중요 알림이 켜져 있는지 확인
- [ ] 실패 세션 재처리 절차 준비
- [ ] 최근 배포 전후 로그 비교

## 4. 비용 체크리스트

- [ ] 월 예산 상한 설정
- [ ] OpenAI 호출량 상한 확인
- [ ] Blob 사용량 확인
- [ ] Log Analytics 데이터 용량 점검
- [x] 오래된 오디오와 결과물의 보관 기간 정책 확인 (오디오 30일, 전사·정리본 1년, 운영 절차서 6장)

## 5. MVP 모범사례

다음 항목은 단일 사용자 운영에서도 우선적으로 추천됩니다.

- Key Vault + Managed Identity
- Blob lifecycle + soft delete
- Application Insights 경보
- 월 예산 알림
- 관리자 권한 분리
- 운영 Runbook 문서화

## 6. 확장 시점

아래 조건이 생기면 다음 단계로 한 번에 확장합니다.

- 사용자 수 3명 이상
- 팀 단위 접근 권한 관리 필요
- 보관 기간이 늘거나 규정 준수 필요
- 네트워크 격리 요구
- 다중 환경(dev/test/prod) 분리가 필요한 경우

## 7. 추천 순서

1. Key Vault 이전
2. 관리자 보호 강화
3. 경보 및 월 예산 설정
4. 보관 정책 검토
5. Private Endpoint 및 네트워크 보강 검토

이 문서는 “실 운영을 시작해도 과하게 복잡하지 않은 수준”을 목표로 합니다. 필요할 때마다 항목을 추가해 확장해 나가면 됩니다.
