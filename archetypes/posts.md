{{- if eq .File.BaseFileName "_index" -}}
+++
title = "{{ .File.ContentBaseName | humanize }}"
description = ""
weight = 10
color = ""   # 카테고리 색 (#e10600 같은 hex). 비우면 상위 카테고리 색을 따릅니다.
badge = ""   # 카드·칩에 쓰는 짧은 약어. 비우면 제목 앞 3글자.
+++
{{- else -}}
+++
title = "{{ replace .File.ContentBaseName "-" " " | title }}"
date = "{{ .Date }}"   # 미래 날짜로 적으면 그날 00:05(KST) 자동 빌드 때 발행됩니다.
draft = true
tags = []          # 기존 태그와 대소문자까지 똑같이 (DP, BOJ …)
description = ""   # 비우면 본문 앞부분으로 요약을 만듭니다.
thumbnail = ""     # 대표 이미지 (예: "images/cover.png"). 비우면 글 폴더의 첫 이미지.
+++

<!-- 이미지: 글 폴더(index.md 옆)의 images/ 에 넣고 ![설명](images/파일.png) 로 넣으세요. -->
<!-- 다른 글 링크: [제목](../다른-글/index.md) 처럼 .md 파일 경로로 쓰면 글 주소로 바뀝니다. -->
<!-- 수식: $...$ (인라인), $$...$$ (블록). 수식 안 한글도 됩니다 ($N명$). 달러 기호 자체는 \$ 로 씁니다. -->
<!-- 소제목 속 수식은 목차 · 휠 표시에 "O(n²)" 처럼 글자로 나오지만 앵커 주소(#…)에서는 빠집니다. 링크할 소제목이면 앵커를 직접: ## 복잡도 $O(n^2)$ {#complexity} -->
<!-- 콜아웃: > [!NOTE] / [!TIP] / [!IMPORTANT] / [!WARNING] / [!CAUTION] -->
{{- end }}
