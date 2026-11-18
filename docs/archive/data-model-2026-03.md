# データモデル案

- Title
- Airing
- Channel
- Region
- Slot
- Company
- Person
- TitleStaff
- TitleGenre
- SequelRelation
- SourceRecord

重要:
- Airing は実日時刻とアニメ文脈時刻を持つ
- Slot は Title の属性ではなく独立エンティティ
- 補完前提の項目は nullable でよい