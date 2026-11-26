# 카카오톡 하락 알림 서버 (Cloudflare Worker)

5분마다 보유·후보 종목의 시세와 일봉(RSI, 20일선, 20일 저점)을 계산해서, 하락 기준(-10/-15/-20%) 또는 RSI 30 이하(과매도)에 닿으면 매수안(지정가 2분할, 수량, 목표가, 매수 후 평단)을 카카오톡 "나에게 보내기"로 알립니다. 같은 단계는 하루에 한 번만 보냅니다.

## 설치 순서
1. **카카오 개발자 앱**: https://developers.kakao.com → 애플리케이션 추가
   - 앱 키의 **REST API 키**를 복사
   - 카카오 로그인 → 활성화 ON, Redirect URI에 `https://<워커주소>/callback` 등록
   - 동의항목에서 **카카오톡 메시지 전송(talk_message)** 을 선택 동의로 설정
2. **Cloudflare**: Workers & Pages → Create → Worker → 이름 `stock-alert`
   - `alert.js` 내용을 붙여 넣고 배포
   - Settings → Triggers → Cron Triggers: `*/5 * * * *`
   - Storage & Databases → KV에서 네임스페이스를 만들고, Worker의 Bindings에 변수명 `KV`로 연결
   - Settings → Variables: `HOLD`(내 보유: `종목:수량:평단$`, 예 `SOXL:44.4:28.5,TQQQ:552:54.4`), `NEW`(신규 후보 종목, 예 `NVDA,TSLA,PLTR`), `WATCH`, `L1`,`L2`,`L3`, `BUDGET_KRW`, `TP`, `SEP`(따로 매수 권장 기준, 기본 -30), `FX`, `SITE_URL`
   - Secrets: `KAKAO_REST_KEY`, `ADMIN`(내가 정하는 긴 비밀번호), 필요하면 `KAKAO_CLIENT_SECRET`
3. 브라우저에서 `https://<워커주소>/auth?key=<ADMIN>` 접속 → 카카오 로그인 동의 → "연결 완료"
4. `https://<워커주소>/test?key=<ADMIN>` 로 테스트 메시지 확인
5. `https://<워커주소>/run?key=<ADMIN>` 은 현재 기준에 걸린 종목을 메시지를 보내지 않고 미리 보여 줍니다.

## 주의
- 리프레시 토큰은 약 2개월 유효하며 서버가 갱신할 때마다 연장됩니다. 한 달 넘게 꺼져 있으면 3번을 다시 하세요.
- 보유 종목은 `WATCH` 변수에 직접 적어 두어야 합니다 (장부 페이지와 자동 연동되지 않습니다).
- 알림은 내가 정한 기준에 닿았다는 신호이며 투자 권유가 아닙니다.
