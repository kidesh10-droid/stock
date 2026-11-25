# 주식 투자 장부

`index.html` 하나로 동작하는 정적 페이지입니다.

## 실시간 시세 연결 (Cloudflare Pages)
GitHub Pages 주소에서는 브라우저가 야후 파이낸스에 직접 접속하지 못해 시세가 비어 있을 수 있습니다.
이 저장소를 Cloudflare Pages에 연결하면 `functions/api/chart.js`가 시세를 중계해 해결됩니다.

1. dash.cloudflare.com → Workers & Pages → Create → Pages → Connect to Git
2. 이 저장소(`stock`)를 선택, Framework preset은 None, Build command는 비워 두고 Build output directory는 `/` 로 둡니다.
3. Save and Deploy 후 나오는 `https://stock-xxx.pages.dev` 주소로 접속하면 별도 설정 없이 시세가 나옵니다.
   다른 주소(GitHub Pages)에서 쓰려면 설정 탭의 "시세 서버 주소"에 위 pages.dev 주소를 넣으세요.
