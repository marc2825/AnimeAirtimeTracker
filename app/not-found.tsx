import Link from "next/link";

import { ButtonLink } from "@/components/ui/controls";
import { EmptyState } from "@/components/ui/primitives";

export default function NotFound() {
  return (
    <div className="container-narrow">
      <EmptyState
        title="ページが見つかりません"
        icon="search"
        action={
          <ButtonLink href="/schedule" variant="primary">
            番組表へ
          </ButtonLink>
        }
      >
        URLが変わったか、対象範囲外の作品・枠の可能性があります。<Link href="/search" className="inline-link">検索</Link>から探してください。
      </EmptyState>
    </div>
  );
}
