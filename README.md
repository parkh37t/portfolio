# Jaeha Park — Portfolio

Digital Business & Delivery Leader. Personal portfolio site.

**https://parkh37t.github.io/portfolio/**

## Layout

| Path | What it is |
| --- | --- |
| `index.html` | 메인 포트폴리오 (PC / Tablet / Mobile 반응형) |
| `archive.html` | 프로젝트 아카이브 39건 (2000–2027) |
| `resume.html` | A4 인쇄용 이력서 (브라우저에서 인쇄 → PDF 저장, 2페이지) |
| `assets/` | 폰트 · 이미지 · 스크립트. 파일명은 내용 해시라 셋 다 같은 파일을 공유한다 |
| `.nojekyll` | Pages가 Jekyll을 거치지 않고 트리를 그대로 서빙하게 한다 |

## Editing

세 HTML 파일이 소스 그 자체다. 빌드 단계도, 별도 원본도 없다 — 파일을 고치고
커밋해서 `main`에 푸시하면 GitHub Pages가 1~2분 안에 재배포한다.

인라인 스타일이 붙은 평범한 HTML이라 대부분의 수정은 해당 위치를 찾아 고치면 된다:

- **강조색** — 각 파일 `<style>` 안의 `:root{--accent:#1B44FE}`
- **본문 · 제목** — 마크업에 그대로 들어 있다
- **아카이브 항목** — `archive.html`에서 같은 모양의 블록이 반복된다
- **`<title>` · description · OG 태그** — 각 파일 `<head>` 상단

`{{ ... }}` 바인딩, `<image-slot>`, `sc-camel-on-click` 같은 속성은
`assets/`에 있는 런타임 스크립트가 처리한다. 마크업만 고칠 때는 신경 쓸 필요 없다.

### 로컬에서 확인하기

`file://`로 열면 스크립트가 동작하지 않으므로 정적 서버로 띄운다:

```sh
python3 -m http.server 8000
# http://localhost:8000/
```

### 이미지를 바꿀 때

`assets/`에 넣고 HTML에서 참조하면 된다. 파일명 해시는 규칙이 아니라 과거
빌드의 흔적이니 `hero.webp` 같은 평범한 이름을 써도 무방하다. 사진은 실제
표시 크기의 2배 정도로 줄이고 WebP로 저장하는 편이 좋다 — 원본 그대로 넣으면
페이지가 다시 무거워진다.

## History

이 사이트는 Claude Design 익스포트에서 출발했다. 익스포트는 폰트 · 이미지 ·
스크립트를 전부 base64로 HTML 안에 넣고 실행 시점에 풀어내는 자가압축
형식이라, `index.html` 하나가 11.9MB였고 같은 한글 폰트 서브셋 100여 개가 세
페이지에 각각 실려 캐시가 전혀 되지 않았다. 지금 구조는 그 익스포트를 풀어
에셋을 파일로 분리하고 페이지 간에 공유하도록 바꾼 결과다.

| | 익스포트 | 현재 |
| --- | --- | --- |
| `index.html` | 11.9 MB | 67 KB |
| `archive.html` | 4.3 MB | 38 KB |
| `resume.html` | 4.3 MB | 24 KB |
| 첫 로딩 (index, 캐시 없음) | ~12 MB | ~138 KB |

폰트는 `unicode-range`가 선언돼 있어 방문자가 실제로 쓰는 서브셋만 내려받고,
`assets/pretendard.css`로 분리돼 세 페이지가 한 번 받은 것을 재사용한다.

Claude Design 원본(`*.dc.html`)과 이를 정적 HTML로 변환하던 빌드 스크립트는 더
쓰지 않기로 해서 제거했다. 필요하면 히스토리에서 꺼낼 수 있다:

```sh
git show 79bd489 --stat                      # 최초 익스포트 임포트
git show 79bd489:'src/Park Jaeha Portfolio.dc.html' > portfolio.dc.html
git show 32c04cf:tools/unbundle.mjs > unbundle.mjs   # 변환 스크립트
```

`79bd489`의 번들 HTML 안에는 히어로 사진 3600×2400, 포트레이트 1463×1955
원본이 base64로 그대로 들어 있다 — 다른 크기로 다시 만들어야 할 때 쓴다.
