/** 첫 실행/미지원 브라우저용 샘플 노트. 폴더 없이 지도·목록·에디터를 체험할 수 있다. */
import { parseNote, type LocationNote } from '@geogiseo/core';

const samples: Array<{ path: string; md: string }> = [
  {
    path: '2026-04-05-남산-벚꽃.md',
    md: `---
title: 남산 벚꽃
location: [37.5512, 126.9882]
captured_at: 2026-04-05T14:20:00+09:00
place: 남산공원
tags: [산책, 봄]
---
벚꽃이 절정. 케이블카 줄이 길다.`,
  },
  {
    path: '2026-04-05-경복궁.md',
    md: `---
title: 경복궁 나들이
location: [37.5796, 126.9770]
captured_at: 2026-04-05T11:00:00+09:00
place: 경복궁
tags: [궁궐, 나들이]
---
수문장 교대식 구경.`,
  },
  {
    path: '2026-05-01-북촌.md',
    md: `---
title: 북촌 한옥마을
location: [37.5826, 126.9830]
captured_at: 2026-05-01T16:00:00+09:00
place: 북촌
tags: [산책]
---
골목이 예쁘다. 조용히 다니기.`,
  },
  {
    path: '2026-06-10-여의도-한강.md',
    md: `---
title: 여의도 한강공원
location: [37.5285, 126.9327]
captured_at: 2026-06-10T19:30:00+09:00
place: 여의도한강공원
tags: [한강, 저녁]
---
노을이 좋았다. 라면 먹음.`,
  },
];

export function sampleNotes(): LocationNote[] {
  return samples.map((s) => parseNote(s.md, s.path));
}
