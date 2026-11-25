# 주식 투자 장부

`index.html` 하나로 동작하는 정적 페이지입니다.

## 실시간 시세 연결 (Cloudflare Pages)
GitHub Pages 주소에서는 브라우저가 야후 파이낸스에 직접 접속하지 못해 시세가 비어 있을 수 있습니다.
이 저장소를 Cloudflare Pages에 연결하면 `functions/api/chart.js`가 시세를 중계해 해결됩니다.

1. dash.cloudflare.com → Workers & Pages → Create → Pages → Connect to Git
2. 이 저장소(`stock`)를 선택, Framework preset은 None, Build command는 비워 두고 Build output directory는 `/` 로 둡니다.
3. Save and Deploy 후 나오는 `https://stock-xxx.pages.dev` 주소로 접속하면 별도 설정 없이 시세가 나옵니다.
   다른 주소(GitHub Pages)에서 쓰려면 설정 탭의 "시세 서버 주소"에 위 pages.dev 주소를 넣으세요.

## 쿠팡 상품등록 서버 (선택)

`functions/api/coupang.js` 는 쿠팡 Open API 서명을 대신 해주는 서버입니다. 키는 코드나 페이지에 넣지 말고 Cloudflare Pages 의 환경변수(비밀값)로만 저장하세요.

1. Cloudflare Pages 프로젝트 → Settings → Variables and Secrets 에 아래 3개를 Secret 으로 추가
   - `COUPANG_ACCESS_KEY`, `COUPANG_SECRET_KEY` (쿠팡 윙 > 추가판매정보 > OPEN API 키 발급)
   - `ACCESS_CODE` (내가 정하는 접근 코드, 길게)
2. 배포 후 사이트의 쿠팡 탭 > 연결 설정에 서버 주소와 접근 코드를 입력
3. 쿠팡은 허용 IP 에서 온 요청만 받습니다. 윙의 OPEN API 설정에서 IP 제한이 걸려 있으면 Cloudflare 의 IP 는 고정이 아니라서 거절될 수 있습니다. 이 경우 고정 IP 가 있는 서버가 필요합니다.
