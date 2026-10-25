# junsshop-tracker

스마트스토어 **준스샵스** 판매 품목의 네이버 검색 추이를 매일 아침 자동 수집하고, 상품 SEO(상품명·태그·검색 수요·노출 순위·경쟁 가격)를 분석하는 저장소입니다.

- 분석 결과(GitHub Pages): `docs/index.html` → 저장소 **Settings → Pages → Source: Deploy from a branch → Branch: main, 폴더 `/docs`** 로 켜면 `https://ukiahptc.github.io/junsshop-tracker/` 에서 봅니다
- 보고서(마크다운): `reports/seo/latest.md`

## 수집 내용

| 폴더 | 출처 | 내용 | 상태 |
|---|---|---|---|
| `data/trend/YYYY-MM-DD.json` | NAVER API HUB 검색어트렌드 (네이버 클라우드 플랫폼) | 품목별(추적 검색어 묶음) 최근 30일 일간 ratio | 수집 중 |
| `data/shop/YYYY-MM-DD.json` | 네이버 개발자센터 쇼핑 검색 API | 검색어별 정확도순 상위 최대 1,100개 | **수집 불가** — 쇼핑 검색 API가 2026-07-31 종료됐고 대체 API 없음. `config/keywords.json`의 `shop.enabled=false` |
| `data/shop/YYYY-MM-DD.json` | 네이버쇼핑 화면에서 **북마클릿**으로 캡처 (`docs/capture.html`) | 검색어별 상위 상품 제목·가격·판매처·순위 | 주 1회, 검색어당 클릭 1번 (아래 절차) |
| `data/manual/YYYY-MM-DD.csv` | 네이버쇼핑 화면을 보고 직접 입력 | 검색어·중량별 경쟁 가격(최대 10개), 우리 순위 | 북마클릿이 안 될 때의 대체 수단 |
| `reports/seo/`, `docs/index.html` | `scripts/seo-analyze.js` | SEO 분석 보고서·대시보드 | 매일 05:47 KST 자동 생성, 데이터·설정 변경 시에도 생성 |

- 날짜는 한국 시간(KST) 기준. 매일 05:17 KST에 실행됩니다(GitHub 예약 지연을 감안해 이른 시각) (`.github/workflows/collect.yml`).
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

## SEO 분석 (scripts/seo-analyze.js)

수동 입력 없이도 돌아갑니다. 있는 데이터만으로 분석하고, 없는 부분은 "캡처 없음"으로 표시합니다.

| 분석 | 입력 | 내용 |
|---|---|---|
| 상품명 진단 (100점) | `config/products.json` | 길이(15~50자), 특수문자, 홍보성 문구(무료배송·최저가·인기 등), 같은 단어 반복·유사 키워드 나열, 추적 검색어 포함 여부, 핵심 검색어 위치(앞 15자), 중량 표기 |
| 태그 진단 (100점) | `config/products.json` | 개수(10개), 특수문자·공백, 중복, 상품명과 중복, 상품명에 없는 추적 검색어 보완 여부 |
| 검색 수요 | `data/trend/` 최신 파일 | 품목별 30일 평균·최근 7일·직전 7일 대비 증감·묶음 내 점유율·최고점 |
| 노출 순위·경쟁 가격 | `data/shop/` 최신 파일 (없으면 `data/manual/`) | 검색어별 우리 순위, 같은 중량 경쟁 상품의 최저가·중간값, 우리 가격 위치, 순위 이력 |
| 상위 노출 키워드 | `data/shop/` | 상위 20개 상품명에 자주 쓰이는 단어와 우리 상품명에 없는 단어 |
| 조치 항목 | 위 전체 | 우선순위(높음·중간·낮음)·구분·대상·내용 표 |

### 1. 상품 등록 정보 입력 (최초 1회, 바뀔 때마다)
`config/products.json`에 스마트스토어에 등록한 **실제** 상품명·태그·카테고리·판매가를 적습니다. 처음 들어 있는 `title`은 예시입니다.

```json
{
  "name": "해남 호박고구마 호풍미 특상",      ← config/keywords.json의 품목 name과 같아야 함
  "title": "해남 호박고구마 호풍미 특상 3kg", ← 등록 상품명 그대로
  "tags": ["해남고구마", "호박고구마3kg"],    ← 등록 태그 (최대 10개)
  "category": "식품 > 농산물 > 고구마",
  "price": 14900,                            ← 판매가(원). 적으면 경쟁 가격 대비 위치 계산
  "elements": { "origin": "해남", "item": "호박고구마", "variety": "호풍미", "grade": "특상", "weight": "3kg" }
}
```
`elements`는 "원산지 품목 품종 등급 중량" 권장 구조를 만들 때 씁니다. 진단 기준(글자 수, 지양 문구 목록, 배점)은 `config/seo-rules.json`에서 바꿉니다.

### 2. 상품명 후보 빠르게 점검
```bash
node scripts/seo-analyze.js --title "해남 호박고구마 호풍미 특상 3kg"          # 1번 품목 기준
node scripts/seo-analyze.js --title "국내산 햇밤 2kg 알밤" --item 4           # 4번 품목 기준
```
파일을 만들지 않고 점수와 항목별 판정만 출력합니다.

### 3. 전체 분석
```bash
node scripts/seo-analyze.js
```
`reports/seo/날짜.md`, `reports/seo/latest.md`, `reports/seo/latest.json`, `docs/index.html`이 생깁니다. GitHub에서는 **Actions → seo**가 매일 05:47 KST와 `data/shop`·`data/manual`·`config`·`scripts` 변경 시 자동 실행되어 커밋합니다.

### 4. 광고 성과 (광고주센터 보고서, 로컬 전용)
광고주센터 → 보고서 → **소재** 보고서를 엑셀로 내려받아 `data/ads/소재_YYYY-MM-DD.xlsx`로 두고 `node scripts/seo-analyze.js --ads`를 실행하면 품목별 광고 상태·입찰가·품질지수·노출·클릭·비용·전환·ROAS가 보고서와 대시보드에 붙습니다.
광고비가 들어 있어 `data/ads/*.xlsx`는 `.gitignore`로 제외돼 있고, `--ads`로 만든 결과물은 커밋하지 마세요. 공개해도 괜찮다면 `.gitignore`의 해당 줄을 지우면 Actions에서도 포함됩니다.

## 경쟁 가격·우리 순위 캡처 (주 1회, 검색어당 클릭 1번)

쇼핑 검색 API가 없어졌지만 가격을 손으로 적지 않아도 됩니다. 네이버쇼핑 검색 결과 페이지에서 **북마클릿**(북마크에 저장한 작은 스크립트)을 클릭하면 화면의 상품 목록(제목·가격·판매처·순위)이 통째로 복사됩니다.

### 1. 북마클릿 등록 (최초 1회)
1. GitHub Pages를 켠 뒤 `https://ukiahptc.github.io/junsshop-tracker/capture.html` 접속 (Pages 전이면 `docs/capture.html`을 내려받아 브라우저로 열어도 됨)
2. **PC Chrome·Edge**: 파란 **준스샵 쇼핑 캡처** 버튼을 북마크바로 드래그 (북마크바 표시: `Ctrl+Shift+B`)
3. **아이폰 Safari**: 아무 페이지나 북마크 추가 → 북마크 편집 → 주소를 **코드 복사** 버튼으로 복사한 코드로 바꿔 저장

### 2. 검색어마다 캡처 (11개 ≈ 3~5분)
1. https://search.shopping.naver.com 에서 검색어 입력 (예: `호박고구마 3kg`) → 정렬 **네이버 랭킹순** 확인
2. 북마크 **준스샵 쇼핑 캡처** 클릭 → "n개 캡처, 클립보드에 복사됨"
3. `capture.html`의 3번 칸에 붙여넣기 → **추가**. 다음 검색어로 반복

### 3. 저장
- **JSON 내려받기** → 저장소 `data/shop/`에 업로드 (**Add file → Upload files → Commit changes**)
- 또는 `capture.html`의 "GitHub에 바로 저장"에 Fine-grained 토큰(이 저장소 Contents: Read and write)을 넣으면 업로드 없이 바로 커밋됩니다. 토큰은 그 브라우저에만 저장됩니다.
- 커밋되면 **Actions → seo**가 자동으로 돌아 순위·경쟁 가격·상위 노출 키워드를 분석합니다.

### 캡처가 안 될 때
- "0개 캡처"가 뜨면: 페이지를 한 번 스크롤해 상품이 로드된 뒤 다시 클릭. 그래도 안 되면 네이버 화면 구조가 바뀐 것이므로 `docs/capture.html`의 `bookmarklet()` 함수(`__NEXT_DATA__` 탐색과 DOM 추출 두 단계)를 손봐야 합니다.
- 판매처가 비어 우리 순위가 "없음"으로 나오면: `config/products.json`의 `store.name`(기본 "준스샵스")과 화면 표기가 같은지 확인. 다른 표기는 `store.aliases`에 추가.
- 임시 대안은 아래 수동 CSV 입력입니다.

## 경쟁 가격·우리 순위 수동 입력 (대체 수단)

쇼핑 검색 API가 없어졌으므로 네이버쇼핑 화면을 보고 CSV에 적습니다. 검색어 11개 = 11행(고구마는 3kg, 밤은 2kg 기준).
빈 행은 보고서에 "데이터 없음"으로 나갑니다. 5kg 비교가 필요해지면 `config/keywords.json`의 `weights`에 `"5kg"`을 추가하면 행이 생깁니다.

### 1. 빈 양식 만들기
1. 저장소 → **Actions** 탭 → 왼쪽 **manual** → **Run workflow** → 초록 **Run workflow**
2. 1분 뒤 `data/manual/오늘날짜.csv`가 생깁니다 (이미 있으면 그대로 둠)

### 2. 네이버쇼핑에서 값 읽기 (검색어 1개 기준)
1. https://shopping.naver.com 에서 검색어 입력 (예: `호박고구마 3kg`) → 정렬 **네이버 랭킹순** 확인
2. 위에서 **20개**까지 훑으며 제목의 중량이 우리 기준(고구마 3kg, 밤 2kg)과 같은 상품만 고릅니다
   - 중량이 다르거나(2kg, 500g, 10kg) 제목에서 읽을 수 없는 상품은 건너뜁니다
   - 묶음 표기(예: 1kg×3)는 합산 3kg으로 봅니다
3. 고른 상품의 **판매가**를 가격1, 가격2, … 칸에 순서대로 적습니다 (최대 10개, 배송비 제외)
   - **비교제외수**(선택): 2번에서 건너뛴 상품 개수. 예: 20개 중 3kg이 12개, 나머지 8개를 건너뛰었으면 `8`. 보고서의 "비교에서 뺀 상품 수"에만 쓰이므로 모르면 비워 둬도 됩니다
4. **준스샵스** 상품이 보이면 몇 번째인지 **우리순위**에 적습니다. 20개 안에 없으면 `21` 이상이면 그 숫자, 안 보이면 비워 둡니다
5. 특이사항(품절 표시, 행사가 등)은 **비고**

### 3. CSV 편집·저장
- **GitHub 웹에서 바로 편집(권장, 아이폰도 가능)**: 저장소에서 `data/manual/날짜.csv` 클릭 → 오른쪽 위 **연필(Edit)** → 숫자 입력 → **Commit changes** → **Commit changes**
- 또는 엑셀: 파일 내려받아 열기 → 입력 → **CSV UTF-8(쉼표로 분리)**로 저장 → GitHub에 업로드(**Add file → Upload files**)
- 숫자는 `12900`, `12,900`, `12,900원` 모두 됩니다

### 4. 검증
저장(커밋)하면 **Actions → manual**이 자동으로 돌아 숫자 오류를 잡습니다. 빨간 X가 뜨면 로그에 "n행 가격m: 숫자가 아님"처럼 위치가 나옵니다.
로컬에서는 `node scripts/manual-check.js`로 검색어·중량별 최저가·중간값을 미리 볼 수 있습니다.

주의: 여기서 적는 순위는 네이버쇼핑 **화면 랭킹순** 기준입니다. 구 API의 정확도순과는 기준이 다릅니다.

## 로컬 실행

```bash
NAVER_CLIENT_ID=... NAVER_CLIENT_SECRET=... node scripts/collect.js   # 트렌드 수집
node scripts/manual-template.js            # 오늘 날짜 빈 양식 생성
node scripts/manual-check.js               # 최근 수동 입력 CSV 검증·요약
node scripts/seo-analyze.js                # SEO 분석 → reports/seo, docs/index.html
node scripts/seo-analyze.js --title "상품명 후보"   # 상품명 후보만 점검
```

## 호출량

- 검색어트렌드: 하루 1회 (API HUB 한도 월 50,000회)
- 쇼핑 검색: 비활성 (API 종료)

## 참고

- [NAVER API HUB 개요 (네이버 클라우드 가이드)](https://guide.ncloud-docs.com/docs/apihub-overview)
- [개발자센터 → API HUB 이관 가이드](https://guide.ncloud-docs.com/docs/apihub-migration)
- [검색어 트렌드 API 명세](https://api.ncloud-docs.com/docs/naver-api-hub-search-trend)
