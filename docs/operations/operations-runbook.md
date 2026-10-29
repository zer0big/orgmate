# 운영 절차서 및 Runbook

## 1. 목적

이 문서는 OrgMate 운영 중 발생할 수 있는 장애, 알림, 배포 문제, 보안 이슈에 대한 표준 운영 절차를 제공합니다.

## 2. 운영 책임

### 개발/배포 담당

- 기능 배포
- 코드 검증
- 앱 구성 변경
- 배포 후 검증

### 운영 담당

- 이상 알림 대응
- 장애 분석
- 로그 점검
- 서비스 복구

### 보안/설계 담당

- RBAC 점검
- 네트워크 정책 점검
- 보관 정책 및 규정 준수 확인

## 3. 일상 운영 체크리스트

매일 또는 배포 직후 확인해야 하는 항목:

- Function App health 확인
- Application Insights 에러 추적 여부
- Storage 사용량 증가 및 용량 경고
- Queue 길이와 지연 확인
- OpenAI/Speech 호출 실패 여부
- Cosmos DB 상태 점검

## 4. 표준 장애 대응 절차

### 4.1 Function App 비정상

1. Function App 상태 확인
2. health endpoint 확인
3. Application Insights 로그 확인
4. 최근 배포 버전 비교
5. 설정 변경 여부 확인
6. 필요 시 롤백 또는 재배포

### 4.2 Blob 업로드 실패

1. Azure Storage 계정 상태 확인
2. SAS 또는 인증 상태 점검
3. 업로드 요청 로그 확인
4. 네트워크/권한 오류 여부 체크
5. 필요한 경우 재시도 및 파일 재업로드

### 4.3 전사 작업 지연 또는 실패

1. Queue 길이 확인
2. 함수 실행 로그 확인
3. Speech 자격 증명 및 quota 상태 점검
4. diarization 또는 phrase list 설정 오류 점검
5. 재시도 정책 점검

### 4.4 요약 실패

1. OpenAI endpoint 상태 확인
2. 템플릿 오류 확인
3. 모델 용량 및 quota 확인
4. 결과 파일 생성 실패 여부 점검
5. 실패 세션 재처리 실행 (4.5 참고)

### 4.5 실패 세션 재처리

전사·요약 큐는 `maxDequeueCount` 3회까지 재시도하고, 이후 `<큐 이름>-poison` 큐로 메시지를 옮기며 세션 상태를 `failed`로 기록합니다.

1. Application Insights에서 `traces | where message startswith "Transcription failed" or message startswith "Summarization failed"`로 원인을 확인합니다.
2. 원인(quota, 템플릿 오류, 권한 등)을 먼저 해결합니다.
3. 전사 단계 실패: 세션 소유자 계정으로 `POST /api/sessions/{id}/complete` (본문 `{"chunkCount": N}`)를 다시 호출하면 상태가 `uploaded`로 돌아가고 전사 작업이 재등록됩니다.
4. 요약 단계 실패: 앱에서 해당 세션의 요약을 다시 요청합니다.
5. 처리 후 poison 큐(`transcribe-jobs-poison`, `summarize-jobs-poison`)에 남은 메시지를 삭제합니다.

### 4.6 경보 목록

모든 경보는 `ORGMATE_ALERT_EMAIL`로 지정한 주소로 발송됩니다.

| 경보 | 조건 | 의미 |
| --- | --- | --- |
| `orgmate-function-failed-requests` | 15분 동안 실패한 HTTP 요청 5건 초과 | API 오류 급증 |
| `orgmate-pipeline-failures` | 15분 내 전사/요약 실패 로그 1건 이상 | 큐 작업 실패 (4.3, 4.4, 4.5 참고) |
| `orgmate-queue-backlog` | 1시간 평균 큐 메시지 5건 초과 | 작업 적체 또는 poison 메시지 누적 |
| 월 예산 (100 USD) | 80%, 100% 도달 | 비용 초과 방지 |

## 5. 배포 자동화 (GitHub Actions)

- `.github/workflows/ci.yml`: PR 및 `main` 푸시 시 API 빌드·테스트, 모바일 타입 검사, Bicep 컴파일을 실행합니다.
- `.github/workflows/deploy.yml`: 수동 실행(`workflow_dispatch`)으로 API를 `azd deploy api`로 배포합니다. GitHub OIDC 연동이 필요합니다.
  1. Entra 앱 등록에 federated credential(`repo:zer0big/orgmate:ref:refs/heads/main`)을 추가합니다.
  2. 해당 앱에 대상 리소스 그룹 `Contributor` 권한을 부여합니다.
  3. 저장소 Variables에 `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`, `AZURE_ENV_NAME`, `AZURE_LOCATION`, `AZURE_RESOURCE_GROUP`을 등록합니다.
- 인프라 변경(`azd provision`)과 모바일 APK 빌드(`eas build`)는 현재 수동으로 수행합니다.

## 6. 데이터 보관 및 개인정보 정책

| 데이터 | 보관 기간 | 자동 삭제 방식 |
| --- | --- | --- |
| 녹음 오디오 (`audio`) | 업로드 후 30일 | Blob 수명주기 규칙 `expire-recordings` |
| 전사본, 정리본 (`transcripts`, `artifacts`) | 마지막 수정 후 1년 | Blob 수명주기 규칙 `tier-transcripts-and-artifacts` |
| 세션 메타데이터 (Cosmos `sessions`) | 마지막 수정 후 1년 | Cosmos TTL(`defaultTtl`) |

운영 원칙:

- 사용자는 앱에서 언제든 세션을 즉시 영구 삭제할 수 있습니다.
- 관리자를 포함한 다른 사용자는 타인의 세션을 조회할 수 없습니다. 데이터는 사용자 ID로 분리됩니다.
- Blob 소프트 삭제(14일)와 버전 보관(30일)이 켜져 있어, 삭제된 Blob이 완전히 사라지기까지 최대 14일(버전은 30일)이 추가로 걸립니다.
- Cosmos 연속 백업은 7일 보관됩니다.
- 세션이 업로드 후 30일 넘게 전사되지 않으면 오디오가 삭제되어 재처리할 수 없습니다. 실패 세션은 이 기간 안에 재처리합니다(4.5 참고).
- 기간을 바꿀 때는 `storage.bicep`의 `audioRetentionDays`, `resultRetentionDays`, `cosmos.bicep`의 `sessionRetentionDays`를 수정해 배포합니다.
- 녹음 참석자 동의는 앱에서 별도로 받지 않고, 사용자 매뉴얼의 안내 문구로 사용자에게 고지합니다. 법적 요건이 커지면 앱 내 동의 화면을 추가합니다.

## 7. 보안 운영 절차

- 관리자/사용자 권한 분리
- 새 권한 부여 시 기록 및 리뷰
- 불필요한 secret/토큰 제거
- 로그에 민감 데이터 포함 여부 점검
- 접근 이력 추적

## 8. 비용 운영 절차

- 월별 리소스 사용량 점검
- queue backlog 증가 여부 확인
- Speech/OpenAI 호출량 급증 여부 확인
- Blob Lifecycle 관리 상태 점검
- 불필요한 테스트 데이터 정리

권장 비용 가드레일:

- 저장 용량 임계치 알림
- Request volume 알림
- Function 실행 시간 초과 경고
- OpenAI 비용 급증 알림

## 9. 백업 및 복구

### 백업

- 녹음 파일: Blob 기반 보존
- 세션 메타데이터: Cosmos DB 백업
- 템플릿/사용자 정의 리소스: 데이터베이스 구조 및 JSON 저장 방식 유지

### 복구

- 문제 발생 시 Blob에서 원본 재호출
- Cosmos DB에서 세션 상태 복원
- 재처리 위해 전사/요약 작업 다시 실행
- 상태가 전이면 재생성 가능해야 함

## 10. 로그 및 관측성

필수 로그 포인트:

- 요청 시작/종료
- 기능별 실행 시간
- 실패한 작업 ID
- 데이터 저장 성공/실패
- AI 호출 결과 요약

권장 알림:

- Function App 에러 비율
- Queue backlog
- API 5xx 비율
- Blob 저장 실패
- Speech/OpenAI 호출 실패

## 11. 변경 관리

모든 변경은 다음 절차를 따른다.

1. 변경 내용 정의
2. 로컬/테스트 환경 검증
3. 배포 전 체크리스트 통과
4. 프로덕션 단계 적용
5. 후속 모니터링 및 로그 검토

## 12. 롤백 절차

- 코드 롤백: 이전 배포 버전 재배포
- 설정 롤백: Bicep 또는 환경 파라미터 재적용
- 데이터 복구: Blob/Cosmos 백업 적용
- 작업 재시도: 실패 세션 재처리 수행

## 13. 운영 기준표

| 항목 | 기준 | 대응 원칙 |
| --- | --- | --- |
| health endpoint | 200 응답 유지 | 장애 시 즉시 진단 |
| Queue backlog | 정상 범위 유지 | 지연 시 재시도/분석 |
| Storage 사용량 | 예측 범위 내 | Lifecycle 및 정리 정책 |
| AI 호출 실패 | 0 또는 예외 감시 | 자동 재처리 |
| 보안 권한 | 최소 권한 유지 | 정기 검토 |

## 14. 결론

운영상 핵심은 장애를 조기에 감지하고, 로그와 메트릭으로 연결하며, 비용과 보안에 민감하게 대응하는 것입니다. 실제 운영 단계에서는 이 문서를 기준으로 알림, 재시도, 복구, 보관 정책까지 체계적으로 관리해야 합니다.
