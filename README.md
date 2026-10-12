# junsshop-tracker

스마트스토어 **준스샵스** 판매 품목의 네이버 검색 추이와 쇼핑 검색 결과를 매일 아침 자동 수집하는 저장소입니다.
수집만 하고 분석은 하지 않습니다. 분석·보고서는 별도 에이전트가 이 저장소의 `data/`를 읽어 만듭니다.

## 수집 내용

| 폴더 | 출처 | 내용 |
|---|---|---|
| `data/trend/YYYY-MM-DD.json` | 네이버 데이터랩 검색어트렌드 API | 품목별(추적 검색어 묶음) 최근 30일 일간 ratio |
| `data/shop/YYYY-MM-DD.json` | 네이버 쇼핑 검색 API | 검색어별 정확도순 상위 최대 1,100개: `rank, title, lprice, mallName, productId, productType, link` |

- 날짜는 한국 시간(KST) 기준. 매일 06:30 KST에 실행됩니다 (`.github/workflows/collect.yml`).
- 추적 품목·검색어는 `config/keywords.json`에서 바꿉니다. 코드 수정 불필요.
- 데이터랩 ratio는 상대값입니다. 같은 요청(`requests[i]`)에 묶인 품목끼리만 크기 비교가 가능합니다.
- 쇼핑 검색 순번(`rank`)은 API 정확도순 기준이라 네이버쇼핑 화면 순위와 다를 수 있습니다.

## 설정 (최초 1회)

### 1. 네이버 API 키 발급
1. https://developers.naver.com/apps/#/register 접속 → 네이버 로그인
2. 애플리케이션 이름: 아무거나 (예: `junsshop-tracker`)
3. **사용 API**에서 두 개를 추가: **검색**, **데이터랩(검색어트렌드)**
4. 비로그인 오픈 API 서비스 환경: **WEB 설정** → 웹 서비스 URL에 `https://github.com` 입력
5. **등록하기** → 발급된 **Client ID**, **Client Secret** 복사

### 2. GitHub Secrets 등록
1. 이 저장소 → **Settings** → 왼쪽 **Secrets and variables** → **Actions**
2. **New repository secret** 클릭
   - Name: `NAVER_CLIENT_ID`, Secret: 복사한 Client ID → **Add secret**
   - 다시 **New repository secret** → Name: `NAVER_CLIENT_SECRET`, Secret: Client Secret → **Add secret**

### 3. 수동 실행으로 확인
1. 저장소 → **Actions** 탭 → 왼쪽 **collect** → 오른쪽 **Run workflow** → 초록 **Run workflow**
2. 1~2분 뒤 체크 표시가 뜨면 `data/trend/`, `data/shop/`에 오늘 날짜 파일이 생깁니다.

## 로컬 실행

```bash
NAVER_CLIENT_ID=... NAVER_CLIENT_SECRET=... node scripts/collect.js
```

## 호출량

- 쇼핑 검색: 검색어 11개 × 최대 11페이지 = 하루 약 121회 (한도 25,000회/일)
- 데이터랩: 하루 1회 (한도 1,000회/일)
