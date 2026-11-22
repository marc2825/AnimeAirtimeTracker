import Link from "next/link";
import { io } from "next/cache";

import { isDataStale } from "@/domain/freshness";
import { formatDateTime } from "@/lib/format";
import { getDatasetStatus } from "@/server/queries/status";

import styles from "./StaleNotice.module.css";

/**
 * Site-wide notice when ingestion has stopped: pages keep serving the last good data, and say how old it is.
 * Silent when the data is fresh; when the database cannot be read, the page itself reports the failure.
 */
export async function StaleNotice() {
  await io(); // request-time: never bake a build-time status into the shell
  const status = await getDatasetStatus().catch(() => null);
  if (!status || !isDataStale(status.lastSuccessAt)) return null;
  return (
    <div className={styles.notice} role="status">
      <p className={`container ${styles.inner}`}>
        <strong>データの更新が止まっています</strong>
        <span>
          {status.lastSuccessAt ? `最終更新 ${formatDateTime(status.lastSuccessAt)}。` : "まだ取得に成功していません。"}
          表示はその時点のデータで、その後の放送予定の変更は反映されていません。
        </span>
        <Link href="/status" className="inline-link">
          更新状況
        </Link>
      </p>
    </div>
  );
}
