"use client";

import { useEffect } from "react";

import { EmptyState } from "@/components/ui/primitives";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="container-narrow">
      {/* A failed render is not content: keep it out of search results (the status is already 200 once streaming). */}
      <meta name="robots" content="noindex" />
      <EmptyState
        title="ページを表示できませんでした"
        icon="alert"
        action={
          <button type="button" onClick={reset} style={{ height: "2.375rem", padding: "0 1rem", borderRadius: 6, border: "1px solid var(--color-line-strong)", background: "var(--color-surface-2)", fontWeight: 700 }}>
            再読み込み
          </button>
        }
      >
        一時的な問題の可能性があります。時間をおいて再度お試しください。{error.digest ? `（エラーID: ${error.digest}）` : null}
      </EmptyState>
    </div>
  );
}
