# junsshop-tracker

스마트스토어 **준스샵스** 판매 품목의 네이버 검색 추이와 쇼핑 검색 결과를 매일 아침 자동 수집하는 저장소입니다.
수집만 하고 분석은 하지 않습니다. 분석·보고서는 별도 에이전트가 이 저장소의 `data/`를 읽어 만듭니다.

## 수집 내용

| 폴더 | 출처 | 내용 | 상태 |
|---|---|---|---|
| `data/trend/YYYY-MM-DD.json` | NAVER API HUB 검색어트렌드 (네이버 클라우드 플랫폼) | 품목별(추적 검색어 묶음) 최근 30일 일간 ratio | 수집 중 |
| `data/shop/YYYY-MM-DD.json` | 네이버 개발자센터 쇼핑 검색 API | 검색어별 정확도순 상위 최대 1,100개 | **수집 불가** — 쇼핑 검색 API가 2026-07-31 종료됐고 대체 API 없음. `config/keywords.json`의 `shop.enabled=false` |

- 날짜는 한국 시간(KST) 기준. 매일 06:30 KST에 실행됩니다 (`.github/workflows/collect.yml`).
- 추적 품목·검색어는 `config/keywords.json`에서 바꿉니다. 코드 수정 불필요.
- 검색어트렌드 ratio는 상대값입니다. 같은 요청(`requests[i]`)에 묶인 품목끼리만 크기 비교가 가능합니다. 품목은 최대 5개까지 한 요청에 묶입니다.

## 설정 (최초 1회)

네이버 개발자센터(developers.naver.com)는 2026-07-31부로 검색·데이터랩 API 신규 발급을 끝냈습니다.
키는 **네이버 클라우드 플랫폼의 NAVER API HUB**에서 발급합니다. 현재 한시 무료이며, 검색어트렌드 호출 한도는 월 50,000회입니다.

### 1. NAVER API HUB 키 발급
1. https://console.ncloud.com 접속 → 네이버 클라우드 플랫폼 회원가입·로그인 (결제수단 등록을 요구하면 등록. 무료 기간이라 과금 없음)
2. 콘솔 왼쪽 위 **Services(전체 서비스)** → **Application Services** → **NAVER API HUB** 클릭
3. **Subscription**(이용 신청) 메뉴 → **신청하기** → 약관 확인 후 신청
4. **Application** 메뉴 → **Application 등록** 클릭
   - Application 이름: `junsshop-tracker`
   - 사용 API: **Data Lab > 검색어 트렌드** 체크 (쇼핑 인사이트는 선택 안 해도 됨)
   - **등록**
5. 목록에서 방금 만든 Application의 **인증 정보** 클릭 → **Client ID**, **Client Secret** 복사

### 2. GitHub Secrets 등록
1. 이 저장소 → **Settings** → 왼쪽 **Secrets and variables** → **Actions**
2. **New repository secret** 클릭
   - Name: `NAVER_CLIENT_ID`, Secret: 복사한 Client ID → **Add secret**
   - 다시 **New repository secret** → Name: `NAVER_CLIENT_SECRET`, Secret: Client Secret → **Add secret**

### 3. 수동 실행으로 확인
1. 저장소 → **Actions** 탭 → 왼쪽 **collect** → 오른쪽 **Run workflow** → 초록 **Run workflow**
2. 1~2분 뒤 체크 표시가 뜨면 `data/trend/`에 오늘 날짜 파일이 생깁니다.

## 로컬 실행

```bash
NAVER_CLIENT_ID=... NAVER_CLIENT_SECRET=... node scripts/collect.js
```

## 호출량

- 검색어트렌드: 하루 1회 (API HUB 한도 월 50,000회)
- 쇼핑 검색: 비활성 (API 종료)

## 참고

- [NAVER API HUB 개요 (네이버 클라우드 가이드)](https://guide.ncloud-docs.com/docs/apihub-overview)
- [개발자센터 → API HUB 이관 가이드](https://guide.ncloud-docs.com/docs/apihub-migration)
- [검색어 트렌드 API 명세](https://api.ncloud-docs.com/docs/naver-api-hub-search-trend)
